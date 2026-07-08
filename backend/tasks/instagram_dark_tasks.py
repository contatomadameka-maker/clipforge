# ─────────────────────────────────────────────────────────────
# backend/tasks/instagram_dark_tasks.py
# Processamento em lote: baixa os reels selecionados, prende uma
# "capa" (intro) no começo de cada um, aplica marca d'água por cima,
# e sobe o resultado final pro R2.
#
# Requer FFmpeg instalado no ambiente do Render (via apt/buildpack —
# não é um pacote Python, precisa confirmar que existe no servidor).
# ─────────────────────────────────────────────────────────────

import os
import subprocess
import tempfile
import uuid
import boto3
import httpx

from tasks.studio_tasks import celery_app  # reaproveita a mesma instância Celery já configurada
from config import get_settings

settings = get_settings()


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
    )


def _download(url: str, dest_path: str):
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_bytes():
                f.write(chunk)


def _upload_to_r2(local_path: str, key: str) -> str:
    client = _r2_client()
    client.upload_file(local_path, settings.r2_bucket_name, key)
    return f"{settings.r2_public_url}/{key}"


def _process_one_video(video_url: str, cover_path: str, watermark_path: str | None, workdir: str) -> str:
    """Baixa 1 reel, prende a capa no início, aplica marca d'água, retorna
    o caminho local do arquivo final pronto pra subir."""
    uid = uuid.uuid4().hex[:8]
    raw_path = os.path.join(workdir, f"raw_{uid}.mp4")
    intro_path = os.path.join(workdir, f"intro_{uid}.mp4")
    concat_path = os.path.join(workdir, f"concat_{uid}.mp4")
    final_path = os.path.join(workdir, f"final_{uid}.mp4")

    _download(video_url, raw_path)

    # Descobre resolução do vídeo original, pra capa casar com o tamanho certo
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", raw_path],
        capture_output=True, text=True,
    )
    try:
        width, height = probe.stdout.strip().split(",")
    except Exception:
        width, height = "1080", "1920"

    # 1) Cria um clipe de 2s a partir da imagem de capa, com áudio mudo
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", cover_path,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "2",
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps=30",
        "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p",
        "-shortest", intro_path,
    ], check=True, capture_output=True)

    # 2) Concatena a capa + o reel baixado
    subprocess.run([
        "ffmpeg", "-y",
        "-i", intro_path, "-i", raw_path,
        "-filter_complex", "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]",
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-c:a", "aac",
        concat_path,
    ], check=True, capture_output=True)

    # 3) Aplica marca d'água (canto inferior direito) se foi fornecida
    if watermark_path:
        subprocess.run([
            "ffmpeg", "-y",
            "-i", concat_path, "-i", watermark_path,
            "-filter_complex", "overlay=W-w-24:H-h-24",
            "-c:a", "copy",
            final_path,
        ], check=True, capture_output=True)
    else:
        final_path = concat_path

    return final_path


@celery_app.task(bind=True, name="instagram_dark.process_reels_batch")
def process_reels_batch(self, user_id: str, video_urls: list, cover_image_url: str, watermark_image_url: str | None = None):
    results = []
    total = len(video_urls)

    with tempfile.TemporaryDirectory() as workdir:
        cover_path = os.path.join(workdir, "cover.jpg")
        _download(cover_image_url, cover_path)

        watermark_path = None
        if watermark_image_url:
            watermark_path = os.path.join(workdir, "watermark.png")
            _download(watermark_image_url, watermark_path)

        for i, video_url in enumerate(video_urls):
            self.update_state(state="PROGRESS", meta={"progress": int((i / total) * 100)})
            try:
                final_local_path = _process_one_video(video_url, cover_path, watermark_path, workdir)
                key = f"instagram-dark/{user_id}/{uuid.uuid4().hex}.mp4"
                final_url = _upload_to_r2(final_local_path, key)
                results.append({"original_url": video_url, "final_url": final_url, "status": "done"})
            except Exception as e:
                results.append({"original_url": video_url, "status": "error", "error": str(e)})

    return results
