# ─────────────────────────────────────────────────────────────
# backend/services/shared/credit_service.py
# Lógica central de créditos — débito, estorno, recarga
# Regra: debitar ANTES de chamar qualquer API externa
# ─────────────────────────────────────────────────────────────

from fastapi import HTTPException
from supabase import Client


# ── Custo por operação ────────────────────────────────────────
# Fonte da verdade: tabela credit_costs no banco
# Esses valores são o fallback caso a tabela não esteja acessível

CREDIT_COSTS = {
    # Studio (YouTube)
    "studio_5min":  40,
    "studio_8min":  65,
    "studio_12min": 90,
    "studio_15min": 110,
    # TikTok
    "tiktok_15s":   8,
    "tiktok_30s":   15,
    "tiktok_45s":   20,
    "tiktok_60s":   25,
    # Extras
    "script_ai":    2,
    "image_static": 1,
}


def get_operation_cost(operation: str) -> int:
    """Retorna o custo em créditos de uma operação."""
    return CREDIT_COSTS.get(operation, 0)


async def get_balance(user_id: str, db: Client) -> int:
    """Retorna o saldo atual de créditos do usuário."""
    res = db.table("user_credits").select("balance").eq("user_id", user_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return res.data["balance"]


async def debit(
    user_id: str,
    amount: int,
    operation: str,
    description: str,
    db: Client,
) -> int:
    """
    Debita créditos do usuário ANTES de chamar a API externa.
    Retorna o novo saldo.
    Lança 402 se saldo insuficiente.
    """
    # Busca saldo atual
    balance = await get_balance(user_id, db)

    if balance < amount:
        raise HTTPException(
            status_code=402,
            detail=f"Saldo insuficiente. Você tem {balance} créditos, a operação custa {amount}."
        )

    # Debita
    new_balance = balance - amount
    db.table("user_credits").update({
        "balance": new_balance,
    }).eq("user_id", user_id).execute()

    # Registra transação
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -amount,
        "type": operation,
        "description": description,
    }).execute()

    return new_balance


async def refund(
    user_id: str,
    amount: int,
    operation: str,
    description: str,
    db: Client,
) -> int:
    """
    Estorna créditos em caso de falha na geração.
    Chamado automaticamente quando a API externa retorna erro.
    """
    balance = await get_balance(user_id, db)
    new_balance = balance + amount

    db.table("user_credits").update({
        "balance": new_balance,
    }).eq("user_id", user_id).execute()

    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": amount,
        "type": "refund",
        "description": f"Estorno automático: {description}",
    }).execute()

    return new_balance


async def add_credits(
    user_id: str,
    amount: int,
    type: str,
    description: str,
    db: Client,
) -> int:
    """Adiciona créditos (recarga de plano, bônus, manual pelo admin)."""
    balance = await get_balance(user_id, db)
    new_balance = balance + amount

    db.table("user_credits").update({
        "balance": new_balance,
    }).eq("user_id", user_id).execute()

    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": amount,
        "type": type,
        "description": description,
    }).execute()

    return new_balance
