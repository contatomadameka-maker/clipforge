# ─────────────────────────────────────────────────────────────
# backend/routers/auth.py
# Registro, login e perfil — via Supabase Auth
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, Depends
from models.schemas import RegisterRequest, LoginRequest, AuthResponse, ProfileResponse
from db.database import get_supabase
from supabase import Client

router = APIRouter()


# ── Registro ──────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
async def register(data: RegisterRequest, db: Client = Depends(get_supabase)):
    try:
        # Cria usuário no Supabase Auth
        res = db.auth.sign_up({
            "email": data.email,
            "password": data.password,
        })

        if not res.user:
            raise HTTPException(status_code=400, detail="Erro ao criar usuário")

        user_id = res.user.id

        # Cria perfil na tabela profiles
        db.table("profiles").insert({
            "id": user_id,
            "name": data.name,
            "email": data.email,
            "plan": "starter",
        }).execute()

        # Cria saldo inicial de créditos (50 de bônus onboarding)
        db.table("user_credits").insert({
            "user_id": user_id,
            "balance": 50,
        }).execute()

        # Registra a transação de bônus
        db.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": 50,
            "type": "bonus",
            "description": "Bônus de boas-vindas ao ClipForge",
        }).execute()

        return AuthResponse(
            access_token=res.session.access_token if res.session else "",
            user_id=user_id,
            email=data.email,
            name=data.name,
            plan="starter",
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Login ─────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: Client = Depends(get_supabase)):
    try:
        res = db.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })

        if not res.user or not res.session:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

        # Busca perfil
        profile = db.table("profiles").select("*").eq("id", res.user.id).single().execute()

        return AuthResponse(
            access_token=res.session.access_token,
            user_id=res.user.id,
            email=res.user.email,
            name=profile.data.get("name", ""),
            plan=profile.data.get("plan", "starter"),
        )

    except Exception as e:
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")


# ── Perfil ────────────────────────────────────────────────────

@router.get("/me", response_model=ProfileResponse)
async def get_me(db: Client = Depends(get_supabase)):
    # TODO: extrair user_id do JWT token (implementar middleware)
    raise HTTPException(status_code=501, detail="Middleware de auth pendente")
