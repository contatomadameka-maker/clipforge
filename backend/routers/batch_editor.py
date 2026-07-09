# ─────────────────────────────────────────────────────────────
# backend/routers/batch_editor.py
# Editor em Massa (Instagram Dark) — Fase 1: Bordas/Enquadramento.
# Recebe uma lista de vídeos (já no R2, sejam de Reels selecionados
# ou upload novo) + UMA config única de zoom/posição/cor/corte, e
# aplica a MESMA edição em todos. Se o usuário quiser um vídeo
# diferente, ele processa separado (1 vídeo por vez) — decisão
# tomada de propósito pra manter a v1 simples.
#
# Fases futuras (não implementadas ainda): Título, Texto inferior,
# Overlay/marca d'água, Modo anti-duplicidade.
# ─────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import tempfile
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import get_settings
from routers.storage import get_r2_client

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("batch_editor")

CANVAS_W = 1080
CANVAS_H = 1920

# Estado dos jobs em memória — mesmo padrão já usado no resto do backend
# (kling_elements.py, etc). Em produção com múltiplos workers isso devia
# ir pro Redis, mas roda bem com WEB_CONCURRENCY=1.
_job_state: dict[str, dict] = {}


class BatchEditRequest(BaseModel):
    videos: List[str]              # URLs já públicas no R2 (Reels selecionados OU upload novo)
    zoom: float = 100.0            # % — 100 = encaixa o vídeo inteiro no canvas, >100 aproxima e corta
    pos_x: float = 50.0            # % — posição horizontal (0=esquerda, 50=centro, 100=direita)
    pos_y: float = 50.0            # % — posição vertical (0=topo, 50=centro, 100=rodapé)
    border_color: str = "#ffffff"  # cor de preenchimento das bordas, em hex
    fill_top_pct: float = 0.0      # % do vídeo ORIGINAL cortado no topo (remove legenda/marca antiga)
    fill_bottom_pct: float = 0.0   # % do vídeo ORIGINAL cortado no rodapé
    fill_mode: str = "manual"      # "automatico" ainda não implementado nessa fase — cai pro manual


async def _run(cmd: list[str]) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    return proc.returncode, out, err


async def _probe_dimensions(url: str) -> tuple[int, int]:
    """Descobre largura/altura do vídeo de origem via ffprobe, direto na
    URL pública do R2 — sem precisar baixar o arquivo manualmente antes."""
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json", url,
    ]
    code, out, err = await _run(cmd)
    if code != 0:
        raise RuntimeError(f"ffprobe falhou: {err.decode(errors='ignore')[-500:]}")
    data = json.loads(out)
    if not data.get("streams"):
        raise RuntimeError(f"ffprobe não encontrou stream de vídeo: {out.decode(errors='ignore')}")
    stream = data["streams"][0]
    return int(stream["width"]), int(stream["height"])


def _hex_to_ffmpeg_color(hex_color: str) -> str:
    """FFmpeg espera 0xRRGGBB — converte a partir de '#rrggbb'."""
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        h = "ffffff"
    return f"0x{h}"


def _build_filter(src_w: int, src_h: int, req: BatchEditRequest) -> str:
    """Monta a cadeia de filtros do FFmpeg pra encaixar o vídeo no canvas
    1080x1920 com zoom/posição/bordas. Os números são calculados aqui em
    Python (pixels concretos) em vez de expressões dentro do FFmpeg —
    mais fácil de depurar e logar se algo sair errado."""

    # 1) Corte manual de topo/rodapé do vídeo ORIGINAL — remove legenda,
    #    marca d'água ou faixa que já veio queimada no vídeo fonte.
    #    Limitado a 45% de cada lado pra nunca zerar a imagem por engano.
    top_px = int(src_h * max(0.0, min(req.fill_top_pct, 45.0)) / 100)
    bottom_px = int(src_h * max(0.0, min(req.fill_bottom_pct, 45.0)) / 100)
    cropped_h = max(2, src_h - top_px - bottom_px)
    crop_source = f"crop={src_w}:{cropped_h}:0:{top_px}"

    # 2) Escala pra caber no canvas ("contain") + fator de zoom por cima.
    #    zoom=100% -> cabe inteiro; zoom>100% -> fica maior que o canvas
    #    (vai sobrar pra cortar no passo 4); zoom<100% -> sobra borda
    #    (preenchida no passo 3).
    scale_base = min(CANVAS_W / src_w, CANVAS_H / cropped_h)
    zoom_factor = max(req.zoom, 10.0) / 100.0
    scale = scale_base * zoom_factor

    new_w = max(2, int(round(src_w * scale / 2) * 2))   # sempre par — requisito do libx264
    new_h = max(2, int(round(cropped_h * scale / 2) * 2))
    scale_filter = f"scale={new_w}:{new_h}"

    # 3) Preenche até pelo menos o tamanho do canvas (cobre zoom < 100%),
    #    na cor escolhida, deslocado conforme a posição — não sempre
    #    centralizado.
    pad_w = max(new_w, CANVAS_W)
    pad_h = max(new_h, CANVAS_H)
    pad_x = int((pad_w - new_w) * (req.pos_x / 100))
    pad_y = int((pad_h - new_h) * (req.pos_y / 100))
    color = _hex_to_ffmpeg_color(req.border_color)
    pad_filter = f"pad={pad_w}:{pad_h}:{pad_x}:{pad_y}:color={color}"

    # 4) Corta pro tamanho exato do canvas (cobre zoom > 100%, onde o
    #    vídeo escalado ficou maior que 1080x1920 e precisa recortar o
    #    excesso), também respeitando a posição escolhida.
    crop_x = int((pad_w - CANVAS_W) * (req.pos_x / 100))
    crop_y = int((pad_h - CANVAS_H) * (req.pos_y / 100))
    final_crop = f"crop={CANVAS_W}:{CANVAS_H}:{crop_x}:{crop_y}"

    return f"{crop_source},{scale_filter},{pad_filter},{final_crop}"


async def _process_one(job_id: str, index: int, video_url: str, req: BatchEditRequest):
    state = _job_state[job_id]
    out_path = None
    try:
        src_w, src_h = await _probe_dimensions(video_url)
        vf = _build_filter(src_w, src_h, req)
        logger.info(f"[batch_editor] job={job_id} idx={index} filtro={vf}")

        out_path = os.path.join(tempfile.gettempdir(), f"batch_{job_id}_{index}.mp4")
        cmd = [
            "ffmpeg", "-y", "-i", video_url,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-threads", "1",
            out_path,
        ]
        code, _, err = await _run(cmd)
        if code != 0:
            raise RuntimeError(f"ffmpeg falhou: {err.decode(errors='ignore')[-800:]}")

        with open(out_path, "rb") as f:
            data = f.read()

        key = f"batch-editor/{job_id}/{index}_{uuid.uuid4().hex[:8]}.mp4"
        r2 = get_r2_client()
        r2.put_object(
            Bucket=settings.r2_bucket_name, Key=key, Body=data,
            ContentType="video/mp4", CacheControl="public, max-age=31536000",
        )
        final_url = f"{settings.r2_public_url}/{key}"

        state["results"][index] = {"original_url": video_url, "final_url": final_url, "status": "done"}
    except Exception as e:
        logger.error(f"[batch_editor] job={job_id} idx={index} falhou: {e}")
        state["results"][index] = {"original_url": video_url, "status": "error", "error": str(e)}
    finally:
        if out_path and os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        state["completed"] += 1
        if state["completed"] >= state["total"]:
            state["status"] = "done"


async def _process_batch(job_id: str, req: BatchEditRequest):
    if req.fill_mode == "automatico":
        # Detecção automática de onde cortar (legenda/marca queimada) ainda
        # não existe — cai pro comportamento manual com os valores
        # informados, em vez de travar o usuário sem processar nada.
        logger.warning(f"[batch_editor] job={job_id} pediu fill_mode=automatico — ainda não implementado, usando manual")

    # Processa em SEQUÊNCIA, não em paralelo — mesmo racional do resto do
    # Instagram Dark: evita estourar CPU/memória do plano do Render com
    # vários ffmpeg simultâneos.
    for i, video_url in enumerate(req.videos):
        await _process_one(job_id, i, video_url, req)


@router.post("/process")
async def start_batch_edit(req: BatchEditRequest, background_tasks: BackgroundTasks):
    if not req.videos:
        raise HTTPException(status_code=400, detail="Nenhum vídeo enviado.")
    if len(req.videos) > 50:
        raise HTTPException(status_code=400, detail="Máximo de 50 vídeos por lote.")

    job_id = uuid.uuid4().hex
    _job_state[job_id] = {
        "total": len(req.videos),
        "completed": 0,
        "results": [None] * len(req.videos),
        "status": "processing",
    }
    background_tasks.add_task(_process_batch, job_id, req)
    return {"job_id": job_id, "total": len(req.videos)}


@router.get("/status/{job_id}")
async def get_batch_status(job_id: str):
    state = _job_state.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    progress = int((state["completed"] / state["total"]) * 100) if state["total"] else 100
    return {
        "status": state["status"],
        "progress": progress,
        "completed": state["completed"],
        "total": state["total"],
        "videos": [r for r in state["results"] if r is not None],
    }
