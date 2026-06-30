# ─────────────────────────────────────────────────────────────
# backend/routers/auth.py
# Registro, login, perfil e sincronização — via Supabase Auth
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from models.schemas import RegisterRequest, LoginRequest, AuthResponse, ProfileResponse, MessageResponse
from db.database import get_supabase
from supabase import Client

router = APIRouter()


class SyncProfileRequest(BaseModel):
    user_id: str
    name: str
    email: EmailStr


# ── Sincroniza perfil (chamado pelo frontend após signUp no Supabase Auth) ──

@router.post("/sync-profile", response_model=MessageResponse)
async def sync_profile(data: SyncProfileRequest, db: Client = Depends(get_supabase)):
    """
    O Supabase Auth já criou o usuário. Aqui criamos o perfil,
    o saldo de créditos inicial e o bônus de onboarding.
    Idempotente: se já existir, não duplica.
    """
    try:
        # Verifica se o perfil já existe
        existing = db.table("profiles").select("id").eq("id", data.user_id).execute()

        if existing.data:
            return {"message": "Perfil já sincronizado"}

        # Cria perfil
        db.table("profiles").insert({
            "id": data.user_id,
            "name": data.name,
            "email": data.email,
            "plan": "starter",
        }).execute()

        # Cria saldo de créditos com bônus de onboarding
        db.table("user_credits").insert({
            "user_id": data.user_id,
            "balance": 50,
        }).execute()

        # Registra a transação do bônus
        db.table("credit_transactions").insert({
            "user_id": data.user_id,
            "amount": 50,
            "type": "bonus",
            "description": "Bônus de boas-vindas ao ClipForge",
        }).execute()

        return {"message": "Perfil criado com sucesso"}

    except Exception as e:
        # Não derruba o cadastro do usuário se a sincronização falhar
        # — pode ser tentado novamente no próximo login
        print(f"[sync-profile] Erro: {e}")
        return {"message": "Perfil será sincronizado no próximo acesso"}


# ── Perfil do usuário autenticado ────────────────────────────

@router.get("/profile/{user_id}", response_model=ProfileResponse)
async def get_profile(user_id: str, db: Client = Depends(get_supabase)):
    """Retorna o perfil completo do usuário."""
    res = db.table("profiles").select("*").eq("id", user_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return res.data
