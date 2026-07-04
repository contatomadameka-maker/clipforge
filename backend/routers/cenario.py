# ─────────────────────────────────────────────────────────────
# backend/routers/cenario.py
# Geração de cenário via Kling AI (text-to-image)
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx
import asyncio
import jwt
import time

router = APIRouter()
settings = get_settings()

KLING_API_URL = "https://api.klingai.com"


def get_kling_token() -> str:
    """Gera JWT token para autenticação no Kling AI."""
    # A key do Kling tem formato: AccessKeyID:AccessKeySecret
    parts = settings.kling_api_key.split(":")
    if len(parts) == 2:
        access_key_id, access_key_secret = parts
    else:
        # Se não tiver ":", usa a key diretamente como Bearer
        return settings.kling_api_key

    now = int(time.time())
    payload = {
        "iss": access_key_id,
        "exp": now + 1800,  # 30 min
        "nbf": now - 5,
    }
    token = jwt.encode(payload, access_key_secret, algorithm="HS256")
    return token


class GenerateCenarioRequest(BaseModel):
    prompt: str
    negative_prompt: str = "people, person, human, text, watermark, blurry, low quality"
    aspect_ratio: str = "9:16"  # Para vídeo vertical TikTok
    style: str = "photography"  # photography, anime, digital_art


class CenarioResponse(BaseModel):
    task_id: str
    status: str
    image_url: str = ""
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
    """Gera imagem de cenário via Kling AI e aguarda o resultado."""

    # Enriquece o prompt para cenário profissional de produto
    enriched_prompt = f"{req.prompt}, professional product video background, high quality, 4K, cinematic, no people, no text"

    headers = {
        "Authorization": f"Bearer {get_kling_token()}",
        "Content-Type": "application/json",
    }

    payload = {
        "model_name": "kling-v1-5",
        "prompt": enriched_prompt,
        "negative_prompt": req.negative_prompt,
        "n": 1,
        "aspect_ratio": req.aspect_ratio,
        "image_fidelity": 0.5,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        # Inicia geração
        res = await client.post(
            f"{KLING_API_URL}/v1/images/generations",
            headers=headers,
            json=payload,
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro Kling: {res.text}"
            )

        data = res.json()
        task_id = data.get("data", {}).get("task_id", "")

        if not task_id:
            raise HTTPException(status_code=500, detail="Kling não retornou task_id")

        # Polling até completar (max 90s)
        for attempt in range(18):
            await asyncio.sleep(5)

            status_res = await client.get(
                f"{KLING_API_URL}/v1/images/generations/{task_id}",
                headers=headers,
            )

            if status_res.status_code != 200:
                continue

            status_data = status_res.json().get("data", {})
            task_status = status_data.get("task_status", "processing")

            if task_status == "succeed":
                images = status_data.get("task_result", {}).get("images", [])
                image_url = images[0].get("url", "") if images else ""

                if not image_url:
                    raise HTTPException(status_code=500, detail="Imagem não gerada")

                return CenarioResponse(
                    task_id=task_id,
                    status="done",
                    image_url=image_url,
                )

            elif task_status == "failed":
                raise HTTPException(status_code=500, detail="Kling falhou ao gerar imagem")

        raise HTTPException(status_code=408, detail="Timeout aguardando cenário (90s)")
