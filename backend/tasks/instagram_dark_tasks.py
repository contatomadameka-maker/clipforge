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


# Fonte usada na faixa — precisa existir no ambiente do Render (pacote
# fonts-dejavu-core, comum em imagens Debian/Ubuntu, mas não é garantido
# em toda imagem Python do Render — validar depois do primeiro teste).
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

BAR_HEIGHT = 130  # px, altura fixa da faixa no topo


def _escape_ffmpeg_text(text: str) -> str:
    """Escapa caracteres especiais pro filtro drawtext do FFmpeg."""
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def _process_one_video(video_url: str, bar_text: str | None, bar_color: str | None, text_color: str | None, watermark_path: str | None, workdir: str) -> str:
    """Baixa 1 reel, opcionalmente adiciona uma faixa no topo (molde com
    texto customizado) e/ou marca d'água, retorna o caminho local do
    arquivo final. A faixa NÃO encolhe o vídeo — ela é somada acima,
    deixando a tela final mais alta, pra garantir que nada do vídeo
    original seja cortado."""
    uid = uuid.uuid4().hex[:8]
    raw_path = os.path.join(workdir, f"raw_{uid}.mp4")
    barred_path = os.path.join(workdir, f"barred_{uid}.mp4")
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

    # Limita a LARGURA de processamento — reduz o consumo de memória do
    # FFmpeg, essencial num plano com pouca RAM. A altura do vídeo se
    # ajusta proporcionalmente (mantém a proporção original, sem cortar).
    MAX_WIDTH = 720
    if orig_width > MAX_WIDTH:
        target_width = MAX_WIDTH
        target_height = int(orig_height * (MAX_WIDTH / orig_width)) // 2 * 2
    else:
        target_width, target_height = orig_width // 2 * 2, orig_height // 2 * 2

    base_path = raw_path
    if bar_text or bar_color:
        color = (bar_color or "#7c6df5").lstrip("#")
        txt_color = (text_color or "#ffffff").lstrip("#")
        text = _escape_ffmpeg_text(bar_text or "")

        # Faixa colorida do tamanho da largura do vídeo + texto centralizado,
        # empilhada ACIMA do vídeo (escalado só na largura) via vstack —
        # a altura final da tela cresce (barra + vídeo), nada é cortado.
        # IMPORTANTE: a faixa (color source) não tem duração fixa aqui —
        # fica "infinita" de propósito, e o -shortest no final corta ela
        # no mesmo tamanho do vídeo real. Antes eu tinha colocado d=1s
        # fixo, o que travava o FFmpeg pra sempre tentando casar uma
        # faixa de 1s com um vídeo de 10s+ no vstack.
        filter_complex = (
            f"color=c=0x{color}:s={target_width}x{BAR_HEIGHT},"
            f"drawtext=fontfile={FONT_PATH}:text='{text}':fontcolor=0x{txt_color}:fontsize=40:"
            f"x=(w-text_w)/2:y=(h-text_h)/2[bar];"
            f"[0:v]scale={target_width}:{target_height}[vid];"
            f"[bar][vid]vstack=inputs=2[vout]"
        )
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", raw_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "0:a?",
            "-shortest",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            barred_path,
        ], check=True, capture_output=True, timeout=120)
        base_path = barred_path
    elif target_width != orig_width:
        # Sem faixa, mas ainda precisa reduzir resolução
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", raw_path,
            "-vf", f"scale={target_width}:{target_height}",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            barred_path,
        ], check=True, capture_output=True, timeout=120)
        base_path = barred_path

    if watermark_path:
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", base_path, "-i", watermark_path,
            "-filter_complex", "overlay=W-w-24:H-h-24",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy",
            final_path,
        ], check=True, capture_output=True, timeout=120)
    else:
        final_path = base_path

    return final_path


def run_batch_job(task_id: str, user_id: str, video_urls: list, bar_text: str | None = None, bar_color: str | None = None, text_color: str | None = None, watermark_image_url: str | None = None):
    """Chamada pelo BackgroundTasks do FastAPI — roda de verdade o
    processamento, atualizando TASKS[task_id] conforme avança."""
    TASKS[task_id] = {"status": "processing", "progress": 0, "videos": []}
    results = []
    total = len(video_urls)

    try:
        with tempfile.TemporaryDirectory() as workdir:
            watermark_path = None
            if watermark_image_url:
                watermark_path = os.path.join(workdir, "watermark.png")
                _download(watermark_image_url, watermark_path)

            for i, video_url in enumerate(video_urls):
                TASKS[task_id]["progress"] = int((i / total) * 100)
                try:
                    final_local_path = _process_one_video(video_url, bar_text, bar_color, text_color, watermark_path, workdir)
                    key = f"instagram-dark/{user_id}/{uuid.uuid4().hex}.mp4"
                    final_url = _upload_to_r2(final_local_path, key)
                    results.append({"original_url": video_url, "final_url": final_url, "status": "done"})
                except subprocess.CalledProcessError as e:
                    # str(e) sozinho só mostra "returned exit status 1", sem
                    # dizer o motivo real — o stderr do FFmpeg tem a mensagem
                    # de verdade (ex: fonte não encontrada, filtro inválido)
                    stderr_msg = e.stderr.decode("utf-8", errors="replace")[-500:] if e.stderr else "sem detalhes"
                    error_msg = f"FFmpeg falhou: {stderr_msg}"
                    print(f"[instagram-dark] ERRO ao processar {video_url}: {error_msg}")
                    results.append({"original_url": video_url, "status": "error", "error": error_msg})
                except Exception as e:
                    print(f"[instagram-dark] ERRO ao processar {video_url}: {e}")
                    results.append({"original_url": video_url, "status": "error", "error": str(e)})

        TASKS[task_id] = {"status": "done", "progress": 100, "videos": results}
    except Exception as e:
        print(f"[instagram-dark] ERRO GERAL na task {task_id}: {e}")
        TASKS[task_id] = {"status": "error", "progress": 0, "error": str(e)}
