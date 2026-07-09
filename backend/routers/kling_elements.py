# ─────────────────────────────────────────────────────────────
# backend/routers/kling_fal.py
# Vídeo com Persona Fixa — usa o Kling 3.0 Pro (via fal.ai) com o
# recurso "Elements", que preserva identidade de rosto real entre
# gerações. Diferente do Seedance (nosso motor padrão), o Kling não
# tem a política de bloqueio de rosto humano real como referência —
# por isso serve pra manter a mesma influencer em vários vídeos.
#
# NOVO: depois que o Kling termina, o pipeline automaticamente manda
# o vídeo pro HeyGen Video Translation (modo "precision"), que
# retraduz o áudio pra PT-BR E RESSINCRONIZA A BOCA — resolve o
# problema de o Kling só gerar áudio nativo em inglês/chinês.
# O usuário não vê essa etapa extra: um único polling de status
# no frontend acompanha as duas fases (kling → dublagem).
#
# Motor SEPARADO de propósito — não mexe em nada do fluxo Seedance
# que já está validado e funcionando.
# ─────────────────────────────────────────────────────────────

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("kling_fal")

FAL_BASE = "https://queue.fal.run"
KLING_MODEL = "fal-ai/kling-video/v3/pro/image-to-video"
HEYGEN_BASE = "https://api.heygen.com"

# ─────────────────────────────────────────────────────────────
# Estado em memória por job. Guarda em qual FASE o job está
# ("kling" ou "dubbing") e as URLs/IDs de cada etapa.
# Em produção com múltiplos workers isso devia ir pro Redis/DB,
# mas resolve o diagnóstico e já funciona com 1 worker (WEB_CONCURRENCY=1).
# ─────────────────────────────────────────────────────────────
_job_state: dict[str, dict] = {}

# Cache do código de idioma PT-BR aceito pelo HeyGen — descoberto
# na primeira chamada via GET /v3/video-translations/languages,
# pra nunca chutar o nome exato ("Portuguese"? "Portuguese (Brazil)"? "pt"?).
_pt_language_code: Optional[str] = None


class GenerateKlingRequest(BaseModel):
    persona_image_url: str            # obrigatório — é o que mantém o rosto consistente
    product_image_url: Optional[str] = None  # opcional — pode ser só a persona, sem produto
    scene_prompt: str
    dialogue: str
    aspect_ratio: str = "9:16"
    duration: str = "10"


class KlingResponse(BaseModel):
    task_id: str
    status: str = "processing"


def _build_kling_prompt(req: GenerateKlingRequest) -> str:
    """Monta o prompt no formato que o Kling Elements espera —
    @Element1 (persona) e, se tiver produto, @Element2. Diálogo
    sempre entre aspas."""
    if req.product_image_url:
        subject = f"@Element1 segura o produto @Element2, {req.scene_prompt}"
    else:
        subject = f"@Element1, {req.scene_prompt}"
    return f'{subject}, e fala diretamente para a câmera: "{req.dialogue}"'


@router.post("/generate", response_model=KlingResponse)
async def generate_kling_persona(req: GenerateKlingRequest):
    """Envia a geração pra fila do fal.ai e retorna IMEDIATAMENTE com o
    request_id — consulta de status é separada (mesmo padrão do
    Seedance: polling em vez de esperar a geração inteira numa
    chamada só, que já sabemos que trava/estoura timeout)."""

    if not settings.fal_api_key:
        raise HTTPException(status_code=503, detail="FAL_API_KEY não configurada ainda no backend.")

    prompt = _build_kling_prompt(req)

    # Cada elemento precisa de frontal_image_url JUNTO com reference_image_urls
    # (ou, alternativamente, video_url) — o fal.ai rejeita frontal_image_url sozinho.
    # Como hoje só temos 1 foto por persona/produto, usamos a mesma imagem como
    # referência também. Quando tivermos múltiplos ângulos salvos, é só trocar
    # esse "[imagem]" por uma lista real de fotos adicionais.
    elements = [{
        "frontal_image_url": req.persona_image_url,
        "reference_image_urls": [req.persona_image_url],
    }]
    if req.product_image_url:
        elements.append({
            "frontal_image_url": req.product_image_url,
            "reference_image_urls": [req.product_image_url],
        })

    payload = {
        # Campo obrigatório no nível raiz — é o frame inicial do vídeo,
        # separado dos "elements" (que servem só pra manter identidade consistente).
        # Usamos a foto da persona como ponto de partida.
        "start_image_url": req.persona_image_url,
        "prompt": prompt,
        "elements": elements,
        "duration": req.duration,
        # O áudio nativo do Kling só sai em inglês/chinês mesmo com prompt em
        # PT-BR (o modelo traduz sozinho antes de gerar a fala). Como a etapa
        # de dublagem HeyGen vai substituir esse áudio e resincronizar a boca,
        # não faz sentido pagar pelo áudio caro do Kling (~$0,336/s) só pra
        # jogar fora depois. Deixamos ligado mesmo assim porque o HeyGen
        # Video Translation funciona melhor tendo uma fala de referência real
        # no vídeo de origem (pra alinhar timing/pausas) do que um vídeo mudo.
        "generate_audio": True,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{FAL_BASE}/{KLING_MODEL}",
            json=payload,
            headers={"Authorization": f"Key {settings.fal_api_key}"},
        )

        logger.info(f"[kling] POST /generate status={res.status_code} body={res.text}")

        if res.status_code not in (200, 201, 202):
            raise HTTPException(status_code=502, detail=f"Erro fal.ai (Kling): {res.text}")

        data = res.json()
        request_id = data.get("request_id")
        if not request_id:
            raise HTTPException(status_code=502, detail=f"fal.ai não retornou request_id: {data}")

        status_url = data.get("status_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{request_id}/status"
        response_url = data.get("response_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{request_id}"

        _job_state[request_id] = {
            "stage": "kling",
            "status_url": status_url,
            "response_url": response_url,
        }

        return KlingResponse(task_id=request_id, status="processing")


async def _resolve_pt_language(client: httpx.AsyncClient) -> str:
    """Descobre, uma vez só, qual string exata o HeyGen espera pra
    'português brasileiro' em output_languages. Guarda em cache."""
    global _pt_language_code
    if _pt_language_code:
        return _pt_language_code

    res = await client.get(
        f"{HEYGEN_BASE}/v3/video-translations/languages",
        headers={"x-api-key": settings.heygen_api_key},
    )
    logger.info(f"[heygen] GET /video-translations/languages http={res.status_code} body={res.text}")

    fallback = "Portuguese (Brazil)"
    if res.status_code != 200:
        logger.warning(f"[heygen] não consegui listar idiomas, usando fallback '{fallback}'")
        _pt_language_code = fallback
        return _pt_language_code

    data = res.json()
    # Formato exato da lista não confirmado ainda — tentamos alguns formatos comuns.
    candidates = data.get("data") or data.get("languages") or data
    if isinstance(candidates, list):
        for item in candidates:
            name = item if isinstance(item, str) else item.get("name") or item.get("language") or ""
            if "portu" in name.lower() and ("brazil" in name.lower() or "brasil" in name.lower() or "br" in name.lower()):
                _pt_language_code = name
                return _pt_language_code
        for item in candidates:
            name = item if isinstance(item, str) else item.get("name") or item.get("language") or ""
            if "portu" in name.lower():
                _pt_language_code = name
                return _pt_language_code

    logger.warning(f"[heygen] não achei 'Portuguese' na lista, usando fallback '{fallback}'")
    _pt_language_code = fallback
    return _pt_language_code


async def _start_heygen_dubbing(client: httpx.AsyncClient, video_url: str) -> str:
    """Dispara a tradução/dublagem no HeyGen (modo precision = resincroniza
    a boca com o novo áudio). Retorna o video_translation_id."""
    language = await _resolve_pt_language(client)

    payload = {
        "video": {"type": "url", "url": video_url},
        "output_languages": [language],
        "mode": "precision",  # resincroniza a boca — é o ponto principal disso tudo
        "title": "ClipForge - Persona Fixa PT-BR",
    }
    res = await client.post(
        f"{HEYGEN_BASE}/v3/video-translations",
        json=payload,
        headers={"x-api-key": settings.heygen_api_key, "Content-Type": "application/json"},
    )
    logger.info(f"[heygen] POST /video-translations status={res.status_code} body={res.text}")

    if res.status_code not in (200, 201, 202):
        raise RuntimeError(f"HeyGen retornou HTTP {res.status_code} ao iniciar dublagem: {res.text}")

    data = res.json()
    ids = data.get("data", {}).get("video_translation_ids", [])
    if not ids:
        raise RuntimeError(f"HeyGen não retornou video_translation_ids: {data}")

    return ids[0]


@router.get("/status/{task_id}")
async def get_kling_status(task_id: str):
    """Consulta o status do job. Cobre as DUAS fases automaticamente:
    1) geração no Kling (fal.ai)
    2) dublagem/resincronia labial no HeyGen (dispara sozinho quando a fase 1 termina)
    O frontend só precisa continuar dando polling nesse mesmo endpoint."""

    state = _job_state.get(task_id, {"stage": "kling"})
    stage = state.get("stage", "kling")

    async with httpx.AsyncClient(timeout=30) as client:

        # ─────────────────────────────────────────────────────
        # FASE 1 — Kling (fal.ai)
        # ─────────────────────────────────────────────────────
        if stage == "kling":
            status_url = state.get("status_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}/status"
            response_url = state.get("response_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}"

            status_res = await client.get(
                status_url,
                headers={"Authorization": f"Key {settings.fal_api_key}"},
            )
            logger.info(f"[kling] GET status task={task_id} http={status_res.status_code} body={status_res.text}")

            if status_res.status_code not in (200, 202):
                return {
                    "status": "error",
                    "error": f"fal.ai retornou HTTP {status_res.status_code} ao consultar status: {status_res.text}",
                }

            status_data = status_res.json()
            fal_status = status_data.get("status", "")

            if fal_status in ("ERROR", "FAILED"):
                return {"status": "error", "error": status_data.get("error", f"Erro no fal.ai: {status_data}")}

            if fal_status != "COMPLETED":
                # IN_QUEUE, IN_PROGRESS, etc.
                return {"status": "processing", "stage": "gerando_video", "video_url": None}

            # Kling terminou — busca o vídeo mudo/com áudio-fonte
            result_res = await client.get(
                response_url,
                headers={"Authorization": f"Key {settings.fal_api_key}"},
            )
            logger.info(f"[kling] GET result task={task_id} http={result_res.status_code} body={result_res.text}")

            if result_res.status_code != 200:
                return {
                    "status": "error",
                    "error": f"fal.ai retornou HTTP {result_res.status_code} ao buscar resultado: {result_res.text}",
                }

            result_data = result_res.json()
            kling_video_url = result_data.get("video", {}).get("url", "")
            if not kling_video_url:
                return {
                    "status": "error",
                    "error": f"fal.ai marcou como COMPLETED mas não veio video.url: {result_data}",
                }

            # Dispara a fase 2 automaticamente — dublagem + resync labial no HeyGen
            if not settings.heygen_api_key:
                # Sem chave HeyGen configurada: devolve o vídeo do Kling puro
                # (com áudio em inglês) em vez de travar o usuário sem nada.
                logger.warning("[heygen] HEYGEN_API_KEY não configurada — pulando dublagem, devolvendo vídeo do Kling puro")
                return {"status": "done", "video_url": kling_video_url, "warning": "Dublagem PT-BR pulada: HEYGEN_API_KEY ausente"}

            try:
                translation_id = await _start_heygen_dubbing(client, kling_video_url)
            except RuntimeError as e:
                logger.error(f"[heygen] falha ao iniciar dublagem: {e}")
                # Kling deu certo, só a dublagem falhou — devolve o vídeo original
                # em vez de jogar tudo fora.
                return {
                    "status": "done",
                    "video_url": kling_video_url,
                    "warning": f"Vídeo gerado, mas dublagem PT-BR falhou: {e}",
                }

            _job_state[task_id] = {
                "stage": "dubbing",
                "translation_id": translation_id,
                "kling_video_url": kling_video_url,
            }
            return {"status": "processing", "stage": "dublando_pt_br", "video_url": None}

        # ─────────────────────────────────────────────────────
        # FASE 2 — Dublagem/resync labial (HeyGen)
        # ─────────────────────────────────────────────────────
        elif stage == "dubbing":
            translation_id = state["translation_id"]
            trans_res = await client.get(
                f"{HEYGEN_BASE}/v3/video-translations/{translation_id}",
                headers={"x-api-key": settings.heygen_api_key},
            )
            logger.info(f"[heygen] GET status id={translation_id} http={trans_res.status_code} body={trans_res.text}")

            if trans_res.status_code != 200:
                return {
                    "status": "error",
                    "error": f"HeyGen retornou HTTP {trans_res.status_code} ao consultar dublagem: {trans_res.text}",
                }

            trans_data = trans_res.json().get("data", {})
            heygen_status = trans_data.get("status", "")

            if heygen_status == "failed":
                # Dublagem falhou — ainda temos o vídeo do Kling original como fallback.
                return {
                    "status": "done",
                    "video_url": state.get("kling_video_url"),
                    "warning": f"Dublagem PT-BR falhou ({trans_data.get('failure_message', 'motivo desconhecido')}), devolvendo vídeo original.",
                }

            if heygen_status != "completed":
                # pending ou running
                return {"status": "processing", "stage": "dublando_pt_br", "video_url": None}

            final_video_url = trans_data.get("video_url") or trans_data.get("url")
            if not final_video_url:
                return {
                    "status": "done",
                    "video_url": state.get("kling_video_url"),
                    "warning": f"HeyGen marcou completed mas não veio video_url, devolvendo vídeo original: {trans_data}",
                }

            return {"status": "done", "video_url": final_video_url}

        return {"status": "error", "error": f"Estado de job desconhecido: {stage}"}
