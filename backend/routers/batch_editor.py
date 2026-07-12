# ─────────────────────────────────────────────────────────────
# backend/routers/batch_editor.py
# Editor em Massa (Instagram Dark) — Bordas/Enquadramento, Título,
# Texto inferior, Overlay/marca-d'água e Modo anti-duplicidade.
#
# Endpoints HTTP só — toda a lógica de processamento (FFmpeg, fontes,
# overlay) mora em services/shared/batch_editor_core.py, e o
# processamento de verdade roda no WORKER do Celery (não aqui, não
# mais via BackgroundTasks) — ver tasks/batch_editor_tasks.py.
#
# Migrado de BackgroundTasks pra Celery porque, com várias pessoas
# processando lote ao mesmo tempo, tudo rodava no MESMO processo que
# atende a internet (WEB_CONCURRENCY=1) — sem controle de quantos
# vídeos processam ao mesmo tempo no total do sistema, um pico de uso
# conseguia travar o site inteiro pra todo mundo. Celery com worker
# separado resolve isso: o site fica sempre responsivo, e o
# `--concurrency` do worker limita quantos vídeos processam ao mesmo
# tempo de verdade, não importa quantos usuários mandaram lote junto —
# eles só entram numa fila e processam na ordem.
# ─────────────────────────────────────────────────────────────

import logging
import uuid

from fastapi import APIRouter, HTTPException

from services.shared.batch_editor_core import BatchEditRequest
from tasks.batch_editor_tasks import init_job, get_job_status, process_batch_video_task

router = APIRouter()
logger = logging.getLogger("batch_editor")

# Levas muito grandes de uma vez só carregam mais risco (se o worker
# reiniciar ou travar no meio, o Redis guarda o progresso — mas ainda
# assim, um lote gigante é mais coisa pra perder se algo der errado).
# 100 é um limite generoso pra uso normal (Reels/TikTok/Facebook de uma
# página só) sem chegar perto do que travaria o worker.
MAX_VIDEOS_PER_BATCH = 100


@router.post("/process")
async def start_batch_edit(req: BatchEditRequest):
    if not req.videos:
        raise HTTPException(status_code=400, detail="Nenhum vídeo enviado.")
    if len(req.videos) > MAX_VIDEOS_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"Máximo de {MAX_VIDEOS_PER_BATCH} vídeos por lote.")

    if req.fill_mode == "automatico":
        # Detecção automática de onde cortar (legenda/marca queimada) ainda
        # não existe — cai pro comportamento manual com os valores
        # informados, em vez de travar o usuário sem processar nada.
        logger.warning("[batch_editor] pediu fill_mode=automatico — ainda não implementado, usando manual")

    job_id = uuid.uuid4().hex
    init_job(job_id, len(req.videos))

    req_dict = req.model_dump()
    for i, video_url in enumerate(req.videos):
        process_batch_video_task.delay(job_id, i, video_url, req_dict)

    return {"job_id": job_id, "total": len(req.videos)}


@router.get("/status/{job_id}")
async def get_batch_status(job_id: str):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return status
