# ─────────────────────────────────────────────────────────────
# backend/routers/instagram_dark.py
# Instagram Dark — lista Reels de um perfil, baixa os selecionados
# e aplica capa nova + marca d'água em lote.
#
# IMPORTANTE — regras de uso que essa ferramenta deve deixar claras
# pro usuário (aplicadas no frontend, como aviso, não bloqueio automático):
# - NÃO baixar vídeos com rosto de outras pessoas (direito de imagem)
# - O vídeo (mesmo sem rosto) é trabalho autoral de terceiros — o
#   usuário assume o risco de reuso de conteúdo protegido
# - Essa ferramenta NÃO remove metadados do arquivo original — só
#   adiciona capa e marca d'água por cima do conteúdo baixado
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from config import get_settings
import httpx
import re

router = APIRouter()
settings = get_settings()

HIKERAPI_BASE = "https://api.hikerapi.com"


def extract_username(profile_url_or_username: str) -> str:
    """Aceita tanto um @username quanto uma URL completa do perfil."""
    text = profile_url_or_username.strip()
    match = re.search(r"instagram\.com/([A-Za-z0-9._]+)", text)
    if match:
        return match.group(1)
    return text.lstrip("@")


class ReelItem(BaseModel):
    media_id: str
    video_url: str
    thumbnail_url: str
    views: int = 0
    duration_seconds: float = 0


@router.get("/list-reels", response_model=List[ReelItem])
async def list_reels(profile: str, count: int = 24):
    """Lista os Reels mais recentes de um perfil público. count tem teto de
    100 por chamada (evita custo alto de uma vez só na HikerAPI)."""
    count = min(count, 100)
    username = extract_username(profile)

    if not settings.hikerapi_key:
        raise HTTPException(status_code=503, detail="HIKERAPI_KEY não configurada ainda no backend.")

    async with httpx.AsyncClient(timeout=30) as client:
        # 1) Resolve o username pro user_id interno do Instagram
        user_res = await client.get(
            f"{HIKERAPI_BASE}/v1/user/by/username",
            params={"username": username},
            headers={"x-access-key": settings.hikerapi_key},
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=404, detail="Perfil não encontrado ou privado.")
        user_data = user_res.json()
        user_id = user_data.get("pk") or user_data.get("id")

        # 2) Busca os reels desse usuário — endpoint correto é /v1/user/clips,
        # parâmetro de quantidade é "amount", e a resposta vem como uma lista
        # direta (não embrulhada em {"items": [...]})
        reels_res = await client.get(
            f"{HIKERAPI_BASE}/v1/user/clips",
            params={"user_id": user_id, "amount": count},
            headers={"x-access-key": settings.hikerapi_key},
        )
        if reels_res.status_code != 200:
            raise HTTPException(status_code=502, detail="Erro ao buscar Reels desse perfil.")

        items = reels_res.json()
        result = []
        for media in items:
            video_url = media.get("video_url", "")
            thumb_url = media.get("thumbnail_url", "")
            if video_url:
                result.append(ReelItem(
                    media_id=str(media.get("pk", "")),
                    video_url=video_url,
                    thumbnail_url=thumb_url,
                    views=media.get("play_count", 0) or 0,
                    duration_seconds=media.get("video_duration", 0) or 0,
                ))
        return result


class ProcessRequest(BaseModel):
    user_id: str
    video_urls: List[str]
    cover_image_url: Optional[str] = None
    watermark_image_url: Optional[str] = None


class ProcessResponse(BaseModel):
    task_id: str


@router.post("/process", response_model=ProcessResponse)
async def process_reels(req: ProcessRequest, background_tasks: BackgroundTasks):
    """Roda o processamento em lote (download + capa + marca d'água) em
    segundo plano, dentro do próprio serviço web — sem precisar de um
    worker Celery separado (economiza o custo de um serviço a mais no
    Render, viável pra uma ferramenta de uso ocasional como essa)."""
    from tasks.instagram_dark_tasks import run_batch_job, TASKS
    import uuid as _uuid

    task_id = _uuid.uuid4().hex
    TASKS[task_id] = {"status": "processing", "progress": 0, "videos": []}

    background_tasks.add_task(
        run_batch_job,
        task_id=task_id,
        user_id=req.user_id,
        video_urls=req.video_urls,
        cover_image_url=req.cover_image_url,
        watermark_image_url=req.watermark_image_url,
    )
    return ProcessResponse(task_id=task_id)


@router.get("/status/{task_id}")
async def get_status(task_id: str):
    """Consulta o progresso do processamento em lote."""
    from tasks.instagram_dark_tasks import TASKS

    task = TASKS.get(task_id)
    if not task:
        return {"status": "processing", "progress": 0}
    return task
