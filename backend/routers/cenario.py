# ─────────────────────────────────────────────────────────────
# backend/routers/cenario.py
# Geração de cenário via Kling AI — agora através da fal.ai
# ─────────────────────────────────────────────────────────────
#
# Por quê fal.ai em vez da Kling direto?
# A API direta da Kling (api-singapore.klingai.com) se mostrou instável
# em produção: tasks que ficavam presas em "processing" indefinidamente,
# e uma consulta de status que devolvia respostas com timestamp
# congelado (indício de cache num proxy no meio do caminho), mesmo com
# o vídeo sendo de fato processado e consumindo crédito do lado da Kling.
#
# fal.ai hospeda o mesmo modelo Kling atrás de uma API de fila própria,
# bem documentada e sem esses problemas de infraestrutura regional.
# O contrato exposto pro resto do projeto (POST /generate → GET /status)
# continua idêntico — o canvas.tsx não precisa de nenhuma mudança.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

FAL_QUEUE_URL = "https://queue.fal.run"

# Endpoint "standard" do Kling 1.6 na fal — bom equilíbrio de custo x
# qualidade pra cenário de fundo (não precisa do tier "master"/"pro",
# que é bem mais caro e voltado a cenas com protagonismo próprio).
# Documentação: https://fal.ai/models/fal-ai/kling-video/v1.6/standard/text-to-video/api
FAL_MODEL_ID = "fal-ai/kling-video/v1.6/standard/text-to-video"


def _fal_headers() -> dict:
    return {
        "Authorization": f"Key {settings.fal_api_key}",
        "Content-Type": "application/json",
    }


class GenerateCenarioRequest(BaseModel):
    prompt: str
    negative_prompt: str = "people, person, human, text, watermark, blurry, low quality"
    aspect_ratio: str = "9:16"  # Para vídeo vertical TikTok


class CenarioResponse(BaseModel):
    task_id: str
    status: str


class CenarioStatusResponse(BaseModel):
    task_id: str
    status: str  # "processing" | "done" | "error"
    video_url: str = ""
    error: str = ""


PROMPT_TEMPLATES = {
    "estudio": "Professional product photography studio, clean white background, soft natural lighting, minimalist aesthetic, high-end commercial photography",
    "lifestyle_urbano": "Modern urban lifestyle background, city street during golden hour, bokeh effect, professional photography",
    "praia": "Tropical beach sunset background, golden hour lighting, warm tones, professional photography, no people",
    "corporativo": "Modern corporate office background, clean desk, professional environment, soft lighting",
    "aesthetic": "Aesthetic pastel room background, soft pink and beige tones, minimalist decor, cozy atmosphere",
    "natureza": "Beautiful nature background, lush green forest, soft sunlight filtering through trees, serene atmosphere",
}


@router.get("/templates")
async def get_templates():
    """Retorna prompts pré-definidos de cenários."""
    return {"templates": [
        {"id": k, "label": v.split(",")[0].strip(), "prompt": v}
        for k, v in PROMPT_TEMPLATES.items()
    ]}


@router.post("/generate", response_model=CenarioResponse)
async def generate_cenario(req: GenerateCenarioRequest):
    """Submete o job de vídeo na fila da fal.ai e retorna IMEDIATAMENTE
    com o request_id (status='processing'). O frontend consulta
    /cenario/status/{task_id} em polling até o vídeo terminar — mesmo
    padrão já usado no heygen.py."""

    enriched_prompt = f"{req.prompt}, professional product video background, high quality, cinematic, no people, no text, static camera, subtle ambient movement"

    payload = {
        "prompt": enriched_prompt,
        "negative_prompt": req.negative_prompt,
        "duration": "5",
        "aspect_ratio": req.aspect_ratio,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{FAL_QUEUE_URL}/{FAL_MODEL_ID}",
            headers=_fal_headers(),
            json=payload,
        )

        if res.status_code not in (200, 201):
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro fal.ai: {res.text}"
            )

        data = res.json()
        request_id = data.get("request_id", "")

        if not request_id:
            raise HTTPException(status_code=500, detail="fal.ai não retornou request_id")

        return CenarioResponse(task_id=request_id, status="processing")


@router.get("/status/{task_id}", response_model=CenarioStatusResponse)
async def get_cenario_status(task_id: str):
    """Consulta o status na fila da fal.ai. Quando status == COMPLETED,
    busca o resultado final (video_url) numa segunda chamada — é assim
    que a API de fila da fal.ai funciona (status e resultado são
    endpoints separados)."""

    status_url = f"{FAL_QUEUE_URL}/{FAL_MODEL_ID}/requests/{task_id}/status"

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(status_url, headers=_fal_headers())

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro ao verificar status na fal.ai: {res.text}"
            )

        data = res.json()
        fal_status = data.get("status", "")

        if fal_status == "COMPLETED":
            result_url = f"{FAL_QUEUE_URL}/{FAL_MODEL_ID}/requests/{task_id}"
            result_res = await client.get(result_url, headers=_fal_headers())

            if result_res.status_code != 200:
                return CenarioStatusResponse(
                    task_id=task_id,
                    status="error",
                    error=f"Erro ao buscar resultado final: {result_res.text}",
                )

            result_data = result_res.json()
            video_url = result_data.get("video", {}).get("url", "")

            if not video_url:
                return CenarioStatusResponse(
                    task_id=task_id,
                    status="error",
                    error="fal.ai retornou COMPLETED mas sem video_url",
                )

            return CenarioStatusResponse(
                task_id=task_id,
                status="done",
                video_url=video_url,
            )

        if fal_status in ("IN_QUEUE", "IN_PROGRESS"):
            return CenarioStatusResponse(task_id=task_id, status="processing")

        # Status desconhecido ou de erro (ex: "FAILED")
        return CenarioStatusResponse(
            task_id=task_id,
            status="error",
            error=f"fal.ai retornou status inesperado: {fal_status}",
        )
