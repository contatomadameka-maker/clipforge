# ─────────────────────────────────────────────────────────────
# backend/routers/cakto_router.py
# Checkout e webhook da Cakto — substitui o Stripe pro mercado
# brasileiro por enquanto (PIX nativo, taxas menores, afiliados
# nativos). Stripe fica reservado pra quando expandir internacional.
# ─────────────────────────────────────────────────────────────
#
# Diferença de arquitetura em relação ao Stripe:
# - Não existe "criar sessão de checkout" via API por venda — os
#   produtos/planos são cadastrados uma vez no painel da Cakto, e
#   cada um já tem uma checkoutUrl fixa. O /cakto/plans só devolve
#   essas URLs prontas pro frontend redirecionar o usuário.
# - O webhook da Cakto manda o evento "purchase_approved" já
#   confirmado (não precisa checar status separado como no Stripe).
# - A Cakto já inclui `affiliate` e `commissions` no payload — ou
#   seja, o programa de afiliados é gerenciado 100% do lado deles,
#   não precisamos construir nada de rastreamento/split aqui.

from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from config import get_settings
from db.database import get_supabase
from typing import Optional

router = APIRouter()
settings = get_settings()

# ─────────────────────────────────────────────────────────────
# IMPORTANTE: os valores de "product_id" abaixo são PLACEHOLDER.
# Depois de criar os 4 produtos/ofertas no painel da Cakto, troque
# cada "product_id" pelo ID real (aparece na URL do produto ou no
# payload de teste do webhook) e cada "checkout_url" pela URL de
# checkout real gerada pela Cakto pra cada oferta.
# ─────────────────────────────────────────────────────────────
PLANS = {
    "starter": {
        "product_id": "TROCAR_PELO_ID_REAL_STARTER",
        "checkout_url": "https://pay.cakto.com.br/TROCAR_STARTER",
        "credits": 500,
        "name": "Starter",
        "price": 49,
    },
    "pro": {
        "product_id": "TROCAR_PELO_ID_REAL_PRO",
        "checkout_url": "https://pay.cakto.com.br/TROCAR_PRO",
        "credits": 1100,
        "name": "Pro",
        "price": 97,
    },
    "creator": {
        "product_id": "TROCAR_PELO_ID_REAL_CREATOR",
        "checkout_url": "https://pay.cakto.com.br/TROCAR_CREATOR",
        "credits": 2500,
        "name": "Creator",
        "price": 197,
    },
    "agency": {
        "product_id": "TROCAR_PELO_ID_REAL_AGENCY",
        "checkout_url": "https://pay.cakto.com.br/TROCAR_AGENCY",
        "credits": 5000,
        "name": "Agency",
        "price": 349,
    },
}

PRODUCT_TO_PLAN = {v["product_id"]: k for k, v in PLANS.items()}


class CheckoutRequest(BaseModel):
    plan: str  # starter | pro | creator | agency
    user_id: str
    user_email: str


@router.post("/create-checkout")
async def create_checkout(req: CheckoutRequest):
    """Devolve a URL de checkout fixa da Cakto pro plano escolhido.
    Diferente do Stripe, não criamos uma sessão nova — só repassamos
    a checkoutUrl já cadastrada no painel da Cakto pra essa oferta.
    O user_id vai como parâmetro na URL pra facilitar re-identificar
    o comprador no webhook, caso o e-mail digitado no checkout não
    bata exatamente com o cadastrado (ex: erro de digitação)."""
    plan = PLANS.get(req.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Plano inválido")

    checkout_url = f"{plan['checkout_url']}?ref={req.user_id}"
    return {"checkout_url": checkout_url}


@router.post("/webhook")
async def cakto_webhook(request: Request, x_cakto_secret: Optional[str] = Header(None)):
    """Recebe eventos da Cakto e credita o usuário quando uma compra
    é aprovada. A Cakto manda o secret tanto no header quanto dentro
    do corpo (campo "secret") — validamos com o que vier disponível."""

    payload = await request.json()

    # Validação do secret — a Cakto manda dentro do corpo da requisição
    incoming_secret = payload.get("secret") or x_cakto_secret
    if not incoming_secret or incoming_secret != settings.cakto_webhook_secret:
        raise HTTPException(status_code=401, detail="Secret inválido")

    event = payload.get("event")
    data = payload.get("data", {})

    db = get_supabase()

    if event == "purchase_approved":
        product_id = data.get("product", {}).get("id", "")
        plan_key = PRODUCT_TO_PLAN.get(product_id)
        plan = PLANS.get(plan_key)

        customer = data.get("customer", {})
        customer_email = customer.get("email", "")

        if not plan:
            # Produto não mapeado — não é erro nosso necessariamente,
            # mas registra pra investigar (pode ser produto novo
            # criado na Cakto sem atualizar o PLANS aqui)
            raise HTTPException(status_code=200, detail=f"Produto {product_id} não mapeado — ignorado")

        user_id = None

        # Tenta primeiro pelo ref (user_id) que mandamos na checkout_url
        ref_id = data.get("refId") or data.get("ref")
        if ref_id:
            user_check = db.table("profiles").select("id").eq("id", ref_id).limit(1).execute()
            if user_check.data:
                user_id = ref_id

        # Fallback: busca pelo e-mail usado no checkout
        if not user_id and customer_email:
            user = db.table("profiles").select("id").eq("email", customer_email).single().execute()
            if user.data:
                user_id = user.data["id"]

        if user_id:
            _add_credits(db, user_id, plan["credits"], plan["name"])
        # Se não achou o usuário de jeito nenhum, não derruba o
        # webhook (a Cakto reenviaria em loop) — só não credita.

    elif event in ("subscription_canceled", "purchase_refused", "chargeback"):
        customer_email = data.get("customer", {}).get("email", "")
        if customer_email:
            user = db.table("profiles").select("id").eq("email", customer_email).single().execute()
            if user.data:
                db.table("profiles").update({"plan": "free"}).eq("id", user.data["id"]).execute()

    return {"received": True}


def _add_credits(db, user_id: str, credits: int, plan_name: str):
    """Adiciona créditos ao usuário após pagamento — idêntico ao
    padrão já usado no stripe_router.py."""
    db.table("profiles").update({"plan": plan_name.lower()}).eq("id", user_id).execute()

    current = db.table("user_credits").select("balance").eq("user_id", user_id).single().execute()
    if current.data:
        new_balance = current.data["balance"] + credits
        db.table("user_credits").update({"balance": new_balance}).eq("user_id", user_id).execute()
    else:
        db.table("user_credits").insert({"user_id": user_id, "balance": credits}).execute()

    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": credits,
        "type": "purchase",
        "description": f"Plano {plan_name} — créditos mensais (Cakto)",
    }).execute()


@router.get("/plans")
async def get_plans():
    """Retorna os planos disponíveis com a checkoutUrl fixa da Cakto."""
    return {"plans": [
        {"id": k, "name": v["name"], "price": v["price"], "credits": v["credits"], "checkout_url": v["checkout_url"]}
        for k, v in PLANS.items()
    ]}
