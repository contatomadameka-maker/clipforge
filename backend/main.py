# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, credits, studio, websocket, copy, storage, heygen, cenario, seedance, videos
from routers import stripe_router, cakto_router
app = FastAPI(title="ClipForge API", version="1.0.0")
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
app.include_router(storage.router, prefix="/storage", tags=["Storage"])
app.include_router(heygen.router, prefix="/heygen", tags=["HeyGen"])
app.include_router(cenario.router, prefix="/cenario", tags=["Cenário"])
app.include_router(seedance.router, prefix="/seedance", tags=["Seedance"])
app.include_router(videos.router, prefix="/videos", tags=["Videos"])
app.include_router(stripe_router.router, prefix="/stripe", tags=["Stripe"])
app.include_router(cakto_router.router, prefix="/cakto", tags=["Cakto"])
@app.get("/health")
async def health():
    return {"status": "ok", "service": "clipforge-api"}
