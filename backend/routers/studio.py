# ─────────────────────────────────────────────────────────────
# backend/routers/studio.py
# Endpoints do Studio — criar projeto, acompanhar progresso
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, Depends
from models.schemas import StudioCreateRequest, StudioProjectResponse, MessageResponse
from services.shared.credit_service import debit, get_operation_cost
from db.database import get_supabase
from supabase import Client
import uuid

router = APIRouter()

# Mapa de operação por duração
DURATION_OPERATION = {
    5:  "studio_5min",
    8:  "studio_8min",
    12: "studio_12min",
    15: "studio_15min",
}


@router.post("/create", response_model=StudioProjectResponse)
async def create_studio_project(
    data: StudioCreateRequest,
    db: Client = Depends(get_supabase),
):
    """
    Cria um projeto Studio, debita créditos e dispara o pipeline Celery.
    TODO: extrair user_id do JWT (middleware de auth pendente).
    """
    # Temporário: user_id fixo para testes
    # Remover quando o middleware de auth estiver pronto
    user_id = "USER_ID_DO_JWT"

    # Define operação e custo
    operation = DURATION_OPERATION.get(data.duration_minutes, "studio_8min")
    cost = get_operation_cost(operation)

    # Debita créditos ANTES de chamar qualquer API
    await debit(
        user_id=user_id,
        amount=cost,
        operation=operation,
        description=f"Studio — vídeo de {data.duration_minutes} min: {data.topic[:50]}",
        db=db,
    )

    # Cria o projeto no banco
    project_id = str(uuid.uuid4())
    project_data = {
        "id": project_id,
        "user_id": user_id,
        "topic": data.topic,
        "duration_minutes": data.duration_minutes,
        "style": data.style,
        "voice_id": data.voice_id,
        "language": data.language,
        "status": "queued",
        "current_agent": 0,
        "progress": 0,
    }

    res = db.table("studio_projects").insert(project_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Erro ao criar projeto")

    # Dispara o pipeline Celery em background
    from tasks.studio_tasks import generate_studio_video
    generate_studio_video.delay(
        project_id=project_id,
        user_id=user_id,
        topic=data.topic,
        duration_minutes=data.duration_minutes,
        style=data.style,
        voice_id=data.voice_id,
        language=data.language,
        credits_used=cost,
    )

    return res.data[0]


@router.get("/project/{project_id}", response_model=StudioProjectResponse)
async def get_project(project_id: str, db: Client = Depends(get_supabase)):
    """Retorna o estado atual de um projeto Studio."""
    res = db.table("studio_projects").select("*").eq("id", project_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return res.data


@router.get("/projects/{user_id}")
async def list_projects(user_id: str, db: Client = Depends(get_supabase)):
    """Lista todos os projetos Studio de um usuário."""
    res = (
        db.table("studio_projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.delete("/project/{project_id}", response_model=MessageResponse)
async def delete_project(project_id: str, db: Client = Depends(get_supabase)):
    """Remove um projeto (somente se status for draft ou error)."""
    res = db.table("studio_projects").select("status").eq("id", project_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    if res.data["status"] not in ["draft", "error"]:
        raise HTTPException(status_code=400, detail="Só é possível deletar projetos em rascunho ou com erro")

    db.table("studio_projects").delete().eq("id", project_id).execute()
    return {"message": "Projeto removido com sucesso"}
