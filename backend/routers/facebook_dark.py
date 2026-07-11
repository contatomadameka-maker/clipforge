# ─────────────────────────────────────────────────────────────
# backend/routers/facebook_dark.py
# Facebook Dark — lista vídeos de uma Página pública do Facebook.
#
# Usa DOIS Actors da Apify em sequência, porque nenhum sozinho faz as
# duas coisas que precisamos:
#   1) DISCOVERY_ACTOR (apify/facebook-reels-scraper) — varre a página
#      inteira e descobre a lista de reels (views, thumbnail, duração,
#      link do post) — mas a URL de vídeo que ele devolve é um manifest
#      DASH cru (dash_manifest_xml_string), não um arquivo baixável direto.
#   2) RESOLVER_ACTOR (scraper-engine/facebook-videos-scraper) — recebe
#      UM link de vídeo por vez e devolve o arquivo MP4 baixável de
#      verdade (via lista "formats", estilo yt-dlp).
#
# Ou seja: descobre com o Actor 1, resolve cada um com o Actor 2.
# Isso custa mais chamadas de API (1 + N) que o ideal, mas é o único
# jeito de ter os dois: descoberta em massa E link de vídeo baixável.
#
# NÃO tem processamento próprio de propósito — os vídeos encontrados
# aqui alimentam o Editor em Massa (batch_editor.py), que já é
# agnóstico de origem.
# ─────────────────────────────────────────────────────────────

import asyncio
import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("facebook_dark")

APIFY_BASE = "https://api.apify.com/v2"
DISCOVERY_ACTOR = "apify~facebook-reels-scraper"          # descobre a lista de reels da página
RESOLVER_ACTOR = "scraper-engine~facebook-videos-scraper"  # resolve 1 link -> vídeo baixável

# Limita quantos vídeos resolvemos em paralelo por vez, pra não estourar
# rate-limit da Apify nem gastar crédito rápido demais num teste errado.
_RESOLVE_CONCURRENCY = 5


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
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


async def _discover_reels(client: httpx.AsyncClient, page_url: str, limit: int) -> list[dict]:
    """Etapa 1 — varre a página e devolve a lista crua de reels (com
    metadado + link do post, mas SEM vídeo baixável ainda)."""
    payload = {
        "startUrls": [{"url": page_url.strip()}],
        "resultsLimit": max(1, min(limit, 100)),
    }
    res = await client.post(
        f"{APIFY_BASE}/acts/{DISCOVERY_ACTOR}/run-sync-get-dataset-items",
        params={"token": settings.apify_api_token},
        json=payload,
    )
    logger.info(f"[facebook-dark] discovery http={res.status_code} body={res.text[:2000]}")
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Erro ao buscar vídeos dessa página: {res.text[:500]}")

    items = res.json()
    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail="Formato de resposta inesperado da Apify na etapa de busca (não veio uma lista).")
    return items


async def _resolve_video_url(client: httpx.AsyncClient, share_url: str) -> Optional[str]:
    """Etapa 2 — resolve UM link de reel/vídeo pro arquivo MP4 baixável
    de verdade, usando o mesmo Actor/lógica que já validamos funcionando
    (formato estilo yt-dlp, campo 'formats')."""
    try:
        res = await client.post(
            f"{APIFY_BASE}/acts/{RESOLVER_ACTOR}/run-sync-get-dataset-items",
            params={"token": settings.apify_api_token},
            json={"urls": [share_url]},
        )
        if res.status_code not in (200, 201):
            logger.warning(f"[facebook-dark] resolve falhou ({res.status_code}) pra {share_url}: {res.text[:300]}")
            return None
        items = res.json()
        if not items or not isinstance(items, list):
            return None
        item = items[0]
        formats = item.get("formats") or []
        video_formats = [f for f in formats if f.get("url") and f.get("vcodec") and f.get("vcodec") != "none"]
        chosen = max(video_formats, key=lambda f: f.get("tbr") or 0) if video_formats else None
        if not chosen and formats and formats[0].get("url"):
            chosen = formats[0]
        return (chosen or {}).get("url")
    except Exception as e:
        logger.warning(f"[facebook-dark] erro ao resolver {share_url}: {e}")
        return None


@router.get("/list-videos", response_model=ListVideosResponse)
async def list_videos(page_url: str, limit: int = 20):
    """Busca os vídeos mais recentes de uma Página pública do Facebook —
    descobre a lista (Actor 1) e resolve cada link pro vídeo baixável
    (Actor 2), em paralelo com limite de concorrência."""
    if not settings.apify_api_token:
        raise HTTPException(status_code=503, detail="APIFY_API_TOKEN não configurado ainda no backend.")

    async with httpx.AsyncClient(timeout=120) as client:
        raw_items = await _discover_reels(client, page_url, limit)

        # Monta a lista de metadado (sem vídeo ainda) a partir do que a
        # etapa de descoberta já devolveu — esses campos já confirmamos
        # testando que existem de verdade.
        parsed = []
        for idx, item in enumerate(raw_items):
            video_obj = item.get("video") or {}
            share_url = _first_present(item, "shareable_url", "topLevelReelUrl") or (
                (item.get("if_should_change_url_for_reels") or {}).get("shareable_url")
            )
            if not share_url:
                continue  # sem link nenhum pra resolver — pula

            thumb_url = (video_obj.get("first_frame_thumbnail") if isinstance(video_obj, dict) else None) or ""
            views_raw = _first_present(item, "playCountRounded", "play_count_reduced") or 0
            duration_ms = (video_obj.get("playable_duration_in_ms") if isinstance(video_obj, dict) else None) or 0
            media_id = str((video_obj.get("id") if isinstance(video_obj, dict) else None) or f"fb_{idx}")
            title = _first_present(item, "text", "title", "caption", "description") or ""

            parsed.append({
                "share_url": share_url,
                "thumbnail_url": thumb_url,
                "views": int(views_raw) if views_raw else 0,
                "duration_seconds": (duration_ms / 1000) if duration_ms else 0.0,
                "media_id": media_id,
                "title": title[:200],
            })

        if not parsed:
            logger.error(f"[facebook-dark] etapa de descoberta não achou nenhum link de reel. 1º item bruto: {raw_items[0] if raw_items else 'lista vazia'}")
            return ListVideosResponse(videos=[])

        # Etapa 2 — resolve os vídeos em paralelo, com limite de
        # concorrência (evita rate-limit e explosão de custo simultâneo).
        semaphore = asyncio.Semaphore(_RESOLVE_CONCURRENCY)

        async def resolve_one(meta: dict):
            async with semaphore:
                video_url = await _resolve_video_url(client, meta["share_url"])
                return meta, video_url

        resolved = await asyncio.gather(*[resolve_one(m) for m in parsed])

        result = []
        for meta, video_url in resolved:
            if not video_url:
                logger.warning(f"[facebook-dark] não consegui resolver vídeo baixável pra {meta['share_url']} — pulando")
                continue
            result.append(VideoItem(
                media_id=meta["media_id"],
                video_url=video_url,
                thumbnail_url=meta["thumbnail_url"],
                views=meta["views"],
                duration_seconds=meta["duration_seconds"],
                title=meta["title"],
            ))

        if not result:
            raise HTTPException(status_code=422, detail=f"Encontrei {len(parsed)} reels na página, mas não consegui resolver o vídeo baixável de nenhum deles. Confira os logs do Render pra mais detalhes.")

        return ListVideosResponse(videos=result)
