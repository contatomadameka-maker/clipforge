# ─────────────────────────────────────────────────────────────
# backend/routers/heygen.py
# Geração de vídeos com avatar via HeyGen API
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

HEYGEN_API_URL = "https://api.heygen.com"


class GenerateVideoRequest(BaseModel):
    avatar_id: str
    script: str
    voice_id: str = "6872a840c4194f42a7f8ce8aee47660c"  # Pedro Lima - Friendly (PT-BR)
    background_color: str = "#ffffff"
    width: int = 1080
    height: int = 1920
    product_image_url: str = ""


class GenerateVideoResponse(BaseModel):
    video_id: str
    status: str


class VideoStatusResponse(BaseModel):
    video_id: str
    status: str
    video_url: str = ""
    thumbnail_url: str = ""
    error: str = ""


@router.get("/avatars")
async def list_avatars():
    """Lista os avatares disponíveis na conta HeyGen."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v2/avatars",
            headers={"X-Api-Key": settings.heygen_api_key},
            timeout=60,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao buscar avatares")
        data = res.json()
        # Retorna só os campos essenciais
        avatars = [
            {
                "avatar_id": av["avatar_id"],
                "avatar_name": av["avatar_name"],
                "gender": av["gender"],
                "preview_image_url": av["preview_image_url"],
                "preview_video_url": av["preview_video_url"],
                "premium": av.get("premium", False),
            }
            for av in data.get("data", {}).get("avatars", [])
            if not av.get("premium", False)  # Só gratuitos
        ]
        return {"avatars": avatars}


@router.get("/voices")
async def list_voices():
    """Lista as vozes disponíveis."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v2/voices",
            headers={"X-Api-Key": settings.heygen_api_key},
            timeout=30,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao buscar vozes")
        data = res.json()
        voices = [
            {
                "voice_id": v["voice_id"],
                "name": v["name"],
                "language": v.get("language", ""),
                "gender": v.get("gender", ""),
                "preview_audio": v.get("preview_audio", ""),
            }
            for v in data.get("data", {}).get("voices", [])
            if "pt" in v.get("language", "").lower() or "portuguese" in v.get("language", "").lower()
        ]
        return {"voices": voices}


@router.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(req: GenerateVideoRequest):
    """Gera um vídeo com avatar falante via HeyGen."""

    # Monta o payload para HeyGen V2
    payload = {
        "video_inputs": [
            {
                "character": {
                    "type": "avatar",
                    "avatar_id": req.avatar_id,
                    "avatar_style": "normal",
                },
                "voice": {
                    "type": "text",
                    "input_text": req.script,
                    "voice_id": req.voice_id,
                },
                "background": {
                    "type": "color",
                    "value": req.background_color,
                },
            }
        ],
        "dimension": {
            "width": req.width,
            "height": req.height,
        },
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{HEYGEN_API_URL}/v2/video/generate",
            headers={
                "X-Api-Key": settings.heygen_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro HeyGen: {res.text}"
            )

        data = res.json()
        video_id = data.get("data", {}).get("video_id", "")

        if not video_id:
            raise HTTPException(status_code=500, detail="HeyGen não retornou video_id")

        return GenerateVideoResponse(video_id=video_id, status="processing")


@router.get("/status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str):
    """Verifica o status de um vídeo em geração."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v1/video_status.get?video_id={video_id}",
            headers={"X-Api-Key": settings.heygen_api_key},
            timeout=30,
        )

        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao verificar status")

        data = res.json().get("data", {})
        return VideoStatusResponse(
            video_id=video_id,
            status=data.get("status", "processing"),
            video_url=data.get("video_url", ""),
            thumbnail_url=data.get("thumbnail_url", ""),
            error=data.get("error", ""),
        )
