# ─────────────────────────────────────────────────────────────
# backend/routers/facebook_dark.py
# Facebook Dark — lista vídeos de uma Página pública do Facebook.
#
# Usa a SociaVault (api.sociavault.com), NÃO Apify — troca feita porque
# a Apify passou a exigir assinatura de plataforma (~$26-29/mês) pra
# qualquer Actor pago, mesmo os anunciados como "pay per result".
#
# A SociaVault resolve numa ÚNICA chamada o que antes precisava de DOIS
# passos (Apify pra descobrir + yt-dlp local pra resolver o vídeo
# baixável): o endpoint /v1/scrape/facebook/profile/posts já devolve o
# link de vídeo pronto (videoDetails.hdUrl/sdUrl) junto com a lista de
# posts da página. Modelo de cobrança: pay-as-you-go puro, créditos não
# expiram, sem assinatura obrigatória.
#
# NÃO tem processamento próprio de propósito — os vídeos encontrados
# aqui alimentam o Editor em Massa (batch_editor.py), que já é
# agnóstico de origem.
# ─────────────────────────────────────────────────────────────

import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_settings

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("facebook_dark")

SOCIAVAULT_BASE = "https://api.sociavault.com"


class VideoItem(BaseModel):
    media_id: str
    video_url: str
    thumbnail_url: str
    views: int = 0
    duration_seconds: float = 0
    title: str = ""


class ListVideosResponse(BaseModel):
    videos: List[VideoItem]
    has_more: bool = False
    next_cursor: Optional[str] = None


def _auth_headers() -> dict:
    if not settings.sociavault_api_key:
        raise HTTPException(status_code=503, detail="SOCIAVAULT_API_KEY não configurada ainda no backend.")
    return {"x-api-key": settings.sociavault_api_key}


def _extract_video_items(data: dict) -> tuple[list[VideoItem], Optional[str]]:
    """Converte a resposta crua da SociaVault numa lista de VideoItem
    (pulando posts sem vídeo) + o cursor pra próxima página."""
    posts_raw = data.get("posts", {})
    # "posts" vem como objeto {"0": {...}, "1": {...}}, não uma lista de
    # verdade — .values() normaliza pra iterar igual.
    posts = posts_raw.values() if isinstance(posts_raw, dict) else (posts_raw or [])
    next_cursor = data.get("cursor")

    items = []
    for post in posts:
        video_details = post.get("videoDetails") or {}
        video_url = video_details.get("hdUrl") or video_details.get("sdUrl")
        if not video_url:
            continue  # post sem vídeo (foto/texto) — pula

        thumb_url = video_details.get("thumbnailUrl") or post.get("image") or ""
        # Facebook não server-renderiza contagem de views em Reels — usa
        # reações como proxy de popularidade, melhor que mostrar 0.
        views = post.get("videoViewCount") or post.get("reactionCount") or 0
        title = post.get("text") or ""

        items.append(VideoItem(
            media_id=str(post.get("id", "")),
            video_url=video_url,
            thumbnail_url=thumb_url,
            views=int(views) if views else 0,
            duration_seconds=0,  # não vem nessa resposta — sem confiança suficiente pra extrair do jeito que aparece embutido na URL
            title=title[:200],
        ))
    return items, next_cursor


@router.get("/list-videos", response_model=ListVideosResponse)
async def list_videos(page_url: str, limit: int = 20, cursor: Optional[str] = None):
    """Busca vídeos de uma Página pública do Facebook, já com o link
    pronto pra baixar. A SociaVault devolve só um lote pequeno por
    chamada (na prática, ~3 posts) — então repete a busca sozinha,
    seguindo o cursor dela, até juntar o `limit` pedido (ou acabarem os
    posts da página), pra devolver a quantidade certa de uma vez pro
    frontend. `cursor` (opcional) começa a busca a partir da PRÓXIMA
    página — vem no campo `next_cursor` da resposta anterior, usado pelo
    botão "Carregar mais" do frontend."""
    all_items: list[VideoItem] = []
    current_cursor = cursor
    max_calls = 15  # limite de segurança — evita loop indo até o fim da página numa busca só

    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(max_calls):
            params = {"url": page_url.strip()}
            if current_cursor:
                params["cursor"] = current_cursor

            res = await client.get(
                f"{SOCIAVAULT_BASE}/v1/scrape/facebook/profile/posts",
                params=params,
                headers=_auth_headers(),
            )
            logger.info(f"[facebook-dark] sociavault http={res.status_code} body={res.text[:3000]}")

            if res.status_code != 200:
                if all_items:
                    break  # já temos alguns vídeos — devolve o que juntou em vez de falhar tudo
                raise HTTPException(status_code=502, detail=f"Erro ao buscar vídeos dessa página: {res.text[:500]}")

            body = res.json()
            if not body.get("success"):
                if all_items:
                    break
                raise HTTPException(status_code=502, detail=f"SociaVault devolveu erro: {body}")

            items, next_cursor = _extract_video_items(body.get("data", {}))
            all_items.extend(items)
            current_cursor = next_cursor

            if len(all_items) >= limit or not next_cursor:
                break

        limited = all_items[:limit] if limit else all_items

        return ListVideosResponse(
            videos=limited,
            has_more=bool(current_cursor),
            next_cursor=current_cursor,
        )
