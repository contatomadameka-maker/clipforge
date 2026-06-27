# ─────────────────────────────────────────────────────────────
# backend/services/studio/video_agent.py
# Agente 6 — Vídeos por cena
# Gera clipes de vídeo em paralelo via Runway Gen-4
# API: Runway
# ─────────────────────────────────────────────────────────────

import httpx
import asyncio
import time
from config import get_settings
from services.shared.storage_service import upload_video

settings = get_settings()

RUNWAY_API_URL = "https://api.dev.runwayml.com/v1"
POLL_INTERVAL = 10   # segundos entre cada verificação
MAX_WAIT = 600       # timeout de 10 min por cena


async def generate_clip(scene: dict, project_id: str) -> dict:
    """Gera um clipe de vídeo para uma cena e faz upload no R2."""
    scene_number = scene["scene_number"]
    prompt = scene["visual_prompt"]
    duration = min(scene.get("duration_seconds", 60), 10)  # Runway max ~10s por geração

    print(f"[Agente 6 — Vídeo] Gerando cena {scene_number}")

    headers = {
        "Authorization": f"Bearer {settings.runway_api_key}",
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Inicia geração
        res = await client.post(
            f"{RUNWAY_API_URL}/image_to_video",
            headers=headers,
            json={
                "promptText": prompt,
                "model": "gen4_turbo",
                "duration": 10,
                "ratio": "1280:720",
            },
        )
        res.raise_for_status()
        task_id = res.json().get("id")

        if not task_id:
            raise Exception(f"Runway não retornou task_id para cena {scene_number}")

        # Polling até concluir
        elapsed = 0
        while elapsed < MAX_WAIT:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

            poll = await client.get(
                f"{RUNWAY_API_URL}/tasks/{task_id}",
                headers=headers,
            )
            poll.raise_for_status()
            data = poll.json()
            status = data.get("status")

            print(f"[Agente 6 — Vídeo] Cena {scene_number} status: {status} ({elapsed}s)")

            if status == "SUCCEEDED":
                video_url_runway = data.get("output", [None])[0]
                if not video_url_runway:
                    raise Exception(f"Runway não retornou URL para cena {scene_number}")

                # Baixa o vídeo e sobe para o R2
                dl = await client.get(video_url_runway)
                dl.raise_for_status()
                video_bytes = dl.content

                key = f"studio/{project_id}/clips/scene_{scene_number}.mp4"
                video_url = await upload_video(key, video_bytes)

                print(f"[Agente 6 — Vídeo] Cena {scene_number} concluída: {video_url}")
                return {"scene_number": scene_number, "video_url": video_url}

            elif status == "FAILED":
                raise Exception(f"Runway falhou na cena {scene_number}: {data.get('failure')}")

    raise Exception(f"Timeout na geração da cena {scene_number}")


async def run(prompts: list[dict], project_id: str) -> list[dict]:
    """
    Gera todos os clipes em paralelo.
    Retorna lista com URLs dos clipes no R2.
    """
    print(f"[Agente 6 — Vídeo] Iniciando {len(prompts)} clipes em paralelo")

    tasks = [generate_clip(p, project_id) for p in prompts]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    clips = []
    for r in results:
        if isinstance(r, Exception):
            print(f"[Agente 6 — Vídeo] Erro: {r}")
            raise r
        clips.append(r)

    print(f"[Agente 6 — Vídeo] Concluído: {len(clips)} clipes gerados")
    return clips
