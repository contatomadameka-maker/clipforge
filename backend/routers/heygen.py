# ─────────────────────────────────────────────────────────────
# backend/routers/heygen.py
# Geração de vídeos com avatar via HeyGen API
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx
from typing import Optional

router = APIRouter()
settings = get_settings()

HEYGEN_API_URL = "https://api.heygen.com"


class GenerateVideoRequest(BaseModel):
    avatar_id: str
    script: str
    voice_id: str = "6872a840c4194f42a7f8ce0aee47660c"  # Pedro Lima PT-BR
    # Fundo: usa imagem se tiver URL, senão cor sólida
    background_image_url: Optional[str] = None
    background_color: str = "#ffffff"
    width: int = 1080
    height: int = 1920


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
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v2/avatars",
            headers={"X-Api-Key": settings.heygen_api_key},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao buscar avatares")
        data = res.json()
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
            if not av.get("premium", False)
        ]
        return {"avatars": avatars}


@router.get("/voices")
async def list_voices():
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v2/voices",
            headers={"X-Api-Key": settings.heygen_api_key},
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
            if "portuguese" in v.get("language", "").lower() or "pt" in v.get("language", "").lower()
        ]
        return {"voices": voices}


@router.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(req: GenerateVideoRequest):
    """Gera vídeo com avatar — usa imagem de cenário se disponível."""

    # Define o background
    if req.background_image_url:
        background = {
            "type": "image",
            "url": req.background_image_url,
        }
    else:
        background = {
            "type": "color",
            "value": req.background_color,
        }

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
                "background": background,
            }
        ],
        "dimension": {
            "width": req.width,
            "height": req.height,
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{HEYGEN_API_URL}/v2/video/generate",
            headers={
                "X-Api-Key": settings.heygen_api_key,
                "Content-Type": "application/json",
            },
            json=payload,
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
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{HEYGEN_API_URL}/v1/video_status.get?video_id={video_id}",
            headers={"X-Api-Key": settings.heygen_api_key},
        )

        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Erro ao verificar status")

        data = res.json().get("data", {})
        return VideoStatusResponse(
            video_id=video_id,
            status=data.get("status", "processing"),
            video_url=data.get("video_url", ""),
            thumbnail_url=data.get("thumbnail_url", ""),
            error=data.get("error", {}).get("message", "") if isinstance(data.get("error"), dict) else "",
        )
