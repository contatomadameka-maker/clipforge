# ─────────────────────────────────────────────────────────────
# backend/routers/cenario.py
# Geração de cenário/fundo via Kling AI (text-to-image)
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx
import asyncio

router = APIRouter()
settings = get_settings()

KLING_API_URL = "https://api.klingai.com"


class GenerateCenarioRequest(BaseModel):
    prompt: str
    negative_prompt: str = "blurry, low quality, watermark, text, people, person, human"
    width: int = 1080
    height: int = 1920
    bg_color: str = "#ffffff"


class GenerateCenarioResponse(BaseModel):
    task_id: str
    status: str


class CenarioStatusResponse(BaseModel):
    task_id: str
    status: str
    image_url: str = ""
    error: str = ""


@router.post("/generate", response_model=GenerateCenarioResponse)
async def generate_cenario(req: GenerateCenarioRequest):
    """Gera imagem de fundo/cenário via Kling AI."""

    # Enriquece o prompt para cenário de produto
    enriched_prompt = f"{req.prompt}, professional product photography background, high quality, 4K, cinematic lighting, no people, clean background"

    payload = {
        "model_name": "kling-v1",
        "prompt": enriched_prompt,
        "negative_prompt": req.negative_prompt,
        "image_count": 1,
        "image_ratio": "9:16",
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{KLING_API_URL}/v1/images/generations",
            headers={
                "Authorization": f"Bearer {settings.kling_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
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

        return GenerateCenarioResponse(task_id=task_id, status="processing")


@router.get("/status/{task_id}", response_model=CenarioStatusResponse)
async def get_cenario_status(task_id: str):
    """Verifica o status da geração do cenário."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{KLING_API_URL}/v1/images/generations/{task_id}",
            headers={"Authorization": f"Bearer {settings.kling_api_key}"},
            timeout=30,
        )

        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao verificar status")

        data = res.json().get("data", {})
        status = data.get("task_status", "processing")
        images = data.get("task_result", {}).get("images", [])
        image_url = images[0].get("url", "") if images else ""

        return CenarioStatusResponse(
            task_id=task_id,
            status=status,
            image_url=image_url,
        )


@router.post("/generate-and-wait")
async def generate_and_wait(req: GenerateCenarioRequest):
    """Gera cenário e aguarda conclusão (max 120s)."""

    # Inicia geração
    gen = await generate_cenario(req)
    task_id = gen.task_id

    # Polling até completar
    for _ in range(24):  # 24 x 5s = 120s max
        await asyncio.sleep(5)
        status = await get_cenario_status(task_id)
        if status.status == "succeed":
            return status
        if status.status == "failed":
            raise HTTPException(status_code=500, detail="Geração do cenário falhou")

    raise HTTPException(status_code=408, detail="Timeout aguardando cenário")
