# ─────────────────────────────────────────────────────────────
# backend/services/studio/editor_agent.py
# Agente 9 — Edição e export
# Monta o vídeo final com Shotstack + gera SEO com GPT-4o-mini
# APIs: Shotstack, OpenAI GPT-4o-mini
# ─────────────────────────────────────────────────────────────

import httpx
import openai
import asyncio
import json
from config import get_settings
from services.shared.storage_service import upload_video, upload_image

settings = get_settings()
openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

SHOTSTACK_API = "https://api.shotstack.io/v1"


async def generate_seo(script: dict, style: str) -> dict:
    """Gera título, descrição, tags e thumbnail prompt via GPT-4o-mini."""
    title = script.get("title", "")
    hook = script.get("hook", "")
    scenes_text = " ".join([s.get("narration", "")[:100] for s in script.get("scenes", [])[:3]])

    prompt = f"""Você é um especialista em SEO para YouTube.

VÍDEO: {title}
ESTILO: {style}
GANCHO: {hook}
CONTEÚDO: {scenes_text}

Gere em JSON:
{{
  "youtube_title": "título otimizado para YouTube (máx 60 chars, com palavra-chave)",
  "youtube_description": "descrição completa (400-500 chars) com palavras-chave naturais",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "thumbnail_prompt": "prompt em inglês para gerar thumbnail épica no Midjourney/DALL-E"
}}

Responda APENAS com o JSON.
"""

    res = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=800,
    )

    return json.loads(res.choices[0].message.content)


async def render_with_shotstack(
    clips: list[dict],
    audios: list[dict],
    music_url: str,
    captions: list[dict],
    project_id: str,
) -> str:
    """
    Monta e renderiza o vídeo final via Shotstack.
    Retorna a URL do vídeo renderizado.
    """
    # Ordena por número de cena
    clips_sorted = sorted(clips, key=lambda x: x["scene_number"])
    audios_sorted = sorted(audios, key=lambda x: x["scene_number"])

    # Monta timeline do Shotstack
    video_clips = []
    audio_clips = []
    caption_clips = []
    current_time = 0.0

    for clip, audio in zip(clips_sorted, audios_sorted):
        duration = 10.0  # duração padrão de cada clipe Runway

        # Clipe de vídeo
        video_clips.append({
            "asset": {"type": "video", "src": clip["video_url"]},
            "start": current_time,
            "length": duration,
            "fit": "cover",
        })

        # Clipe de narração
        audio_clips.append({
            "asset": {"type": "audio", "src": audio["audio_url"], "volume": 1},
            "start": current_time,
            "length": duration,
        })

        current_time += duration

    # Trilha de música de fundo (volume baixo)
    music_track = {
        "asset": {"type": "audio", "src": music_url, "volume": 0.15},
        "start": 0,
        "length": current_time,
    }

    # Monta o JSON do Shotstack
    timeline = {
        "soundtrack": {"src": music_url, "effect": "fadeOut", "volume": 0.15},
        "tracks": [
            {"clips": video_clips},
            {"clips": audio_clips},
        ],
    }

    output = {
        "format": "mp4",
        "resolution": "hd",
        "fps": 25,
    }

    headers = {
        "x-api-key": settings.shotstack_api_key,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Envia para render
        res = await client.post(
            f"{SHOTSTACK_API}/render",
            headers=headers,
            json={"timeline": timeline, "output": output},
        )
        res.raise_for_status()
        render_id = res.json().get("response", {}).get("id")

        if not render_id:
            raise Exception("Shotstack não retornou render_id")

        print(f"[Agente 9 — Editor] Render iniciado: {render_id}")

        # Polling até render completar
        for attempt in range(60):
            await asyncio.sleep(15)

            poll = await client.get(
                f"{SHOTSTACK_API}/render/{render_id}",
                headers=headers,
            )
            poll.raise_for_status()
            data = poll.json().get("response", {})
            status = data.get("status")

            print(f"[Agente 9 — Editor] Render status: {status} (tentativa {attempt + 1})")

            if status == "done":
                return data.get("url")
            elif status == "failed":
                raise Exception(f"Shotstack falhou: {data.get('error')}")

    raise Exception("Timeout no render do Shotstack")


async def run(
    clips: list[dict],
    audios: list[dict],
    music_url: str,
    captions: list[dict],
    script: dict,
    project_id: str,
) -> dict:
    """
    Agente final — edita, renderiza e gera SEO em paralelo.
    Retorna dict com video_url, thumbnail_url e seo_data.
    """
    print(f"[Agente 9 — Editor] Iniciando edição final")

    # Roda render e SEO em paralelo
    render_task = render_with_shotstack(clips, audios, music_url, captions, project_id)
    seo_task = generate_seo(script, "documentary")

    video_url, seo_data = await asyncio.gather(render_task, seo_task)

    result = {
        "video_url": video_url,
        "thumbnail_url": None,  # gerado separadamente se necessário
        "seo_data": seo_data,
    }

    print(f"[Agente 9 — Editor] Concluído! Vídeo: {video_url}")
    return result
