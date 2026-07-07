# ─────────────────────────────────────────────────────────────
# backend/routers/credits.py
# Gerenciamento de créditos do usuário
# ─────────────────────────────────────────────────────────────
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from db.database import get_supabase
from typing import Optional
router = APIRouter()
class CreditsResponse(BaseModel):
    balance: int
    total_earned: int = 0
    total_used: int = 0
class DebitRequest(BaseModel):
    user_id: str
    amount: int
    description: str
    project_id: Optional[str] = None
@router.get("/{user_id}", response_model=CreditsResponse)
async def get_credits(user_id: str):
    """Retorna o saldo de créditos do usuário."""
    db = get_supabase()
    res = db.table("user_credits").select("*").eq("user_id", user_id).single().execute()
    if not res.data:
        # Cria o registro se não existir
        db.table("user_credits").insert({
            "user_id": user_id,
            "balance": 50,
        }).execute()
        return CreditsResponse(balance=50)
    return CreditsResponse(balance=res.data.get("balance", 0))
@router.post("/debit")
async def debit_credits(req: DebitRequest):
    """Debita créditos do usuário."""
    db = get_supabase()
    # Verifica saldo
    res = db.table("user_credits").select("balance").eq("user_id", req.user_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    balance = res.data.get("balance", 0)
    if balance < req.amount:
        raise HTTPException(status_code=402, detail=f"Créditos insuficientes. Saldo: {balance}, necessário: {req.amount}")
    # Debita
    new_balance = balance - req.amount
    db.table("user_credits").update({"balance": new_balance}).eq("user_id", req.user_id).execute()
    # Registra transação
    # NOTA: "credit_transactions" não tem coluna "project_id" no schema
    # atual (conferido no Brief) — por isso não incluímos esse campo
    # aqui, mesmo que o request aceite project_id (fica só disponível
    # pra uso futuro, se a coluna for adicionada na tabela um dia).
    db.table("credit_transactions").insert({
        "user_id": req.user_id,
        "amount": -req.amount,
        "type": "debit",
        "description": req.description,
    }).execute()
    return {"balance": new_balance, "debited": req.amount}
@router.post("/refund")
async def refund_credits(req: DebitRequest):
    """Estorna créditos ao usuário."""
    db = get_supabase()
    res = db.table("user_credits").select("balance").eq("user_id", req.user_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    balance = res.data.get("balance", 0)
    new_balance = balance + req.amount
    db.table("user_credits").update({"balance": new_balance}).eq("user_id", req.user_id).execute()
    db.table("credit_transactions").insert({
        "user_id": req.user_id,
        "amount": req.amount,
        "type": "refund",
        "description": req.description,
    }).execute()
    return {"balance": new_balance, "refunded": req.amount}
