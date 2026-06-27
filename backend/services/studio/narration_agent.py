# ─────────────────────────────────────────────────────────────
# backend/services/studio/narration_agent.py
# Agente 5 — Narração
# Converte texto em áudio por cena com ElevenLabs
# API: ElevenLabs
# ─────────────────────────────────────────────────────────────

import httpx
import asyncio
from config import get_settings
from services.shared.storage_service import upload_audio

settings = get_settings()

# IDs de vozes ElevenLabs (configurar no painel ElevenLabs)
VOICE_MAP = {
    "male-deep":   "pNInz6obpgDQGcFmaJgB",  # Adam
    "female-soft": "EXAVITQu4vr4xnSDxMaL",  # Bella
    "male-young":  "VR6AewLTigWG4xSOukaG",  # Arnold (placeholder)
}


async def generate_audio_for_scene(
    scene_number: int,
    text: str,
    voice_id: str,
    project_id: str,
) -> dict:
    """Gera áudio para uma cena e faz upload no R2."""
    voice = VOICE_MAP.get(voice_id, VOICE_MAP["male-deep"])

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0.0,
                    "use_speaker_boost": True,
                },
            },
        )
        res.raise_for_status()
        audio_bytes = res.content

    # Upload para R2
    key = f"studio/{project_id}/audio/scene_{scene_number}.mp3"
    audio_url = await upload_audio(key, audio_bytes, content_type="audio/mpeg")

    return {
        "scene_number": scene_number,
        "audio_url": audio_url,
        "size_bytes": len(audio_bytes),
    }


async def run(
    script: dict,
    voice_id: str,
    project_id: str,
) -> list[dict]:
    """
    Gera narração para todas as cenas em paralelo.
    Retorna lista com URLs dos áudios no R2.
    """
    print(f"[Agente 5 — Narração] Iniciando geração de áudio em paralelo")

    scenes = script.get("scenes", [])

    tasks = [
        generate_audio_for_scene(
            scene_number=s["scene_number"],
            text=s["narration"],
            voice_id=voice_id,
            project_id=project_id,
        )
        for s in scenes
    ]

    # Gera todas as cenas em paralelo
    results = await asyncio.gather(*tasks, return_exceptions=True)

    audios = []
    for r in results:
        if isinstance(r, Exception):
            print(f"[Agente 5 — Narração] Erro em cena: {r}")
            raise r
        audios.append(r)

    print(f"[Agente 5 — Narração] Concluído: {len(audios)} faixas de áudio geradas")
    return audios
