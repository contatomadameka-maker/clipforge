# ─────────────────────────────────────────────────────────────
# backend/main.py
# Ponto de entrada do backend ClipForge
# ─────────────────────────────────────────────────────────────

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, credits
# Próximos routers (descomentar conforme for criando):
# from routers import studio, tiktok, videos, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ClipForge API iniciando...")
    yield
    print("ClipForge API encerrando...")


app = FastAPI(
    title="ClipForge API",
    description="Backend do ClipForge — Studio (YouTube) + TikTok Shop",
    version="0.2.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://clipforge.com.br",
        "https://www.clipforge.com.br",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router,    prefix="/auth",    tags=["Auth"])
app.include_router(credits.router, prefix="/credits", tags=["Credits"])


# ── Health check ──────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "product": "ClipForge API", "version": "0.2.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
