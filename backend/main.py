from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Routers (vamos criar um a um)
# from routers import auth, credits, studio, tiktok, videos, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ClipForge API iniciando...")
    yield
    print("ClipForge API encerrando...")


app = FastAPI(
    title="ClipForge API",
    description="Backend do ClipForge — Studio (YouTube) + TikTok Shop",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — permite o frontend Next.js chamar o backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",          # dev local
        "https://clipforge.com.br",       # produção
        "https://www.clipforge.com.br",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers (descomenta conforme for criando)
# app.include_router(auth.router,     prefix="/auth",     tags=["Auth"])
# app.include_router(credits.router,  prefix="/credits",  tags=["Credits"])
# app.include_router(studio.router,   prefix="/studio",   tags=["Studio"])
# app.include_router(tiktok.router,   prefix="/tiktok",   tags=["TikTok"])
# app.include_router(videos.router,   prefix="/videos",   tags=["Videos"])
# app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])


@app.get("/")
async def root():
    return {"status": "ok", "product": "ClipForge API", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
