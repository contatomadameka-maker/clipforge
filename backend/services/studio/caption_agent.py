# ─────────────────────────────────────────────────────────────
# backend/services/studio/caption_agent.py
# Agente 8 — Legendas
# Transcreve narração e gera legendas sincronizadas via Whisper
# API: OpenAI Whisper
# ─────────────────────────────────────────────────────────────

import openai
import asyncio
import httpx
from config import get_settings
from services.shared.storage_service import upload_file, download_file

settings = get_settings()
client = openai.AsyncOpenAI(api_key=settings.openai_api_key)


def seconds_to_srt_time(seconds: float) -> str:
    """Converte segundos para formato SRT: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def segments_to_srt(segments: list) -> str:
    """Converte segmentos do Whisper para formato SRT."""
    srt = []
    for i, seg in enumerate(segments, 1):
        start = seconds_to_srt_time(seg["start"])
        end = seconds_to_srt_time(seg["end"])
        text = seg["text"].strip()
        srt.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(srt)


async def transcribe_scene(audio: dict, project_id: str) -> dict:
    """Transcreve o áudio de uma cena e retorna as legendas."""
    scene_number = audio["scene_number"]
    audio_url = audio["audio_url"]

    print(f"[Agente 8 — Legendas] Transcrevendo cena {scene_number}")

    # Baixa o áudio do R2
    async with httpx.AsyncClient(timeout=60) as http:
        res = await http.get(audio_url)
        res.raise_for_status()
        audio_bytes = res.content

    # Envia para Whisper
    transcription = await client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.mp3", audio_bytes, "audio/mpeg"),
        response_format="verbose_json",
        timestamp_granularities=["segment"],
    )

    segments = [
        {
            "start": seg.start,
            "end": seg.end,
            "text": seg.text,
        }
        for seg in (transcription.segments or [])
    ]

    srt_content = segments_to_srt(segments)

    # Salva o .srt no R2
    key = f"studio/{project_id}/captions/scene_{scene_number}.srt"
    srt_url = await upload_file(key, srt_content.encode("utf-8"), "text/plain")

    return {
        "scene_number": scene_number,
        "srt_url": srt_url,
        "segments": segments,
        "full_text": transcription.text,
    }


async def run(audios: list[dict], project_id: str) -> list[dict]:
    """
    Transcreve todas as cenas em paralelo.
    Retorna lista com URLs dos arquivos .srt no R2.
    """
    print(f"[Agente 8 — Legendas] Iniciando transcrição de {len(audios)} cenas")

    tasks = [transcribe_scene(a, project_id) for a in audios]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    captions = []
    for r in results:
        if isinstance(r, Exception):
            print(f"[Agente 8 — Legendas] Erro: {r}")
            raise r
        captions.append(r)

    print(f"[Agente 8 — Legendas] Concluído: {len(captions)} legendas geradas")
    return captions
