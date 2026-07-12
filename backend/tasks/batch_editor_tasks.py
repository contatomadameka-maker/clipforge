# ─────────────────────────────────────────────────────────────
# backend/tasks/batch_editor_tasks.py
# Editor em Massa — versão Celery. Cada VÍDEO do lote vira uma task
# independente (não o lote inteiro) — isso é de propósito: com N
# usuários mandando lotes ao mesmo tempo, os vídeos de todo mundo
# entram na MESMA fila do worker e disputam o `--concurrency` global
# dele igualzinho, em vez de 1 usuário conseguir travar o worker
# inteiro processando só o lote dele sequencialmente.
#
# Estado do job (progresso, resultados) fica no REDIS, não em memória —
# sobrevive a reinício do servidor web (diferente do BackgroundTasks
# antigo) e é visível tanto pelo processo web quanto pelo worker,
# porque os dois são processos SEPARADOS.
# ─────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import ssl

import redis

from config import get_settings
from tasks.studio_tasks import celery_app
from services.shared.batch_editor_core import BatchEditRequest, process_one_video

settings = get_settings()
logger = logging.getLogger("batch_editor_tasks")

# Mesma URL do Redis já usada pelo Celery (Upstash). O texto
# "?ssl_cert_reqs=CERT_NONE" que já vem escrito na própria URL funciona
# pro transporte do Celery (kombu), mas o redis-py "cru" (usado aqui só
# pra guardar o progresso do job) não entende esse texto direto da URL —
# precisa do valor em Python de verdade (ssl.CERT_NONE), passado como
# parâmetro explícito, por isso repete aqui mesmo já estando na URL.
_redis_client = redis.from_url(settings.redis_url, decode_responses=True, ssl_cert_reqs=ssl.CERT_NONE)

_JOB_TTL_SECONDS = 24 * 60 * 60  # 24h — depois disso o Redis limpa sozinho


def init_job(job_id: str, total: int):
    pipe = _redis_client.pipeline()
    pipe.set(f"bejob:{job_id}:total", total, ex=_JOB_TTL_SECONDS)
    pipe.set(f"bejob:{job_id}:completed", 0, ex=_JOB_TTL_SECONDS)
    pipe.execute()


def get_job_status(job_id: str) -> dict | None:
    total_raw = _redis_client.get(f"bejob:{job_id}:total")
    if total_raw is None:
        return None
    total = int(total_raw)
    completed = int(_redis_client.get(f"bejob:{job_id}:completed") or 0)

    # Busca todos os resultados já gravados (só os índices que já
    # terminaram têm chave — os que faltam simplesmente não aparecem
    # ainda, e entram conforme as tasks vão concluindo).
    videos = []
    keys = _redis_client.keys(f"bejob:{job_id}:result:*")
    for key in keys:
        raw = _redis_client.get(key)
        if raw:
            videos.append(json.loads(raw))

    progress = int((completed / total) * 100) if total else 100
    status = "done" if completed >= total else "processing"
    return {"status": status, "progress": progress, "completed": completed, "total": total, "videos": videos}


def _record_result(job_id: str, index: int, result: dict):
    pipe = _redis_client.pipeline()
    pipe.set(f"bejob:{job_id}:result:{index}", json.dumps(result), ex=_JOB_TTL_SECONDS)
    pipe.incr(f"bejob:{job_id}:completed")
    pipe.expire(f"bejob:{job_id}:completed", _JOB_TTL_SECONDS)
    pipe.execute()


@celery_app.task(bind=True, name="batch_editor.process_video", max_retries=0)
def process_batch_video_task(self, job_id: str, index: int, video_url: str, req_dict: dict):
    """Task individual — processa 1 vídeo do lote e grava o resultado no
    Redis. `max_retries=0` de propósito: cada vídeo já tem seu próprio
    tratamento de erro dentro de process_one_video (devolve status
    "error" em vez de derrubar a task), então retry automático do Celery
    só reprocessaria vídeo que já devolveu erro de propósito (ex: link
    quebrado) — não ajudaria e gastaria processamento à toa."""
    try:
        req = BatchEditRequest(**req_dict)
        result = asyncio.run(process_one_video(job_id, index, video_url, req))
    except Exception as e:
        logger.error(f"[batch_editor_tasks] job={job_id} idx={index} falha inesperada na task: {e}")
        result = {"original_url": video_url, "status": "error", "error": str(e)}

    _record_result(job_id, index, result)
    return result
