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
ACTOR_ID = "apify~facebook-reels-scraper"  # Actor OFICIAL da Apify — varre a página inteira (o "urls" anterior só resolvia links individuais que já tínhamos, não descobria vídeos novos)


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
        logger.info(f"[facebook-dark] run-sync-get-dataset-items http={res.status_code} body={res.text[:6000]}")

        # A Apify usa 201 Created pra indicar sucesso nesse endpoint
        # síncrono (não 200 OK) — aceita os dois.
        if res.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Erro ao buscar vídeos dessa página: {res.text[:500]}")

        items = res.json()
        if not isinstance(items, list):
            logger.error(f"[facebook-dark] resposta não é uma lista: {type(items)}")
            raise HTTPException(status_code=502, detail="Formato de resposta inesperado da Apify (não veio uma lista).")

        result = []
        for idx, item in enumerate(items):
            # Confirmado testando: esse Actor devolve o JSON "cru" do
            # GraphQL do Facebook (não um formato simplificado). Os campos
            # de metadado já identificados:
            #   - video.id, video.first_frame_thumbnail, video.playable_duration_in_ms (ms)
            #   - playCountRounded (views)
            # A URL de download do vídeo em si mora dentro de
            # "playback_video" — ainda não confirmamos os nomes exatos dos
            # campos aí dentro, então tenta os nomes mais usados pelo
            # Facebook (browser_native_hd_url/sd_url) e cai pra outros
            # candidatos genéricos se não bater.
            video_obj = item.get("video") or {}
            playback = item.get("playback_video") or {}

            video_url = _first_present(
                playback,
                "browser_native_hd_url", "browser_native_sd_url",
                "playable_url_quality_hd", "playable_url",
                "hd_src", "sd_src", "url", "src", "progressive_url",
            )
            if not video_url:
                # (b) campo direto no item, ou dentro de "video"
                video_url = _first_present(item, "videoUrl", "video_url", "downloadUrl", "hd_url", "sd_url", "playAddr")
            if not video_url and isinstance(video_obj, dict):
                video_url = _first_present(video_obj, "url", "downloadUrl", "hd_url", "sd_url", "playAddr")
            if not video_url:
                # (c) formato estilo yt-dlp (lista "formats") — usado pelo Actor anterior
                formats = item.get("formats") or []
                video_formats = [f for f in formats if f.get("url") and f.get("vcodec") and f.get("vcodec") != "none"]
                chosen = max(video_formats, key=lambda f: f.get("tbr") or 0) if video_formats else None
                if not chosen and formats and formats[0].get("url"):
                    chosen = formats[0]
                video_url = (chosen or {}).get("url")

            if not video_url:
                logger.warning(f"[facebook-dark] idx={idx} sem video_url reconhecido. Chaves de 'playback_video': {list(playback.keys()) if isinstance(playback, dict) else playback}")
                continue  # item sem vídeo reconhecível — pula, mas não derruba o lote inteiro

            thumb_url = (
                (video_obj.get("first_frame_thumbnail") if isinstance(video_obj, dict) else None)
                or _first_present(item, "thumbnail", "thumbnailUrl", "thumbnail_url", "previewUrl", "coverUrl")
                or ""
            )
            views_raw = _first_present(item, "playCountRounded", "play_count_reduced", "playsCount", "playCount", "concurrent_view_count", "viewsCount", "views") or 0
            duration_ms = (video_obj.get("playable_duration_in_ms") if isinstance(video_obj, dict) else None)
            duration_raw = (duration_ms / 1000) if duration_ms else (_first_present(item, "duration", "videoDuration", "durationSeconds", "video_duration") or 0)
            media_id = str(
                (video_obj.get("id") if isinstance(video_obj, dict) else None)
                or _first_present(item, "id", "videoId", "postId", "reelId")
                or f"{item.get('uploader_id') or item.get('pageId') or 'fb'}_{idx}"
            )
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
