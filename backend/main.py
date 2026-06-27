# ─────────────────────────────────────────────────────────────
# backend/main.py
# Ponto de entrada do backend ClipForge — versão completa
# ─────────────────────────────────────────────────────────────

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, credits, studio, websocket
# Próximos routers (descomentar quando criar):
# from routers import tiktok, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ClipForge API iniciando...")
    yield
    print("ClipForge API encerrando...")


app = FastAPI(
    title="ClipForge API",
    description="Backend do ClipForge — Studio (YouTube) + TikTok Shop",
    version="0.3.0",
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

# ── Routers HTTP ──────────────────────────────────────────────
app.include_router(auth.router,    prefix="/auth",    tags=["Auth"])
app.include_router(credits.router, prefix="/credits", tags=["Credits"])
app.include_router(studio.router,  prefix="/studio",  tags=["Studio"])

# ── WebSocket ─────────────────────────────────────────────────
app.include_router(websocket.router, prefix="/ws", tags=["WebSocket"])


# ── Health ────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "product": "ClipForge API", "version": "0.3.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
