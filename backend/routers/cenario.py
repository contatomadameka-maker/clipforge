# ─────────────────────────────────────────────────────────────
# backend/routers/cenario.py
# Geração de cenário via Kling AI (text-to-VIDEO, não mais imagem)
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import httpx
import jwt
import time

router = APIRouter()
settings = get_settings()

# Mesmo domínio que já validamos funcionando na geração de vídeo dos
# templates de produto (api.klingai.com, sem o "-singapore", dava erro
# de região em alguns testes anteriores nesse projeto)
KLING_API_URL = "https://api-singapore.klingai.com"


def get_kling_token() -> str:
    """Gera JWT token para autenticação no Kling AI, se a key tiver o
    formato AccessKeyID:AccessKeySecret. Se não tiver ':', usa a key
    direto como Bearer (é o caso da sua conta atual, já confirmado
    funcionando nos testes)."""
    parts = settings.kling_api_key.split(":")
    if len(parts) == 2:
        access_key_id, access_key_secret = parts
    else:
        return settings.kling_api_key

    now = int(time.time())
    payload = {
        "iss": access_key_id,
        "exp": now + 1800,  # 30 min
        "nbf": now - 5,
    }
    token = jwt.encode(payload, access_key_secret, algorithm="HS256")
    return token


class GenerateCenarioRequest(BaseModel):
    prompt: str
    negative_prompt: str = "people, person, human, text, watermark, blurry, low quality"
    aspect_ratio: str = "9:16"  # Para vídeo vertical TikTok


class CenarioResponse(BaseModel):
    task_id: str
    status: str


class CenarioStatusResponse(BaseModel):
    task_id: str
    status: str  # "processing" | "done" | "error"
    video_url: str = ""
    error: str = ""


PROMPT_TEMPLATES = {
    "estudio": "Professional product photography studio, clean white background, soft natural lighting, minimalist aesthetic, high-end commercial photography",
    "lifestyle_urbano": "Modern urban lifestyle background, city street during golden hour, bokeh effect, professional photography",
    "praia": "Tropical beach sunset background, golden hour lighting, warm tones, professional photography, no people",
    "corporativo": "Modern corporate office background, clean desk, professional environment, soft lighting",
    "aesthetic": "Aesthetic pastel room background, soft pink and beige tones, minimalist decor, cozy atmosphere",
    "natureza": "Beautiful nature background, lush green forest, soft sunlight filtering through trees, serene atmosphere",
}


@router.get("/templates")
async def get_templates():
    """Retorna prompts pré-definidos de cenários."""
    return {"templates": [
        {"id": k, "label": v.split(",")[0].strip(), "prompt": v}
        for k, v in PROMPT_TEMPLATES.items()
    ]}


@router.post("/generate", response_model=CenarioResponse)
async def generate_cenario(req: GenerateCenarioRequest):
    """Dispara a geração de VÍDEO de cenário no Kling AI e retorna
    IMEDIATAMENTE com o task_id (status='processing').

    Antes esse endpoint ficava até 150s fazendo polling no Kling dentro
    da própria requisição HTTP, e o Render (ou proxy na frente) cortava
    a conexão antes disso, gerando 408 Request Timeout no frontend.

    Agora segue o MESMO padrão já validado no heygen.py: generate só
    inicia o job e devolve um ID; o frontend consulta /cenario/status/{task_id}
    a cada poucos segundos até o vídeo terminar.
    """

    enriched_prompt = f"{req.prompt}, professional product video background, high quality, cinematic, no people, no text, static camera, subtle ambient movement"

    headers = {
        "Authorization": f"Bearer {get_kling_token()}",
        "Content-Type": "application/json",
    }

    payload = {
        "model_name": "kling-v1",
        "prompt": enriched_prompt,
        "negative_prompt": req.negative_prompt,
        "duration": "5",
        "aspect_ratio": req.aspect_ratio,
        "mode": "std",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{KLING_API_URL}/v1/videos/text2video",
            headers=headers,
            json=payload,
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro Kling: {res.text}"
            )

        data = res.json()
        task_id = data.get("data", {}).get("task_id", "")

        if not task_id:
            raise HTTPException(status_code=500, detail="Kling não retornou task_id")

        return CenarioResponse(task_id=task_id, status="processing")


@router.get("/status/{task_id}", response_model=CenarioStatusResponse)
async def get_cenario_status(task_id: str):
    """Consulta o status do vídeo no Kling AI. O frontend chama esse
    endpoint em polling (a cada ~5s) até status == 'done' ou 'error' —
    mesmo padrão do GET /heygen/status/{video_id}."""

    headers = {
        "Authorization": f"Bearer {get_kling_token()}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{KLING_API_URL}/v1/videos/text2video/{task_id}",
            headers=headers,
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro ao verificar status no Kling: {res.text}"
            )

        raw = res.json()
        # LOG TEMPORÁRIO — remover depois de confirmar o formato real da
        # resposta do Kling. Isso aparece nos logs do Render (não no
        # navegador), pra descobrir por que task_status nunca chega a
        # "succeed" mesmo com HTTP 200 em todas as tentativas.
        print(f"[Kling status raw] task_id={task_id} response={raw}")

        data = raw.get("data", {})
        task_status = data.get("task_status", "processing")

        if task_status == "succeed":
            videos = data.get("task_result", {}).get("videos", [])
            video_url = videos[0].get("url", "") if videos else ""

            if not video_url:
                return CenarioStatusResponse(
                    task_id=task_id,
                    status="error",
                    error="Kling retornou sucesso mas sem video_url",
                )

            return CenarioStatusResponse(
                task_id=task_id,
                status="done",
                video_url=video_url,
            )

        if task_status == "failed":
            return CenarioStatusResponse(
                task_id=task_id,
                status="error",
                error="Kling falhou ao gerar vídeo",
            )

        # "processing" ou "submitted" — ainda não terminou
        return CenarioStatusResponse(task_id=task_id, status="processing")
