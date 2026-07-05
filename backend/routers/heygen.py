# ─────────────────────────────────────────────────────────────
# backend/routers/heygen.py
# Geração de vídeos com avatar via HeyGen API
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
from db.database import get_supabase  # ajuste o import se seu database.py expõe diferente
import httpx
from typing import Optional

router = APIRouter()
settings = get_settings()

HEYGEN_API_URL = "https://api.heygen.com"


class GenerateVideoRequest(BaseModel):
    avatar_id: str  # heygen_avatar_id (avatar público) OU talking_photo_id (avatar próprio)
    script: str
    voice_id: str = "6872a840c4194f42a7f8ce0aee47660c"  # Pedro Lima PT-BR
    # Fundo: usa imagem se tiver URL, senão cor sólida
    background_image_url: Optional[str] = None
    background_color: str = "#ffffff"
    width: int = 1080
    height: int = 1920
    # Opcional: se o frontend já sabe o tipo, pode mandar direto e pular a
    # consulta ao Supabase. Valores: "avatar" | "talking_photo"
    avatar_kind: Optional[str] = None


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
    """
    Biblioteca própria do ClipForge (tabela `avatars` no Supabase).
    Isso é o que o bloco Avatar do canvas deve consumir — inclui tanto os
    avatares fotorrealistas próprios (kind='heygen_photo') quanto qualquer
    avatar público da HeyGen que você tenha cadastrado manualmente
    (kind='heygen_public').
    """
    supabase = get_supabase()
    result = (
        supabase.table("avatars")
        .select("*")
        .eq("active", True)
        .execute()
    )
    avatars = [
        {
            "id": av["id"],
            "name": av["name"],
            "preview_url": av["preview_url"],
            "heygen_avatar_id": av["heygen_avatar_id"],
            "kind": av.get("kind", "heygen_public"),
            "language": av.get("language", ["pt-BR"]),
            "plan_required": av.get("plan_required", "starter"),
        }
        for av in (result.data or [])
    ]
    return {"avatars": avatars}


@router.get("/avatars/heygen-catalog")
async def list_heygen_public_catalog():
    """
    Catálogo bruto de avatares públicos da HeyGen — só pra uso administrativo
    (ex: escolher um avatar público pra cadastrar na sua biblioteca).
    Não é isso que o canvas do usuário final deve chamar.
    """
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


def _resolve_avatar_kind(avatar_id: str, hinted_kind: Optional[str]) -> str:
    """Descobre se o avatar_id recebido é um avatar público HeyGen ou um
    talking_photo (avatar fotorrealista próprio), consultando a tabela
    `avatars` quando o frontend não manda o kind explicitamente."""
    if hinted_kind in ("avatar", "talking_photo"):
        return hinted_kind

    supabase = get_supabase()
    result = (
        supabase.table("avatars")
        .select("kind")
        .eq("heygen_avatar_id", avatar_id)
        .limit(1)
        .execute()
    )
    if result.data:
        kind = result.data[0].get("kind", "heygen_public")
        return "talking_photo" if kind == "heygen_photo" else "avatar"

    # Fallback: se não achou na tabela, assume avatar público (comportamento antigo)
    return "avatar"


@router.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(req: GenerateVideoRequest):
    """Gera vídeo com avatar — usa imagem de cenário se disponível.
    Suporta tanto avatares públicos da HeyGen quanto photo avatars próprios
    (fotorrealistas) da biblioteca ClipForge."""

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

    kind = _resolve_avatar_kind(req.avatar_id, req.avatar_kind)

    if kind == "talking_photo":
        character = {
            "type": "talking_photo",
            "talking_photo_id": req.avatar_id,
        }
    else:
        character = {
            "type": "avatar",
            "avatar_id": req.avatar_id,
            "avatar_style": "normal",
        }

    payload = {
        "video_inputs": [
            {
                "character": character,
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

        # IMPORTANTE: a HeyGen retorna video_url/thumbnail_url como `None`
        # (não apenas "ausente") enquanto o vídeo ainda está processando.
        # `.get("campo", "padrão")` só usa o padrão quando a CHAVE não existe
        # — como ela existe com valor None, isso quebrava a validação do
        # Pydantic (esperava string, recebia None) e crashava esse endpoint
        # a cada poll, aparecendo no navegador como falso erro de CORS.
        error_field = data.get("error")
        return VideoStatusResponse(
            video_id=video_id,
            status=data.get("status") or "processing",
            video_url=data.get("video_url") or "",
            thumbnail_url=data.get("thumbnail_url") or "",
            error=error_field.get("message", "") if isinstance(error_field, dict) else (error_field or ""),
        )
