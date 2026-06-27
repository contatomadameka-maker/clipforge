# ─────────────────────────────────────────────────────────────
# backend/routers/credits.py
# Endpoints de créditos — saldo, histórico, custos por operação
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, Depends
from models.schemas import CreditBalanceResponse, CreditTransactionResponse
from services.shared.credit_service import get_balance, CREDIT_COSTS
from db.database import get_supabase
from supabase import Client
from typing import List

router = APIRouter()


@router.get("/balance/{user_id}", response_model=CreditBalanceResponse)
async def credit_balance(user_id: str, db: Client = Depends(get_supabase)):
    """Retorna o saldo atual de créditos do usuário."""
    res = db.table("user_credits").select("*").eq("user_id", user_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return res.data


@router.get("/transactions/{user_id}", response_model=List[CreditTransactionResponse])
async def credit_transactions(
    user_id: str,
    limit: int = 20,
    db: Client = Depends(get_supabase),
):
    """Retorna o histórico de transações de crédito do usuário."""
    res = (
        db.table("credit_transactions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


@router.get("/costs")
async def credit_costs():
    """Retorna a tabela de custos por operação (pública)."""
    return {
        "costs": CREDIT_COSTS,
        "currency": "credits",
    }
