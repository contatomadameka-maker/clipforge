# ─────────────────────────────────────────────────────────────
# backend/routers/kling_fal.py
# Vídeo com Persona Fixa — usa o Kling 3.0 Pro (via fal.ai) com o
# recurso "Elements", que preserva identidade de rosto real entre
# gerações. Diferente do Seedance (nosso motor padrão), o Kling não
# tem a política de bloqueio de rosto humano real como referência —
# por isso serve pra manter a mesma influencer em vários vídeos.
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

# ─────────────────────────────────────────────────────────────
# Guarda em memória o status_url / response_url que o fal.ai
# devolveu no POST inicial, pra NUNCA reconstruir a URL na mão.
# Isso evita o bug de montar um path que não bate com o que o
# fal realmente espera pra apps com subpath (ex: v3/pro/image-to-video).
# Em produção com múltiplos workers isso devia ir pro Redis/DB,
# mas resolve o diagnóstico e já funciona com 1 worker (WEB_CONCURRENCY=1).
# ─────────────────────────────────────────────────────────────
_job_urls: dict[str, dict] = {}


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
        "generate_audio": True,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{FAL_BASE}/{KLING_MODEL}",
            json=payload,
            headers={"Authorization": f"Key {settings.fal_api_key}"},
        )

        # LOG COMPLETO — precisamos ver exatamente o que o fal.ai devolveu,
        # incluindo status_url/response_url, pra nunca mais navegar às cegas.
        logger.info(f"[kling] POST /generate status={res.status_code} body={res.text}")

        if res.status_code not in (200, 201, 202):
            raise HTTPException(status_code=502, detail=f"Erro fal.ai (Kling): {res.text}")

        data = res.json()
        request_id = data.get("request_id")
        if not request_id:
            raise HTTPException(status_code=502, detail=f"fal.ai não retornou request_id: {data}")

        # Guarda as URLs reais devolvidas pelo fal, em vez de reconstruir na mão.
        # Se o fal não devolver esses campos (varia por modelo), cai no fallback
        # de reconstrução — mas agora sabemos, pelo log, se isso está acontecendo.
        status_url = data.get("status_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{request_id}/status"
        response_url = data.get("response_url") or f"{FAL_BASE}/{KLING_MODEL}/requests/{request_id}"

        _job_urls[request_id] = {
            "status_url": status_url,
            "response_url": response_url,
        }

        return KlingResponse(task_id=request_id, status="processing")


@router.get("/status/{task_id}")
async def get_kling_status(task_id: str):
    """Consulta o status da geração na fila do fal.ai."""

    urls = _job_urls.get(task_id)
    if not urls:
        # Job não está em memória (ex: backend reiniciou entre o generate e o poll).
        # Reconstrói como fallback, mas isso É um sintoma a observar nos logs.
        logger.warning(f"[kling] task_id {task_id} não encontrado em memória — reconstruindo URL")
        status_url = f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}/status"
        response_url = f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}"
    else:
        status_url = urls["status_url"]
        response_url = urls["response_url"]

    async with httpx.AsyncClient(timeout=30) as client:
        status_res = await client.get(
            status_url,
            headers={"Authorization": f"Key {settings.fal_api_key}"},
        )

        # LOG COMPLETO a cada poll — é isso que faltava pra saber a causa real.
        logger.info(f"[kling] GET status task={task_id} http={status_res.status_code} body={status_res.text}")

        if status_res.status_code != 200:
            # ANTES: engolia o erro e devolvia "processing" pra sempre.
            # AGORA: erro real do fal.ai vira erro real pro frontend,
            # em vez de ficar em loop até o timeout do cliente estourar.
            return {
                "status": "error",
                "error": f"fal.ai retornou HTTP {status_res.status_code} ao consultar status: {status_res.text}",
            }

        status_data = status_res.json()
        fal_status = status_data.get("status", "")

        if fal_status == "COMPLETED":
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
            video_url = result_data.get("video", {}).get("url", "")
            if not video_url:
                return {
                    "status": "error",
                    "error": f"fal.ai marcou como COMPLETED mas não veio video.url: {result_data}",
                }
            return {"status": "done", "video_url": video_url}

        if fal_status in ("ERROR", "FAILED"):
            return {"status": "error", "error": status_data.get("error", f"Erro no fal.ai: {status_data}")}

        # IN_QUEUE, IN_PROGRESS, etc. — status real e válido, segue esperando.
        return {"status": "processing", "queue_status": fal_status, "video_url": None}
