# ─────────────────────────────────────────────────────────────
# backend/routers/facebook_dark.py
# Facebook Dark — lista vídeos de uma Página pública, via Apify
# (Actor scraper-engine/facebook-videos-scraper). Igual ao TikTok Dark,
# NÃO tem processamento próprio — os vídeos encontrados aqui alimentam
# o Editor em Massa (batch_editor.py), que já é agnóstico de origem.
#
# ⚠️ CAMPOS DE ENTRADA/SAÍDA DO ACTOR AINDA NÃO 100% CONFIRMADOS — a
# documentação completa (schema exato) não ficou clara na busca pública.
# Usamos o padrão mais comum entre os scrapers de Facebook da Apify
# (startUrls + resultsLimit) como melhor palpite fundamentado. O log
# vai mostrar a resposta crua pra ajustar rápido se vier diferente —
# mesmo padrão usado pra debugar Kling e TikTok.
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from config import get_settings
import httpx
import logging

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("facebook_dark")

APIFY_BASE = "https://api.apify.com/v2"
ACTOR_ID = "scraper-engine~facebook-videos-scraper"  # "/" vira "~" na URL da API


class VideoItem(BaseModel):
    media_id: str
    video_url: str
    thumbnail_url: str
    views: int = 0
    duration_seconds: float = 0
    title: str = ""


class ListVideosResponse(BaseModel):
    videos: List[VideoItem]


def _first_present(d: dict, *keys: str):
    """Tenta várias chaves possíveis (a documentação não deixou 100%
    claro o nome exato dos campos de saída) e devolve a primeira que
    tiver valor não-vazio."""
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


@router.get("/list-videos", response_model=ListVideosResponse)
async def list_videos(page_url: str, limit: int = 20):
    """Busca os vídeos mais recentes de uma Página pública do Facebook."""
    if not settings.apify_api_token:
        raise HTTPException(status_code=503, detail="APIFY_API_TOKEN não configurado ainda no backend.")

    payload = {
        "startUrls": [{"url": page_url.strip()}],
        "resultsLimit": max(1, min(limit, 100)),
    }

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{APIFY_BASE}/acts/{ACTOR_ID}/run-sync-get-dataset-items",
            params={"token": settings.apify_api_token},
            json=payload,
        )
        logger.info(f"[facebook-dark] run-sync-get-dataset-items http={res.status_code} body={res.text[:2000]}")

        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Erro ao buscar vídeos dessa página: {res.text[:500]}")

        items = res.json()
        if not isinstance(items, list):
            logger.error(f"[facebook-dark] resposta não é uma lista: {type(items)}")
            raise HTTPException(status_code=502, detail="Formato de resposta inesperado da Apify (não veio uma lista).")

        result = []
        for item in items:
            video_url = _first_present(item, "videoUrl", "video_url", "downloadUrl", "mediaUrl", "url")
            if not video_url:
                continue  # item sem vídeo (ex: foto/texto misturado no feed) — pula

            thumb_url = _first_present(item, "thumbnailUrl", "thumbnail_url", "thumbnail", "previewUrl") or ""
            views_raw = _first_present(item, "viewsCount", "views", "playCount", "video_view_count") or 0
            duration_raw = _first_present(item, "duration", "videoDuration", "durationSeconds") or 0
            media_id = str(_first_present(item, "id", "videoId", "postId", "facebookUrl") or "")
            title = _first_present(item, "title", "text", "caption", "description") or ""

            try:
                views = int(views_raw)
            except (ValueError, TypeError):
                views = 0
            try:
                duration = float(duration_raw)
            except (ValueError, TypeError):
                duration = 0.0

            result.append(VideoItem(
                media_id=media_id,
                video_url=video_url,
                thumbnail_url=thumb_url,
                views=views,
                duration_seconds=duration,
                title=title[:200],
            ))

        if not result and items:
            # A Actor devolveu algo, mas nada bateu com os nomes de campo
            # que tentamos — loga as chaves do primeiro item pra ajustar rápido.
            logger.error(f"[facebook-dark] nenhum vídeo reconhecido. Chaves do 1º item: {list(items[0].keys())}")
            raise HTTPException(status_code=422, detail=f"A página respondeu, mas não reconheci o formato do vídeo. Chaves recebidas: {list(items[0].keys())}")

        return ListVideosResponse(videos=result)
