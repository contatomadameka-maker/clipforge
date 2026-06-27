# ─────────────────────────────────────────────────────────────
# backend/services/studio/music_agent.py
# Agente 7 — Música
# Gera trilha sonora original no estilo do vídeo
# API: Suno
# ─────────────────────────────────────────────────────────────

import httpx
import asyncio
from config import get_settings
from services.shared.storage_service import upload_audio

settings = get_settings()

STYLE_MUSIC_MAP = {
    "documentary":  "cinematic documentary score, orchestral, emotional, Hans Zimmer style",
    "biblical":     "epic biblical orchestral, choir, powerful, emotional, spiritual",
    "motivational": "uplifting motivational, energetic orchestra, inspiring, triumphant",
    "narrative":    "dramatic storytelling score, tension and release, cinematic",
}


async def run(style: str, duration_minutes: int, project_id: str) -> str:
    """
    Gera uma trilha sonora para o vídeo.
    Retorna a URL do áudio no R2.
    """
    print(f"[Agente 7 — Música] Gerando trilha para estilo: {style}")

    music_style = STYLE_MUSIC_MAP.get(style, STYLE_MUSIC_MAP["documentary"])
    duration_seconds = duration_minutes * 60

    async with httpx.AsyncClient(timeout=120) as client:
        # Inicia geração no Suno
        res = await client.post(
            "https://studio-api.suno.ai/api/generate/v2/",
            headers={
                "Authorization": f"Bearer {settings.suno_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "prompt": music_style,
                "make_instrumental": True,
                "wait_audio": False,
            },
        )
        res.raise_for_status()
        data = res.json()
        clip_ids = [c["id"] for c in data.get("clips", [])]

        if not clip_ids:
            raise Exception("Suno não retornou IDs de clips")

        clip_id = clip_ids[0]
        print(f"[Agente 7 — Música] Aguardando geração do clip {clip_id}")

        # Polling até ficar pronto
        for _ in range(60):
            await asyncio.sleep(10)
            feed = await client.get(
                f"https://studio-api.suno.ai/api/feed/?ids={clip_id}",
                headers={"Authorization": f"Bearer {settings.suno_api_key}"},
            )
            feed.raise_for_status()
            clips = feed.json()

            if clips and clips[0].get("status") == "complete":
                audio_url = clips[0].get("audio_url")
                if not audio_url:
                    raise Exception("Suno não retornou URL do áudio")

                # Baixa e sobe para R2
                dl = await client.get(audio_url)
                dl.raise_for_status()
                audio_bytes = dl.content

                key = f"studio/{project_id}/music/soundtrack.mp3"
                r2_url = await upload_audio(key, audio_bytes)

                print(f"[Agente 7 — Música] Trilha pronta: {r2_url}")
                return r2_url

    raise Exception("Timeout na geração da música")
