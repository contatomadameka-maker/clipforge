# ─────────────────────────────────────────────────────────────
# backend/services/studio/research_agent.py
# Agente 1 — Pesquisa (ou "Análise de referência", no modo Link)
#
# Dois modos:
#   run(topic, language)              → modo normal, pesquisa o tema na web (Tavily)
#   run_from_reference(url, language) → modo NOVO, analisa um vídeo de
#                                        referência em vez de pesquisar
#
# No modo referência, NUNCA baixamos o vídeo/imagens pra reusar no
# resultado final — só transcrevemos o áudio (pra entender a estrutura
# narrativa) e olhamos alguns frames (pra descrever o ESTILO visual em
# palavras). Os arquivos baixados/extraídos são temporários e apagados
# no final da função — nada deles chega no vídeo gerado, só a análise
# em texto.
# ─────────────────────────────────────────────────────────────
import base64
import os
import subprocess
import tempfile
from typing import Optional

import anthropic
import httpx
import yt_dlp

from config import get_settings

settings = get_settings()
anthropic_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def run(topic: str, language: str = "pt-BR") -> dict:
    """
    Recebe o tema do vídeo e retorna um dict com:
    - sources: lista de fontes encontradas
    - summary: resumo consolidado do contexto
    - facts: fatos relevantes para o roteiro
    """
    print(f"[Agente 1 — Pesquisa] Iniciando para: {topic}")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": topic,
                    "search_depth": "advanced",
                    "include_answer": True,
                    "include_raw_content": False,
                    "max_results": 10,
                    "include_domains": [],
                    "exclude_domains": [],
                },
            )
            res.raise_for_status()
            data = res.json()
        sources = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
                "score": r.get("score", 0),
            }
            for r in data.get("results", [])
        ]
        result = {
            "sources": sources,
            "summary": data.get("answer", ""),
            "total_sources": len(sources),
            "query": topic,
        }
        print(f"[Agente 1 — Pesquisa] Concluído: {len(sources)} fontes coletadas")
        return result
    except httpx.HTTPError as e:
        print(f"[Agente 1 — Pesquisa] Erro HTTP: {e}")
        raise Exception(f"Falha na pesquisa Tavily: {str(e)}")
    except Exception as e:
        print(f"[Agente 1 — Pesquisa] Erro: {e}")
        raise


# ── Modo "Link de referência" ──────────────────────────────────

def _extract_ydl_info(url: str) -> dict:
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def _pick_audio_url(info: dict) -> Optional[str]:
    formats = info.get("formats") or []
    audio_only = [f for f in formats if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")]
    if audio_only:
        return max(audio_only, key=lambda f: f.get("abr") or 0).get("url")
    with_audio = [f for f in formats if f.get("acodec") not in (None, "none")]
    if with_audio:
        # sem faixa só-áudio disponível — pega o formato com vídeo+áudio
        # de MENOR tamanho, só pra não baixar um arquivo gigante à toa
        # (só precisamos do áudio pra transcrever).
        return min(with_audio, key=lambda f: f.get("filesize") or f.get("filesize_approx") or 10**12).get("url")
    return info.get("url")


def _pick_video_url(info: dict) -> Optional[str]:
    """Pega uma URL de vídeo (com imagem) só pra EXTRAIR FRAMES de
    análise — não baixamos o arquivo inteiro, o ffmpeg lê direto da URL
    remota. Prioriza uma resolução média (nem a menor, nem a maior) —
    suficiente pra analisar estilo, sem gastar banda à toa."""
    formats = info.get("formats") or []
    with_video = [f for f in formats if f.get("vcodec") not in (None, "none") and f.get("url")]
    if not with_video:
        return info.get("url")
    by_height = sorted(with_video, key=lambda f: f.get("height") or 0)
    return by_height[len(by_height) // 2].get("url")


async def _download_audio(url: str, dest_path: str):
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        async with client.stream("GET", url) as res:
            res.raise_for_status()
            with open(dest_path, "wb") as f:
                async for chunk in res.aiter_bytes():
                    f.write(chunk)


async def _transcribe_audio(audio_path: str) -> str:
    """Transcreve o áudio via API do Whisper (OpenAI) — mesma API já
    usada pelo Agente 8 (Legendas)."""
    async with httpx.AsyncClient(timeout=180) as client:
        with open(audio_path, "rb") as f:
            res = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={"file": (os.path.basename(audio_path), f, "audio/mp4")},
                data={"model": "whisper-1"},
            )
        res.raise_for_status()
        return res.json().get("text", "")


def _extract_frames(video_url: str, duration_seconds: float, workdir: str, count: int = 4) -> list[str]:
    """Extrai `count` frames igualmente espaçados AO LONGO do vídeo,
    direto da URL remota (o ffmpeg não baixa o arquivo inteiro, só lê
    até o timestamp pedido) — usados só pra ANALISAR o estilo visual em
    palavras (composição, iluminação, tipo de plano). Ficam num diretório
    temporário que é apagado assim que a função termina; nenhum desses
    frames é reaproveitado no vídeo final."""
    frame_paths = []
    for i in range(count):
        timestamp = max(1.0, duration_seconds * (i + 1) / (count + 1))
        out_path = os.path.join(workdir, f"frame_{i}.jpg")
        try:
            subprocess.run([
                "ffmpeg", "-y", "-ss", str(timestamp), "-i", video_url,
                "-frames:v", "1", "-q:v", "3", out_path,
            ], check=True, capture_output=True, timeout=60)
            if os.path.exists(out_path):
                frame_paths.append(out_path)
        except Exception as e:
            print(f"[Agente 1 — Análise de referência] falhou extraindo frame em {timestamp}s: {e}")
    return frame_paths


async def _analyze_visual_style(frame_paths: list[str]) -> str:
    """Manda os frames pro Claude com visão, pede uma DESCRIÇÃO do
    estilo visual em palavras — não guarda nem devolve a imagem em si,
    só o texto da análise."""
    if not frame_paths:
        return ""
    content = []
    for path in frame_paths:
        with open(path, "rb") as f:
            b64 = base64.standard_b64encode(f.read()).decode("utf-8")
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
        })
    content.append({
        "type": "text",
        "text": (
            "Essas são cenas de um vídeo de referência. Descreva em detalhe "
            "o ESTILO VISUAL (tipo de plano/enquadramento, iluminação, "
            "paleta de cores, ritmo aparente, clima geral) de forma que "
            "outro criador consiga replicar esse ESTILO numa produção "
            "totalmente nova e original — não descreva o conteúdo "
            "específico das imagens (pessoas, objetos, lugares exatos), "
            "só o estilo e a técnica usados."
        ),
    })
    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{"role": "user", "content": content}],
    )
    return message.content[0].text.strip()


async def run_from_reference(url: str, language: str = "pt-BR") -> dict:
    """Modo 'Link de referência' do Agente 1 — em vez de pesquisar um
    tema na web, analisa um vídeo de referência: transcreve o áudio
    (pra entender a estrutura narrativa: gancho, ritmo, viradas) e
    analisa o estilo visual de alguns frames. Devolve o resultado no
    MESMO formato que `run()` (campo `summary` principalmente), pra o
    Agente 2 (Roteiro) usar sem precisar saber a origem."""
    print(f"[Agente 1 — Análise de referência] Iniciando para: {url}")
    try:
        info = _extract_ydl_info(url)
        duration_seconds = info.get("duration") or 60
        title = info.get("title", "")

        audio_url = _pick_audio_url(info)
        video_url = _pick_video_url(info)

        transcript = ""
        visual_style = ""
        with tempfile.TemporaryDirectory() as workdir:
            if audio_url:
                audio_path = os.path.join(workdir, "audio.m4a")
                try:
                    await _download_audio(audio_url, audio_path)
                    transcript = await _transcribe_audio(audio_path)
                except Exception as e:
                    print(f"[Agente 1 — Análise de referência] falhou transcrevendo áudio: {e}")

            if video_url:
                try:
                    frame_paths = _extract_frames(video_url, duration_seconds, workdir)
                    visual_style = await _analyze_visual_style(frame_paths)
                except Exception as e:
                    print(f"[Agente 1 — Análise de referência] falhou analisando estilo visual: {e}")

        if not transcript:
            raise Exception("Não consegui transcrever o áudio do vídeo de referência — confira se o link está certo e é público.")

        summary = (
            f'Estrutura narrativa extraída do vídeo de referência "{title}". '
            f"Use a transcrição abaixo SÓ pra identificar o gancho de abertura, "
            f"o ritmo, as viradas e a estrutura geral da narrativa — e escreva "
            f"um roteiro NOVO e ORIGINAL que siga essa MESMA estrutura, "
            f"SEM copiar frases, fatos específicos ou conteúdo literal do "
            f"original.\n\nTRANSCRIÇÃO DO VÍDEO DE REFERÊNCIA:\n{transcript[:6000]}"
        )

        result = {
            "sources": [],
            "summary": summary,
            "visual_style": visual_style,
            "reference_title": title,
            "reference_url": url,
            "total_sources": 0,
        }
        print("[Agente 1 — Análise de referência] Concluído")
        return result
    except Exception as e:
        print(f"[Agente 1 — Análise de referência] Erro: {e}")
        raise Exception(f"Falha ao analisar vídeo de referência: {str(e)}")
