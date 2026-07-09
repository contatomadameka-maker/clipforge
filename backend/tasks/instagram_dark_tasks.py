# ─────────────────────────────────────────────────────────────
# backend/tasks/instagram_dark_tasks.py
# Processamento em lote — baixa os reels, prende a capa, aplica
# marca d'água, sobe pro R2.
#
# SEM CELERY DE PROPÓSITO: roda via BackgroundTasks do próprio
# FastAPI, dentro do mesmo serviço web já existente — evita precisar
# de um worker novo (que custaria mais $7/mês no Render) pra uma
# ferramenta de uso ocasional como essa.
#
# Limitação aceita: o progresso fica em memória (dict global). Se o
# serviço reiniciar no meio de um processamento, essa tarefa se perde.
# Pra escala maior no futuro, migrar pra Celery valeria a pena.
#
# Requer FFmpeg instalado no ambiente do Render.
# ─────────────────────────────────────────────────────────────

import os
import subprocess
import tempfile
import uuid
import boto3
import httpx

from config import get_settings

settings = get_settings()

# Guarda o progresso/resultado de cada tarefa em memória, por task_id
TASKS: dict = {}


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


def _process_one_video(video_url: str, cover_path: str | None, watermark_path: str | None, workdir: str) -> str:
    """Baixa 1 reel, opcionalmente prende a capa no início, opcionalmente
    aplica marca d'água, retorna o caminho local do arquivo final pronto
    pra subir. Capa e marca d'água são independentes — qualquer uma pode
    faltar."""
    uid = uuid.uuid4().hex[:8]
    raw_path = os.path.join(workdir, f"raw_{uid}.mp4")
    intro_path = os.path.join(workdir, f"intro_{uid}.mp4")
    scaled_path = os.path.join(workdir, f"scaled_{uid}.mp4")
    concat_path = os.path.join(workdir, f"concat_{uid}.mp4")
    final_path = os.path.join(workdir, f"final_{uid}.mp4")

    _download(video_url, raw_path)

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", raw_path],
        capture_output=True, text=True,
    )
    try:
        orig_width, orig_height = [int(x) for x in probe.stdout.strip().split(",")]
    except Exception:
        orig_width, orig_height = 1080, 1920

    # Limita a resolução de processamento — reduz bastante o consumo de
    # memória do FFmpeg, essencial num plano com pouca RAM. 720px de
    # largura já fica ótimo pra Reels/Stories, não precisa da resolução
    # nativa (que costuma ser 1080x1920 ou maior).
    MAX_WIDTH = 720
    if orig_width > MAX_WIDTH:
        scale = MAX_WIDTH / orig_width
        width, height = MAX_WIDTH, int(orig_height * scale) // 2 * 2  # precisa ser par
    else:
        width, height = orig_width, orig_height

    scale_filter = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"

    if cover_path:
        # Cria o clipe de intro a partir da capa e concatena com o reel
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-loop", "1", "-i", cover_path,
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", "2",
            "-vf", f"{scale_filter},fps=30",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-pix_fmt", "yuv420p",
            "-shortest", intro_path,
        ], check=True, capture_output=True)

        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", intro_path, "-i", raw_path,
            "-filter_complex",
            f"[1:v:0]{scale_filter}[reelv];"
            f"[0:v:0][0:a:0][reelv][1:a:0]concat=n=2:v=1:a=1[outv][outa]",
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            concat_path,
        ], check=True, capture_output=True)
        base_path = concat_path
    else:
        # Sem capa — só reduz a resolução do reel baixado, sem concatenar nada
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", raw_path,
            "-vf", scale_filter,
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            scaled_path,
        ], check=True, capture_output=True)
        base_path = scaled_path

    if watermark_path:
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", base_path, "-i", watermark_path,
            "-filter_complex", "overlay=W-w-24:H-h-24",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy",
            final_path,
        ], check=True, capture_output=True)
    else:
        final_path = base_path

    return final_path


def run_batch_job(task_id: str, user_id: str, video_urls: list, cover_image_url: str | None = None, watermark_image_url: str | None = None):
    """Chamada pelo BackgroundTasks do FastAPI — roda de verdade o
    processamento, atualizando TASKS[task_id] conforme avança."""
    TASKS[task_id] = {"status": "processing", "progress": 0, "videos": []}
    results = []
    total = len(video_urls)

    try:
        with tempfile.TemporaryDirectory() as workdir:
            cover_path = None
            if cover_image_url:
                cover_path = os.path.join(workdir, "cover.jpg")
                _download(cover_image_url, cover_path)

            watermark_path = None
            if watermark_image_url:
                watermark_path = os.path.join(workdir, "watermark.png")
                _download(watermark_image_url, watermark_path)

            for i, video_url in enumerate(video_urls):
                TASKS[task_id]["progress"] = int((i / total) * 100)
                try:
                    final_local_path = _process_one_video(video_url, cover_path, watermark_path, workdir)
                    key = f"instagram-dark/{user_id}/{uuid.uuid4().hex}.mp4"
                    final_url = _upload_to_r2(final_local_path, key)
                    results.append({"original_url": video_url, "final_url": final_url, "status": "done"})
                except Exception as e:
                    results.append({"original_url": video_url, "status": "error", "error": str(e)})

        TASKS[task_id] = {"status": "done", "progress": 100, "videos": results}
    except Exception as e:
        TASKS[task_id] = {"status": "error", "progress": 0, "error": str(e)}
