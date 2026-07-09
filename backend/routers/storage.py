# ─────────────────────────────────────────────────────────────
# backend/routers/storage.py
# Upload de arquivos para Cloudflare R2
# ─────────────────────────────────────────────────────────────
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from config import get_settings
import boto3
from botocore.config import Config
import uuid
import os
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


@router.delete("/upload/{key:path}")
async def delete_file(key: str):
    """Remove um arquivo do R2."""
    try:
        r2 = get_r2_client()
        r2.delete_object(Bucket=settings.r2_bucket_name, Key=key)
        return {"message": "Arquivo removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover: {str(e)}")
