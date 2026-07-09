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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

FAL_BASE = "https://queue.fal.run"
KLING_MODEL = "fal-ai/kling-video/v3/pro/image-to-video"


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

    elements = [{"frontal_image_url": req.persona_image_url}]
    if req.product_image_url:
        elements.append({"frontal_image_url": req.product_image_url})

    payload = {
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
        if res.status_code not in (200, 201, 202):
            raise HTTPException(status_code=502, detail=f"Erro fal.ai (Kling): {res.text}")

        data = res.json()
        request_id = data.get("request_id")
        if not request_id:
            raise HTTPException(status_code=502, detail=f"fal.ai não retornou request_id: {data}")

        return KlingResponse(task_id=request_id, status="processing")


@router.get("/status/{task_id}")
async def get_kling_status(task_id: str):
    """Consulta o status da geração na fila do fal.ai."""
    async with httpx.AsyncClient(timeout=30) as client:
        status_res = await client.get(
            f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}/status",
            headers={"Authorization": f"Key {settings.fal_api_key}"},
        )
        if status_res.status_code != 200:
            return {"status": "processing", "video_url": None}

        status_data = status_res.json()
        fal_status = status_data.get("status", "")

        if fal_status == "COMPLETED":
            result_res = await client.get(
                f"{FAL_BASE}/{KLING_MODEL}/requests/{task_id}",
                headers={"Authorization": f"Key {settings.fal_api_key}"},
            )
            result_data = result_res.json()
            video_url = result_data.get("video", {}).get("url", "")
            return {"status": "done", "video_url": video_url}

        if fal_status in ("ERROR", "FAILED"):
            return {"status": "error", "error": status_data.get("error", "Erro desconhecido no fal.ai")}

        # IN_QUEUE, IN_PROGRESS, etc.
        return {"status": "processing", "video_url": None}
