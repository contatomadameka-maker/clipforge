# ─────────────────────────────────────────────────────────────
# backend/routers/seedance.py
# Geração de vídeo final via Seedance 2.0 (ByteDance) — Replicate
# ─────────────────────────────────────────────────────────────
#
# Por quê essa mudança de arquitetura?
# Até aqui o pipeline era: Kling gera um vídeo de CENÁRIO (fundo) →
# HeyGen anima um AVATAR falando por cima → resultado ficava com cara
# de "cabeça falante colada em fundo verde", sem o produto na mão, sem
# integração real entre avatar e cenário.
#
# O Seedance 2.0 é um modelo ÚNICO que recebe: uma foto (produto e/ou
# persona) + um prompt descrevendo a cena E a fala (entre aspas) — e
# devolve o vídeo inteiro já com câmera, cena, produto na mão e o
# avatar falando com lip-sync, ÁUDIO NATIVO incluso. Uma chamada só,
# no lugar de Kling (cenário) + HeyGen (avatar) + TTS separado.
#
# O contrato exposto pro resto do projeto continua o mesmo padrão
# assíncrono já usado em cenario.py e heygen.py: POST /generate
# retorna task_id na hora, GET /status/{task_id} faz o polling.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

REPLICATE_API_URL = "https://api.replicate.com/v1"

# Modelo único — Replicate expõe prompt + imagens de referência +
# duração + resolução + geração de áudio num só endpoint (diferente da
# fal, que divide em text-to-video/image-to-video/reference-to-video).
# Docs: https://replicate.com/bytedance/seedance-2.0
REPLICATE_MODEL = "bytedance/seedance-2.0"


def _replicate_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }


class GenerateSeedanceRequest(BaseModel):
    # ── Modo genérico (Criação Livre / Modo Cena / Animar Imagem) ──
    # Se "prompt" vier preenchido, ele é usado DIRETO, ignorando toda
    # a lógica de produto+persona+fala abaixo — é o caminho usado
    # pelos tipos mais simples do Gerador.
    prompt: Optional[str] = None
    reference_images: Optional[List[str]] = None

    # ── Modo "Vídeo de Produto" (legado, mantido por compatibilidade) ──
    # Foto do produto — obrigatória nesse modo, é o que o avatar segura
    product_image_url: Optional[str] = None
    # Foto da persona/avatar (retrato) — OPCIONAL. Se não vier, o
    # Seedance gera a pessoa inteira a partir da descrição em texto
    # abaixo (idade, cabelo, corpo, roupa) — testado e confirmado
    # funcionando sem nenhuma imagem de rosto.
    persona_image_url: Optional[str] = None
    # Descrição física da persona em texto — usada sempre que não há
    # foto (ex: "mulher de 38 anos, cabelo amarrado, corpo acadêmico,
    # roupa de academia")
    persona_description: Optional[str] = None
    # Descrição da cena em linguagem natural (ex: "dentro de uma
    # academia lotada, câmera na altura do peito, iluminação quente")
    scene_prompt: Optional[str] = None
    # O que o avatar deve falar — vai automaticamente entre aspas no
    # prompt final, que é como o Seedance reconhece diálogo
    dialogue: Optional[str] = None

    aspect_ratio: str = "9:16"
    duration: str = "10"  # Seedance aceita 4–15s
    resolution: str = "480p"


class SeedanceResponse(BaseModel):
    task_id: str
    status: str


class SeedanceStatusResponse(BaseModel):
    task_id: str
    status: str  # "processing" | "done" | "error"
    video_url: str = ""
    error: str = ""


def _build_prompt(req: GenerateSeedanceRequest) -> str:
    """Monta o prompt final combinando persona + cena + diálogo,
    seguindo a convenção do Seedance: fala entre aspas, imagens
    referenciadas como [Image1], [Image2].

    Funciona em dois modos:
    - COM foto de persona: referencia [Image1] (persona) e [Image2]
      (produto), preservando o rosto da foto.
    - SEM foto (modo confirmado funcionando pelo usuário): descreve a
      pessoa inteiramente em texto (idade, cabelo, corpo, roupa) e o
      Seedance gera a persona do zero — não precisa de nenhuma imagem
      de rosto.
    """

    if req.persona_image_url:
        subject = "A pessoa em [Image1] segura o produto de [Image2]"
    else:
        # Sem foto — descreve a pessoa em texto. Se o usuário não
        # preencheu persona_description, cai num fallback genérico.
        desc = req.persona_description or "uma pessoa"
        subject = f"Uma {desc} segura o produto de [Image1]"

    scene = f"{subject}, {req.scene_prompt}, e fala diretamente para a câmera."
    speech = f' A pessoa diz: "{req.dialogue}"'
    return scene + speech


@router.post("/generate", response_model=SeedanceResponse)
async def generate_seedance(req: GenerateSeedanceRequest):
    """Cria a prediction no Replicate e retorna IMEDIATAMENTE com o id
    (status='processing'). O frontend consulta /seedance/status/{task_id}
    em polling — mesmo padrão já usado em cenario.py e heygen.py."""

    if req.prompt:
        # ── Modo genérico: Criação Livre, Modo Cena, Animar Imagem ──
        # O frontend já manda o prompt pronto — não montamos nada aqui.
        prompt = req.prompt
        reference_images = req.reference_images or []
    else:
        # ── Modo "Vídeo de Produto" (legado) ──
        if not req.product_image_url or not req.scene_prompt or not req.dialogue:
            raise HTTPException(
                status_code=422,
                detail="Sem 'prompt' genérico, é preciso informar product_image_url, scene_prompt e dialogue (modo Vídeo de Produto)."
            )
        prompt = _build_prompt(req)
        if req.persona_image_url:
            reference_images = [req.persona_image_url, req.product_image_url]
        else:
            reference_images = [req.product_image_url]

    payload = {
        "input": {
            "prompt": prompt,
            "reference_images": reference_images,
            "duration": int(req.duration),
            "resolution": req.resolution,
            "aspect_ratio": req.aspect_ratio,
            "generate_audio": True,
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{REPLICATE_API_URL}/models/{REPLICATE_MODEL}/predictions",
            headers=_replicate_headers(),
            json=payload,
        )

        if res.status_code not in (200, 201):
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro Replicate (Seedance): {res.text}"
            )

        data = res.json()
        prediction_id = data.get("id", "")

        if not prediction_id:
            raise HTTPException(status_code=500, detail="Replicate não retornou id da prediction")

        return SeedanceResponse(task_id=prediction_id, status="processing")


@router.get("/status/{task_id}", response_model=SeedanceStatusResponse)
async def get_seedance_status(task_id: str):
    """Consulta o status da prediction. O frontend chama esse endpoint
    em polling (a cada ~5s) até status == 'done' ou 'error'."""

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{REPLICATE_API_URL}/predictions/{task_id}",
            headers=_replicate_headers(),
        )

        if res.status_code != 200:
            raise HTTPException(
                status_code=res.status_code,
                detail=f"Erro ao verificar status na Replicate: {res.text}"
            )

        data = res.json()
        replicate_status = data.get("status", "")

        if replicate_status == "succeeded":
            output = data.get("output", "")
            # Alguns modelos de vídeo na Replicate devolvem string direto,
            # outros uma lista, outros um dict com "video"."url" — trata
            # os três formatos possíveis.
            video_url = ""
            if isinstance(output, str):
                video_url = output
            elif isinstance(output, list) and output:
                video_url = output[0]
            elif isinstance(output, dict):
                video_url = output.get("video", {}).get("url", "") if isinstance(output.get("video"), dict) else output.get("url", "")

            if not video_url:
                return SeedanceStatusResponse(
                    task_id=task_id,
                    status="error",
                    error=f"Replicate retornou succeeded mas sem output reconhecível: {output}",
                )

            return SeedanceStatusResponse(
                task_id=task_id,
                status="done",
                video_url=video_url,
            )

        if replicate_status in ("starting", "processing"):
            return SeedanceStatusResponse(task_id=task_id, status="processing")

        # "failed" ou "canceled"
        error_msg = data.get("error") or f"Replicate retornou status: {replicate_status}"
        return SeedanceStatusResponse(
            task_id=task_id,
            status="error",
            error=str(error_msg),
        )
