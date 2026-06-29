# ─────────────────────────────────────────────────────────────
# backend/tasks/studio_tasks.py
# Orquestrador Celery — pipeline dos 9 agentes do Studio
# ─────────────────────────────────────────────────────────────

from celery import Celery
from config import get_settings
from db.database import get_supabase
import asyncio
import ssl

settings = get_settings()

# ── SSL para Upstash (rediss://) ──────────────────────────────
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

celery_app = Celery("clipforge")

celery_app.config_from_object({
    "broker_url": settings.redis_url,
    "result_backend": settings.redis_url,
    "task_serializer": "json",
    "accept_content": ["json"],
    "result_serializer": "json",
    "timezone": "America/Sao_Paulo",
    "task_track_started": True,
    "broker_use_ssl": {"ssl_context": ssl_context},
    "redis_backend_use_ssl": {"ssl_context": ssl_context},
    "broker_connection_retry_on_startup": True,
})

# Nomes dos agentes para exibir no frontend
AGENT_NAMES = {
    1: "Pesquisa",
    2: "Roteiro",
    3: "Storyboard",
    4: "Prompts visuais",
    5: "Narração",
    6: "Vídeos por cena",
    7: "Música",
    8: "Legendas",
    9: "Edição e export",
}


def update_progress(project_id: str, agent: int, status: str, message: str = ""):
    db = get_supabase()
    db.table("studio_projects").update({
        "current_agent": agent,
        "status": status,
        "progress": int((agent / 9) * 100),
    }).eq("id", project_id).execute()
    print(f"[Pipeline] Agente {agent} ({AGENT_NAMES[agent]}): {status} {message}")


def mark_error(project_id: str, agent: int, error: str, user_id: str, credits: int):
    db = get_supabase()
    db.table("studio_projects").update({
        "status": "error",
        "error_message": f"Erro no agente {agent} ({AGENT_NAMES[agent]}): {error}",
    }).eq("id", project_id).execute()
    asyncio.run(_refund_credits(user_id, credits, project_id))
    print(f"[Pipeline] ERRO no agente {agent}: {error} — créditos estornados")


async def _refund_credits(user_id: str, amount: int, project_id: str):
    from services.shared.credit_service import refund
    db = get_supabase()
    await refund(
        user_id=user_id,
        amount=amount,
        operation="refund",
        description=f"Estorno automático — falha no projeto {project_id}",
        db=db,
    )


@celery_app.task(bind=True, name="studio.generate_video")
def generate_studio_video(
    self,
    project_id: str,
    user_id: str,
    topic: str,
    duration_minutes: int,
    style: str,
    voice_id: str,
    language: str,
    credits_used: int,
):
    print(f"[Pipeline] Iniciando projeto {project_id}")

    try:
        update_progress(project_id, 1, "researching")
        from services.studio.research_agent import run as research
        research_result = asyncio.run(research(topic, language))

        update_progress(project_id, 2, "scripting")
        from services.studio.script_agent import run as script
        script_result = asyncio.run(script(topic, research_result, duration_minutes, style, language))

        db = get_supabase()
        db.table("studio_projects").update({"script": script_result}).eq("id", project_id).execute()

        update_progress(project_id, 3, "storyboarding")
        from services.studio.storyboard_agent import run as storyboard
        storyboard_result = asyncio.run(storyboard(script_result, style))

        db.table("studio_projects").update({"storyboard": storyboard_result}).eq("id", project_id).execute()

        update_progress(project_id, 4, "prompting")
        from services.studio.prompt_agent import run as prompts
        prompts_result = asyncio.run(prompts(script_result, storyboard_result))

        update_progress(project_id, 5, "narrating")
        from services.studio.narration_agent import run as narration
        audios = asyncio.run(narration(script_result, voice_id, project_id))

        for audio in audios:
            db.table("studio_scenes").update({
                "audio_url": audio["audio_url"],
                "status": "audio_done",
            }).eq("project_id", project_id).eq("scene_number", audio["scene_number"]).execute()

        update_progress(project_id, 6, "generating_video")
        from services.studio.video_agent import run as video
        clips = asyncio.run(video(prompts_result, project_id))

        for clip in clips:
            db.table("studio_scenes").update({
                "video_clip_url": clip["video_url"],
                "status": "video_done",
            }).eq("project_id", project_id).eq("scene_number", clip["scene_number"]).execute()

        update_progress(project_id, 7, "music")
        from services.studio.music_agent import run as music
        music_url = asyncio.run(music(style, duration_minutes, project_id))

        update_progress(project_id, 8, "captions")
        from services.studio.caption_agent import run as captions
        captions_result = asyncio.run(captions(audios, project_id))

        update_progress(project_id, 9, "editing")
        from services.studio.editor_agent import run as editor
        final = asyncio.run(editor(
            clips=clips,
            audios=audios,
            music_url=music_url,
            captions=captions_result,
            script=script_result,
            project_id=project_id,
        ))

        db.table("studio_projects").update({
            "status": "done",
            "current_agent": 9,
            "progress": 100,
            "video_url": final["video_url"],
            "thumbnail_url": final.get("thumbnail_url"),
            "seo_data": final.get("seo_data"),
            "credits_used": credits_used,
        }).eq("id", project_id).execute()

        print(f"[Pipeline] Projeto {project_id} concluído!")
        return {"status": "done", "project_id": project_id, "video_url": final["video_url"]}

    except Exception as e:
        mark_error(project_id, self.request.retries + 1, str(e), user_id, credits_used)
        raise
