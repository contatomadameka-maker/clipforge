# ─────────────────────────────────────────────────────────────
# backend/routers/stripe_router.py
# Checkout e webhook do Stripe
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from config import get_settings
from db.database import get_supabase
import stripe
import json
from typing import Optional

router = APIRouter()
settings = get_settings()

stripe.api_key = settings.stripe_secret_key

PLANS = {
    "starter": {
        "price_id": "price_1Tp7t0Gef0c6o22uunlHiEOJ",
        "credits": 200,
        "name": "Starter",
    },
    "pro": {
        "price_id": "price_1Tp7z9Gef0c6o22uqzFq1nZt",
        "credits": 600,
        "name": "Pro",
    },
    "agency": {
        "price_id": "price_1Tp80ZGef0c6o22uPQZq1vDZ",
        "credits": 1500,
        "name": "Agency",
    },
}

PRICE_TO_PLAN = {v["price_id"]: k for k, v in PLANS.items()}


class CheckoutRequest(BaseModel):
    plan: str  # starter | pro | agency
    user_id: str
    user_email: str
    success_url: str = "https://clipforge-git-main-dirlei-luis-sestrems-projects.vercel.app/dashboard?payment=success"
    cancel_url: str = "https://clipforge-git-main-dirlei-luis-sestrems-projects.vercel.app/settings?tab=plan"


@router.post("/create-checkout")
async def create_checkout(req: CheckoutRequest):
    """Cria sessão de checkout no Stripe."""
    plan = PLANS.get(req.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Plano inválido")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": plan["price_id"], "quantity": 1}],
            customer_email=req.user_email,
            metadata={"user_id": req.user_id, "plan": req.plan},
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            locale="pt-BR",
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """Recebe eventos do Stripe e atualiza créditos."""
    body = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            body, stripe_signature, settings.stripe_webhook_secret
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    db = get_supabase()

    # Pagamento de assinatura confirmado
    if event["type"] == "invoice.payment_succeeded":
        invoice = event["data"]["object"]
        customer_email = invoice.get("customer_email", "")
        subscription_id = invoice.get("subscription")
        amount_paid = invoice.get("amount_paid", 0)

        # Pega o price_id para descobrir o plano
        lines = invoice.get("lines", {}).get("data", [])
        price_id = lines[0]["price"]["id"] if lines else None
        plan_key = PRICE_TO_PLAN.get(price_id)
        plan = PLANS.get(plan_key)

        if plan and invoice.get("metadata", {}).get("user_id"):
            user_id = invoice["metadata"]["user_id"]
            _add_credits(db, user_id, plan["credits"], plan["name"])

        # Tenta pelo customer email
        elif plan and customer_email:
            user = db.table("profiles").select("id").eq("email", customer_email).single().execute()
            if user.data:
                _add_credits(db, user.data["id"], plan["credits"], plan["name"])

    # Assinatura cancelada
    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_email = sub.get("customer_email", "")
        if customer_email:
            user = db.table("profiles").select("id").eq("email", customer_email).single().execute()
            if user.data:
                db.table("profiles").update({"plan": "free"}).eq("id", user.data["id"]).execute()

    return {"received": True}


def _add_credits(db, user_id: str, credits: int, plan_name: str):
    """Adiciona créditos ao usuário após pagamento."""
    # Atualiza plano no perfil
    db.table("profiles").update({"plan": plan_name.lower()}).eq("id", user_id).execute()

    # Adiciona créditos
    current = db.table("user_credits").select("balance").eq("user_id", user_id).single().execute()
    if current.data:
        new_balance = current.data["balance"] + credits
        db.table("user_credits").update({"balance": new_balance}).eq("user_id", user_id).execute()
    else:
        db.table("user_credits").insert({"user_id": user_id, "balance": credits}).execute()

    # Registra transação
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": credits,
        "type": "purchase",
        "description": f"Plano {plan_name} — créditos mensais",
    }).execute()


@router.get("/plans")
async def get_plans():
    """Retorna os planos disponíveis."""
    return {"plans": [
        {"id": "starter", "name": "Starter", "price": 49, "credits": 200, "price_id": PLANS["starter"]["price_id"]},
        {"id": "pro", "name": "Pro", "price": 97, "credits": 600, "price_id": PLANS["pro"]["price_id"]},
        {"id": "agency", "name": "Agency", "price": 197, "credits": 1500, "price_id": PLANS["agency"]["price_id"]},
    ]}
