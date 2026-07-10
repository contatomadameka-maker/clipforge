# ─────────────────────────────────────────────────────────────
# backend/routers/tiktok_dark.py
# TikTok Dark — lista vídeos de um perfil ou busca 1 vídeo por link,
# via TikHub. NÃO tem processamento próprio de propósito — os vídeos
# encontrados aqui alimentam o Editor em Massa (batch_editor.py), que
# já é agnóstico de origem (aceita qualquer URL pública de vídeo) e já
# tem todo o pipeline de créditos/bordas/título/marca/anti-dup pronto.
# Isso evita duplicar toda aquela lógica só pra trocar a fonte.
#
# ⚠️ ENDPOINTS DA TIKHUB AINDA NÃO 100% CONFIRMADOS — a documentação
# completa fica atrás de login, então os nomes/parâmetros abaixo são o
# melhor palpite fundamentado em documentação pública parcial. Se der
# erro, o log vai mostrar a resposta crua da TikHub — ajusta a partir
# daí, mesmo padrão usado pra debugar o Kling.
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from config import get_settings
import httpx
import re
import logging

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("tiktok_dark")

TIKHUB_BASE = "https://api.tikhub.io"


def extract_tiktok_username(profile_url_or_username: str) -> str:
    """Aceita tanto um @username quanto uma URL completa do perfil TikTok."""
    text = profile_url_or_username.strip()
    match = re.search(r"tiktok\.com/@([A-Za-z0-9._]+)", text)
    if match:
        return match.group(1)
    return text.lstrip("@")


class VideoItem(BaseModel):
    media_id: str
    video_url: str
    thumbnail_url: str
    views: int = 0
    duration_seconds: float = 0


class ListVideosResponse(BaseModel):
    videos: List[VideoItem]
    next_cursor: Optional[str] = None


def _auth_headers() -> dict:
    if not settings.tikhub_api_key:
        raise HTTPException(status_code=503, detail="TIKHUB_API_KEY não configurada ainda no backend.")
    return {"Authorization": f"Bearer {settings.tikhub_api_key}"}


@router.get("/list-videos", response_model=ListVideosResponse)
async def list_videos(profile: str, cursor: Optional[str] = None):
    """Lista uma página de vídeos de um perfil público do TikTok."""
    username = extract_tiktok_username(profile)

    async with httpx.AsyncClient(timeout=30) as client:
        # 1) Resolve o username pro sec_user_id — usando a família App V3
        # (mais confiável que a Web API, que devolvia erro genérico "Request
        # failed" mesmo com os parâmetros certos, igual aconteceu antes com
        # fetch_one_video_by_share_url).
        user_res = await client.get(
            f"{TIKHUB_BASE}/api/v1/tiktok/app/v3/get_user_id_and_sec_user_id_by_username",
            params={"username": username},
            headers=_auth_headers(),
        )
        logger.info(f"[tiktok-dark] get_user_id_and_sec_user_id_by_username http={user_res.status_code} body={user_res.text[:800]}")
        if user_res.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Perfil não encontrado ou privado: {user_res.text[:300]}")

        user_data = user_res.json()
        container = user_data.get("data", {}) if isinstance(user_data.get("data"), dict) else {}
        # Formato exato da resposta ainda não confirmado — tenta os
        # caminhos mais prováveis antes de desistir.
        sec_uid = (
            container.get("sec_user_id")
            or container.get("secUid")
            or container.get("sec_uid")
            or user_data.get("sec_user_id")
        )
        if not sec_uid:
            logger.error(f"[tiktok-dark] não achei sec_uid na resposta. Chaves de 'data': {list(container.keys())}")
            raise HTTPException(status_code=502, detail=f"Não consegui resolver esse perfil do TikTok. Chaves recebidas: {list(container.keys())}")

        # 2) Busca uma página de vídeos do perfil
        params = {"sec_user_id": sec_uid, "count": 20}
        if cursor:
            params["max_cursor"] = cursor

        videos_res = await client.get(
            f"{TIKHUB_BASE}/api/v1/tiktok/app/v3/fetch_user_post_videos",
            params=params,
            headers=_auth_headers(),
        )
        logger.info(f"[tiktok-dark] fetch_user_post_videos http={videos_res.status_code} body={videos_res.text[:800]}")
        if videos_res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Erro ao buscar vídeos desse perfil no TikTok: {videos_res.text[:300]}")

        data = videos_res.json()
        items = data.get("data", {}).get("aweme_list") or data.get("data", {}).get("itemList") or []
        next_cursor = data.get("data", {}).get("max_cursor") or data.get("data", {}).get("cursor")

        result = []
        for item in items:
            video_info = item.get("video", {})
            # Vídeo sem marca d'água costuma vir em play_addr ou download_addr
            play_urls = (
                video_info.get("play_addr", {}).get("url_list")
                or video_info.get("download_addr", {}).get("url_list")
                or []
            )
            video_url = play_urls[0] if play_urls else ""

            cover_urls = video_info.get("cover", {}).get("url_list") or video_info.get("origin_cover", {}).get("url_list") or []
            thumb_url = cover_urls[0] if cover_urls else ""

            if video_url:
                result.append(VideoItem(
                    media_id=str(item.get("aweme_id", "")),
                    video_url=video_url,
                    thumbnail_url=thumb_url,
                    views=item.get("statistics", {}).get("play_count", 0) or 0,
                    duration_seconds=(video_info.get("duration", 0) or 0) / 1000,  # geralmente vem em ms
                ))

        return ListVideosResponse(videos=result, next_cursor=next_cursor)


def _parse_video_item(item: dict) -> "VideoItem":
    """Converte um objeto 'aweme' (formato padrão de vídeo do TikTok/
    Douyin) da TikHub pro nosso VideoItem. Centralizado aqui porque tanto
    a busca por ID quanto por link (fallback) usam o mesmo formato."""
    video_info = item.get("video", {})
    play_urls = (
        video_info.get("play_addr", {}).get("url_list")
        or video_info.get("download_addr", {}).get("url_list")
        or []
    )
    video_url = play_urls[0] if play_urls else ""
    if not video_url:
        logger.error(f"[tiktok-dark] item sem video_url. Chaves: {list(item.keys())}")
        raise HTTPException(status_code=422, detail="Esse vídeo não retornou uma URL de reprodução (pode ter sido removido ou estar restrito na sua região).")

    cover_urls = video_info.get("cover", {}).get("url_list") or []
    thumb_url = cover_urls[0] if cover_urls else ""

    return VideoItem(
        media_id=str(item.get("aweme_id", "")),
        video_url=video_url,
        thumbnail_url=thumb_url,
        views=item.get("statistics", {}).get("play_count", 0) or 0,
        duration_seconds=(video_info.get("duration", 0) or 0) / 1000,
    )


def _extract_video_id(url: str) -> Optional[str]:
    """Extrai o ID numérico do vídeo de uma URL completa do TikTok
    (.../video/1234567890123456789)."""
    match = re.search(r"/video/(\d+)", url)
    return match.group(1) if match else None


@router.get("/video-by-url", response_model=VideoItem)
async def video_by_url(url: str):
    """Busca 1 vídeo específico do TikTok pelo link. Extrai o ID numérico
    da URL e usa /api/v1/tiktok/app/v3/fetch_one_video?aweme_id=... —
    mais confiável do que mandar a URL inteira pra API adivinhar
    (fetch_one_video_by_share_url devolvia 'sucesso' com corpo vazio,
    sem erro claro, então trocamos de estratégia)."""
    clean_url = url.strip()

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        # Links curtos (vt.tiktok.com / vm.tiktok.com) são um redirecionamento
        # — resolve pra URL completa antes de extrair o ID.
        if "vt.tiktok.com" in clean_url or "vm.tiktok.com" in clean_url:
            try:
                redirect_res = await client.head(clean_url)
                resolved = str(redirect_res.url)
                logger.info(f"[tiktok-dark] link curto resolvido: {clean_url} -> {resolved}")
                clean_url = resolved
            except Exception as e:
                logger.warning(f"[tiktok-dark] falha ao resolver link curto ({e}) — segue com o original")

        video_id = _extract_video_id(clean_url)
        if not video_id:
            raise HTTPException(status_code=422, detail=f"Não consegui identificar o ID do vídeo nessa URL: {clean_url}")

        res = await client.get(
            f"{TIKHUB_BASE}/api/v1/tiktok/app/v3/fetch_one_video",
            params={"aweme_id": video_id},
            headers=_auth_headers(),
        )
        logger.info(f"[tiktok-dark] fetch_one_video (id={video_id}) http={res.status_code} body={res.text[:1500]}")
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Vídeo não encontrado — confira se o link está certo e se o post é público.")
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Erro ao buscar esse vídeo do TikTok: {res.text[:300]}")

        data = res.json()
        container = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
        item = container.get("aweme_detail") or (container if ("video" in container or "aweme_id" in container) else None)

        if not item:
            logger.error(f"[tiktok-dark] fetch_one_video sem item reconhecível. Chaves de 'data': {list(container.keys())}")
            raise HTTPException(status_code=422, detail=f"Formato de resposta inesperado da TikHub. Chaves recebidas: {list(container.keys())}")

        return _parse_video_item(item)
