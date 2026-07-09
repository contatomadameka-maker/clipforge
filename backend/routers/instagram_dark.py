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


class ListReelsResponse(BaseModel):
    reels: List[ReelItem]
    next_max_id: Optional[str] = None


@router.get("/list-reels", response_model=ListReelsResponse)
async def list_reels(profile: str, max_id: Optional[str] = None):
    """Lista uma página de Reels de um perfil público. Pra pegar a próxima
    página, chama de novo passando o next_max_id que veio na resposta
    anterior — a HikerAPI pagina por cursor (max_id), não por quantidade
    pedida de uma vez (confirmado: amount não controla o tamanho real da
    página nesse endpoint, sempre volta ~12 por chamada)."""
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

        # 2) Busca uma página de reels — passa max_id só se veio (primeira
        # página não tem cursor ainda)
        params = {"user_id": user_id}
        if max_id:
            params["max_id"] = max_id

        reels_res = await client.get(
            f"{HIKERAPI_BASE}/v1/user/clips",
            params=params,
            headers={"x-access-key": settings.hikerapi_key},
        )
        if reels_res.status_code != 200:
            raise HTTPException(status_code=502, detail="Erro ao buscar Reels desse perfil.")

        items = reels_res.json()
        result = []
        for media in items:
            video_url = media.get("video_url", "")
            if not video_url:
                video_versions = media.get("video_versions") or []
                if video_versions:
                    video_url = video_versions[0].get("url", "")

            thumb_url = media.get("thumbnail_url", "")
            if not thumb_url:
                image_versions = media.get("image_versions2", {}).get("candidates") or []
                if image_versions:
                    thumb_url = image_versions[0].get("url", "")

            if video_url:
                result.append(ReelItem(
                    media_id=str(media.get("pk", "")),
                    video_url=video_url,
                    thumbnail_url=thumb_url,
                    views=media.get("play_count", 0) or 0,
                    duration_seconds=media.get("video_duration", 0) or 0,
                ))

        # O cursor pra próxima página é o pk do último item dessa página —
        # padrão comum de paginação por cursor em APIs desse tipo.
        next_max_id = result[-1].media_id if result else None

        print(f"[instagram-dark] página com {len(result)} reels, next_max_id={next_max_id}")
        return ListReelsResponse(reels=result, next_max_id=next_max_id)


class ProcessRequest(BaseModel):
    user_id: str
    video_urls: List[str]
    bar_text: Optional[str] = None
    bar_color: Optional[str] = None
    text_color: Optional[str] = None
    watermark_image_url: Optional[str] = None


class ProcessResponse(BaseModel):
    task_id: str


@router.post("/process", response_model=ProcessResponse)
async def process_reels(req: ProcessRequest, background_tasks: BackgroundTasks):
    """Roda o processamento em lote (download + faixa/molde + marca d'água)
    em segundo plano, dentro do próprio serviço web — sem precisar de um
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
        bar_text=req.bar_text,
        bar_color=req.bar_color,
        text_color=req.text_color,
        watermark_image_url=req.watermark_image_url,
    )
    return ProcessResponse(task_id=task_id)


@router.get("/status/{task_id}")
async def get_status(task_id: str):
    """Consulta o progresso do processamento em lote."""
    from tasks.instagram_dark_tasks import TASKS

    task = TASKS.get(task_id)
    if not task:
        # Task não encontrada — normalmente significa que o servidor
        # reiniciou (deploy novo, por exemplo) no meio do processamento
        # e perdeu o estado em memória. Antes isso ficava reportando
        # "processing" pra sempre; agora avisa que precisa tentar de novo.
        return {"status": "error", "progress": 0, "error": "Processamento perdido (o servidor pode ter reiniciado no meio do caminho). Tente processar de novo."}
    return task
