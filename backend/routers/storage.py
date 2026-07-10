# ─────────────────────────────────────────────────────────────
# backend/routers/storage.py
# Upload de arquivos para Cloudflare R2
# ─────────────────────────────────────────────────────────────
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from config import get_settings
import boto3
from botocore.config import Config
import uuid
import os
import httpx
router = APIRouter()
settings = get_settings()
def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
class UploadResponse(BaseModel):
    url: str
    key: str
@router.post("/upload/product-image", response_model=UploadResponse)
async def upload_product_image(file: UploadFile = File(...)):
    """Faz upload da imagem do produto para o R2 e retorna a URL pública."""
    # Valida o tipo de arquivo
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser uma imagem.")
    # Valida o tamanho (max 10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande. Máximo 10MB.")
    # Gera nome único
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
    key = f"products/{uuid.uuid4()}.{ext}"
    try:
        r2 = get_r2_client()
        r2.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=contents,
            ContentType=file.content_type,
            CacheControl="public, max-age=31536000",
        )
        url = f"{settings.r2_public_url}/{key}"
        return UploadResponse(url=url, key=key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no upload: {str(e)}")


@router.post("/upload/video", response_model=UploadResponse)
async def upload_video(file: UploadFile = File(...)):
    """Faz upload de vídeo bruto pro R2 — usado pelo Editor em Massa do
    Instagram Dark, no fluxo de 'subir vídeo novo do computador' (em vez
    de escolher entre os Reels já buscados)."""
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser um vídeo.")
    # Limite mais alto que o de imagem — vídeo pesa mais. Alinhado com o
    # "100MB por vídeo" mostrado no editor em lote de referência.
    contents = await file.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Vídeo muito grande. Máximo 100MB.")
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "mp4"
    key = f"raw-uploads/{uuid.uuid4()}.{ext}"
    try:
        r2 = get_r2_client()
        r2.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=contents,
            ContentType=file.content_type,
            CacheControl="public, max-age=31536000",
        )
        url = f"{settings.r2_public_url}/{key}"
        return UploadResponse(url=url, key=key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no upload: {str(e)}")


@router.post("/upload/font", response_model=UploadResponse)
async def upload_font(file: UploadFile = File(...)):
    """Faz upload de uma fonte personalizada (.ttf/.otf) pro R2 — usada no
    Título/Inferior do Editor em Massa. Valida pela EXTENSÃO do arquivo,
    não pelo content_type, porque navegadores não têm um mimetype padrão
    consistente pra arquivos de fonte."""
    ext = (file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "")
    if ext not in ("ttf", "otf"):
        raise HTTPException(status_code=400, detail="Fonte deve ser .ttf ou .otf.")
    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fonte muito grande. Máximo 15MB.")
    key = f"custom-fonts/{uuid.uuid4()}.{ext}"
    try:
        r2 = get_r2_client()
        r2.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=contents,
            ContentType="font/ttf" if ext == "ttf" else "font/otf",
            CacheControl="public, max-age=31536000",
        )
        url = f"{settings.r2_public_url}/{key}"
        return UploadResponse(url=url, key=key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no upload: {str(e)}")


@router.delete("/upload/{key:path}")
async def delete_file(key: str):
    """Remove um arquivo do R2."""
    try:
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=key)
        return {"message": "Arquivo removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover: {str(e)}")


@router.get("/download")
async def download_proxy(url: str, filename: str = "video.mp4"):
    """Proxy de download — busca o arquivo (R2 ou qualquer URL pública) por
    trás e devolve com Content-Disposition: attachment, forçando o
    download de verdade no navegador.

    Sem isso, um link direto pra uma URL de OUTRO domínio (o vídeo tá no
    R2, o site tá no Vercel) não é tratado como download pelo navegador —
    o atributo `download` do HTML só é respeitado em links do MESMO
    domínio. Passando pelo nosso backend, quem manda no cabeçalho HTTP
    somos nós, e isso funciona não importa a origem do arquivo."""
    safe_filename = (filename or "video.mp4").replace('"', "").replace("\n", "").replace("\r", "")

    async def stream():
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("GET", url) as res:
                if res.status_code != 200:
                    raise HTTPException(status_code=502, detail="Não consegui baixar o arquivo original.")
                async for chunk in res.aiter_bytes(chunk_size=1024 * 256):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )
