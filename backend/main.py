# ─────────────────────────────────────────────────────────────
# backend/main.py
# ─────────────────────────────────────────────────────────────

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, credits, studio, websocket, copy

app = FastAPI(
    title="ClipForge API",
    version="1.0.0",
    description="Backend da plataforma ClipForge",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(credits.router, prefix="/credits", tags=["Credits"])
app.include_router(studio.router, prefix="/studio", tags=["Studio"])
app.include_router(websocket.router, prefix="/ws", tags=["WebSocket"])
app.include_router(copy.router, prefix="/copy", tags=["Copy"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "clipforge-api"}
