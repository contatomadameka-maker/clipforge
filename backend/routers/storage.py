# ─────────────────────────────────────────────────────────────
# backend/routers/storage.py
# Upload de arquivos para Cloudflare R2
# ─────────────────────────────────────────────────────────────
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import List, Optional
from config import get_settings
import boto3
from botocore.config import Config
import uuid
import os
import tempfile
import zipfile
import httpx
import logging
router = APIRouter()
settings = get_settings()
logger = logging.getLogger("storage")
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


class ZipDownloadRequest(BaseModel):
    urls: List[str]
    filenames: Optional[List[str]] = None  # index-alinhado com `urls` — nome de cada arquivo dentro do zip
    zip_filename: str = "videos.zip"


@router.post("/download-zip")
async def download_zip(req: ZipDownloadRequest):
    """Baixa vários vídeos e devolve como UM ZIP só — resolve o problema
    de 'baixar todos' disparando N downloads separados, que o navegador
    trata como suspeito (pede permissão e, mesmo permitindo, costuma
    falhar ou travar em parte deles). Um ZIP é só 1 download, sem esse
    tipo de bloqueio."""
    if not req.urls:
        raise HTTPException(status_code=400, detail="Nenhum vídeo pra zipar.")
    if len(req.urls) > 100:
        raise HTTPException(status_code=400, detail="Máximo de 100 vídeos por ZIP.")

    safe_zip_name = (req.zip_filename or "videos.zip").replace('"', "").replace("\n", "").replace("\r", "")
    if not safe_zip_name.lower().endswith(".zip"):
        safe_zip_name += ".zip"

    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)

    try:
        # ZIP_STORED (sem compressão) de propósito — vídeo já vem
        # comprimido (mp4/h264), tentar comprimir de novo só gasta CPU
        # sem economizar espaço nenhum.
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
            async with httpx.AsyncClient(timeout=60) as client:
                for i, url in enumerate(req.urls):
                    name = None
                    if req.filenames and i < len(req.filenames) and req.filenames[i]:
                        name = req.filenames[i]
                    if not name:
                        name = f"video-{i + 1}.mp4"
                    try:
                        res = await client.get(url)
                        if res.status_code == 200:
                            zf.writestr(name, res.content)
                        else:
                            logger.warning(f"[storage] falha ao baixar {url} pro zip (HTTP {res.status_code}) — pulando")
                    except Exception as e:
                        logger.warning(f"[storage] erro ao baixar {url} pro zip: {e} — pulando")
    except Exception:
        if os.path.exists(zip_path):
            os.remove(zip_path)
        raise

    # Remove o arquivo temporário só DEPOIS de terminar de mandar a
    # resposta pro navegador (BackgroundTask do Starlette roda depois do
    # response ser enviado) — apagar antes disso faria o download falhar
    # no meio.
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=safe_zip_name,
        background=BackgroundTask(lambda: os.path.exists(zip_path) and os.remove(zip_path)),
    )
