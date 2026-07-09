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
import time
import uuid
import boto3
import httpx
from PIL import Image, ImageDraw, ImageFont

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


def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _generate_bar_image(text: str, color_hex: str, text_color_hex: str, width: int, height: int, path: str):
    """Gera a faixa (cor sólida + texto centralizado) como PNG usando
    Pillow — muito mais rápido que o filtro drawtext do FFmpeg, que
    precisa renderizar a fonte em cada frame (chegou a estourar 120s
    de timeout numa faixa só de 1 vídeo)."""
    img = Image.new("RGB", (width, height), _hex_to_rgb(color_hex))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, 40)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((width - text_w) / 2, (height - text_h) / 2 - bbox[1]), text, font=font, fill=_hex_to_rgb(text_color_hex))
    img.save(path, "PNG")


def _process_one_video(video_url: str, bar_text: str | None, bar_color: str | None, text_color: str | None, watermark_path: str | None, workdir: str) -> str:
    """Baixa 1 reel, opcionalmente adiciona uma faixa no topo (molde com
    texto customizado) e/ou marca d'água, retorna o caminho local do
    arquivo final. A faixa NÃO encolhe o vídeo — ela é somada acima,
    deixando a tela final mais alta, pra garantir que nada do vídeo
    original seja cortado."""
    uid = uuid.uuid4().hex[:8]
    raw_path = os.path.join(workdir, f"raw_{uid}.mp4")
    bar_img_path = os.path.join(workdir, f"bar_{uid}.png")
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
    if bar_text:
        # Gera a faixa como PNG pronto (Pillow, quase instantâneo) — o
        # FFmpeg só precisa empilhar essa imagem já pronta com o vídeo,
        # sem precisar renderizar fonte frame a frame (era isso que
        # estava estourando o timeout de 120s antes).
        _generate_bar_image(bar_text or "", bar_color or "#7c6df5", text_color or "#ffffff", target_width, BAR_HEIGHT, bar_img_path)

        start_time = time.time()
        # -framerate 24 na imagem em loop evita o FFmpeg renegociar
        # timebase/fps entre a imagem parada e o vídeo real a cada
        # quadro — sem isso, o vstack ficava extremamente lento (estourava
        # até 240s numa faixa só).
        filter_complex = (
            f"[1:v]scale={target_width}:{target_height},fps=24[vid];"
            f"[0:v]fps=24[barfps];"
            f"[barfps][vid]vstack=inputs=2[vout]"
        )
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-loop", "1", "-framerate", "24", "-i", bar_img_path,
            "-i", raw_path,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "1:a?",
            "-shortest",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            barred_path,
        ], check=True, capture_output=True, timeout=240)
        elapsed = time.time() - start_time
        print(f"[instagram-dark] faixa aplicada em {elapsed:.1f}s")
        base_path = barred_path
    elif target_width != orig_width:
        # Sem faixa, mas ainda precisa reduzir resolução
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", raw_path,
            "-vf", f"scale={target_width}:{target_height}",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
            barred_path,
        ], check=True, capture_output=True, timeout=240)
        base_path = barred_path

    if watermark_path:
        subprocess.run([
            "ffmpeg", "-y", "-threads", "1",
            "-i", base_path, "-i", watermark_path,
            "-filter_complex", "overlay=W-w-24:H-h-24",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy",
            final_path,
        ], check=True, capture_output=True, timeout=240)
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

        # Cobra só pelos que deram certo — 25 créditos por Reels baixado
        # com sucesso (constante duplicada aqui de propósito, junto com
        # CREDITS_PER_REEL do router — se mudar o preço, mudar nos dois)
        success_count = sum(1 for r in results if r["status"] == "done")
        if success_count > 0:
            _charge_credits(user_id, success_count * 25, f"Instagram Dark — {success_count} Reels processados")

        TASKS[task_id] = {"status": "done", "progress": 100, "videos": results}
    except Exception as e:
        print(f"[instagram-dark] ERRO GERAL na task {task_id}: {e}")
        TASKS[task_id] = {"status": "error", "progress": 0, "error": str(e)}


def _charge_credits(user_id: str, amount: int, description: str):
    """Debita créditos direto no banco (mesma lógica do credits.py) —
    chamado só depois do processamento terminar, e só pela quantidade
    de Reels que realmente deram certo."""
    try:
        from db.database import get_supabase
        db = get_supabase()
        res = db.table("user_credits").select("balance").eq("user_id", user_id).single().execute()
        if not res.data:
            print(f"[instagram-dark] usuário {user_id} não encontrado pra cobrança")
            return
        balance = res.data.get("balance", 0)
        new_balance = max(0, balance - amount)
        db.table("user_credits").update({"balance": new_balance}).eq("user_id", user_id).execute()
        db.table("credit_transactions").insert({
            "user_id": user_id,
            "amount": -amount,
            "type": "debit",
            "description": description,
        }).execute()
        print(f"[instagram-dark] cobrado {amount} créditos de {user_id}, saldo novo: {new_balance}")
    except Exception as e:
        print(f"[instagram-dark] ERRO ao cobrar créditos: {e}")
