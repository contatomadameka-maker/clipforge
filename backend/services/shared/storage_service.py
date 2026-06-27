# ─────────────────────────────────────────────────────────────
# backend/services/shared/storage_service.py
# Upload e download de arquivos no Cloudflare R2
# Compatível com S3 via boto3
# ─────────────────────────────────────────────────────────────

import boto3
from botocore.config import Config
from config import get_settings
from functools import lru_cache

settings = get_settings()


@lru_cache()
def get_r2_client():
    """Retorna o cliente R2 em cache."""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.cloudflare_r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.cloudflare_r2_access_key,
        aws_secret_access_key=settings.cloudflare_r2_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


async def upload_file(
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Faz upload de bytes para o R2.
    Retorna a URL pública do arquivo.
    """
    client = get_r2_client()
    client.put_object(
        Bucket=settings.cloudflare_r2_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    public_url = f"{settings.cloudflare_r2_public_url}/{key}"
    print(f"[Storage] Upload concluído: {public_url}")
    return public_url


async def upload_audio(key: str, data: bytes, content_type: str = "audio/mpeg") -> str:
    return await upload_file(key, data, content_type)


async def upload_video(key: str, data: bytes, content_type: str = "video/mp4") -> str:
    return await upload_file(key, data, content_type)


async def upload_image(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    return await upload_file(key, data, content_type)


async def download_file(key: str) -> bytes:
    """Baixa um arquivo do R2 e retorna os bytes."""
    client = get_r2_client()
    res = client.get_object(Bucket=settings.cloudflare_r2_bucket, Key=key)
    return res["Body"].read()


def get_public_url(key: str) -> str:
    """Retorna a URL pública de um arquivo já uploadado."""
    return f"{settings.cloudflare_r2_public_url}/{key}"
