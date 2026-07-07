# ─────────────────────────────────────────────────────────────
# backend/routers/videos.py
# Salva e lista os vídeos gerados pelo usuário (Seedance/canvas)
# ─────────────────────────────────────────────────────────────
#
# IMPORTANTE — precisa de 2 colunas novas na tabela `generated_videos`
# que ainda não existem no schema original do Brief:
#   ALTER TABLE generated_videos ADD COLUMN title text;
#   ALTER TABLE generated_videos ADD COLUMN type text DEFAULT 'tiktok';
# Sem isso, o insert abaixo vai dar o mesmo tipo de erro PGRST204 que
# já vimos antes (coluna inexistente).

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db.database import get_supabase
from typing import Optional

router = APIRouter()


class SaveVideoRequest(BaseModel):
    user_id: str
    title: str
    type: str = "tiktok"  # "tiktok" | "studio"
    video_url: str
    thumbnail_url: Optional[str] = None
    duration_seconds: int
    format: str = "9:16"
    credits_used: int
    status: str = "done"


@router.post("/save")
async def save_video(req: SaveVideoRequest):
    """Grava um vídeo gerado com sucesso na tabela generated_videos.
    Chamado pelo frontend assim que o polling do Seedance detecta
    status == 'done'."""
    db = get_supabase()
    result = db.table("generated_videos").insert({
        "user_id": req.user_id,
        "title": req.title,
        "type": req.type,
        "video_url": req.video_url,
        "thumbnail_url": req.thumbnail_url,
        "duration_seconds": req.duration_seconds,
        "format": req.format,
        "credits_used": req.credits_used,
        "status": req.status,
    }).execute()

    return {"id": result.data[0]["id"] if result.data else None}


@router.get("/{user_id}")
async def list_videos(user_id: str):
    """Lista os vídeos gerados pelo usuário, mais recentes primeiro."""
    db = get_supabase()
    result = (
        db.table("generated_videos")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"videos": result.data or []}
