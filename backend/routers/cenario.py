# ─────────────────────────────────────────────────────────────
# backend/routers/cenario.py
# Geração de cenário via Kling AI — agora através da Replicate
# ─────────────────────────────────────────────────────────────
#
# Histórico: a API direta da Kling se mostrou instável (tasks presas,
# cache estranho no status). Tentamos fal.ai como alternativa, mas a
# conta ficou bloqueada ("Admin lock") por causa de um problema no
# billing deles. Enquanto isso não resolve, usamos a Replicate — outro
# hub de modelos de IA, com API de predictions bem estabelecida e
# amplamente usada em produção.
#
# O contrato exposto pro resto do projeto (POST /generate → GET /status)
# continua idêntico — o canvas.tsx não precisa de nenhuma mudança.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

REPLICATE_API_URL = "https://api.replicate.com/v1"

# Tier "standard" (720p) do Kling 1.6 na Replicate — bom custo-benefício
# pra cenário de fundo, não precisa do tier "pro" (1080p, mais caro).
# Docs: https://replicate.com/kwaivgi/kling-v1.6-standard/api/schema
REPLICATE_MODEL = "kwaivgi/kling-v1.6-standard"


def _replicate_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.replicate_api_token}",
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
    """Cria uma prediction na Replicate e retorna IMEDIATAMENTE com o
    id (status='processing'). O frontend consulta /cenario/status/{task_id}
    em polling até o vídeo terminar — mesmo padrão já usado no heygen.py."""

    enriched_prompt = f"{req.prompt}, professional product video background, high quality, cinematic, no people, no text, static camera, subtle ambient movement"

    payload = {
        "input": {
            "prompt": enriched_prompt,
            "negative_prompt": req.negative_prompt,
            "aspect_ratio": req.aspect_ratio,
            "duration": 5,
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{REPLICATE_API_URL}/models/{REPLICATE_MODEL}/predictions",
            headers=_replicate_headers(),
            json=payload,
        )

        if res.status_code not in (200, 201):
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro Replicate: {res.text}"
            )

        data = res.json()
        prediction_id = data.get("id", "")

        if not prediction_id:
            raise HTTPException(status_code=500, detail="Replicate não retornou id da prediction")

        return CenarioResponse(task_id=prediction_id, status="processing")


@router.get("/status/{task_id}", response_model=CenarioStatusResponse)
async def get_cenario_status(task_id: str):
    """Consulta o status da prediction na Replicate. O frontend chama
    esse endpoint em polling (a cada ~5s) até status == 'done' ou
    'error' — mesmo padrão do GET /heygen/status/{video_id}."""

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{REPLICATE_API_URL}/predictions/{task_id}",
            headers=_replicate_headers(),
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro ao verificar status na Replicate: {res.text}"
            )

        data = res.json()
        replicate_status = data.get("status", "")

        if replicate_status == "succeeded":
            output = data.get("output", "")
            # A Replicate às vezes retorna uma URL string direto, às
            # vezes uma lista com uma URL dentro — trata os dois casos.
            video_url = output[0] if isinstance(output, list) and output else output

            if not video_url or not isinstance(video_url, str):
                return CenarioStatusResponse(
                    task_id=task_id,
                    status="error",
                    error="Replicate retornou succeeded mas sem output de vídeo válido",
                )

            return CenarioStatusResponse(
                task_id=task_id,
                status="done",
                video_url=video_url,
            )

        if replicate_status in ("starting", "processing"):
            return CenarioStatusResponse(task_id=task_id, status="processing")

        # "failed" ou "canceled"
        error_msg = data.get("error") or f"Replicate retornou status: {replicate_status}"
        return CenarioStatusResponse(
            task_id=task_id,
            status="error",
            error=str(error_msg),
        )
