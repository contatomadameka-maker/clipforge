# ─────────────────────────────────────────────────────────────
# backend/routers/websocket.py
# WebSocket — progresso em tempo real do pipeline Studio
# O frontend conecta aqui e recebe updates a cada segundo
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from db.database import get_supabase
import asyncio
import json

router = APIRouter()

# Nomes dos agentes para exibir no frontend
AGENT_NAMES = {
    0:  "Aguardando",
    1:  "Pesquisa",
    2:  "Roteiro",
    3:  "Storyboard",
    4:  "Prompts visuais",
    5:  "Narração",
    6:  "Vídeos por cena",
    7:  "Música",
    8:  "Legendas",
    9:  "Edição e export",
    10: "Concluído",
}


@router.websocket("/studio/{project_id}")
async def studio_progress(websocket: WebSocket, project_id: str):
    """
    Conecta ao WebSocket e envia o progresso do projeto a cada 2 segundos.
    O frontend usa isso para atualizar o pipeline de agentes em tempo real.
    
    Payload enviado:
    {
      "project_id": "...",
      "status": "generating_video",
      "current_agent": 6,
      "current_agent_name": "Vídeos por cena",
      "progress": 66,
      "message": "Gerando clipes em paralelo...",
      "video_url": null  (preenchido quando done)
    }
    """
    await websocket.accept()
    print(f"[WebSocket] Cliente conectado ao projeto {project_id}")

    db = get_supabase()
    last_status = None

    try:
        while True:
            # Busca estado atual do projeto
            res = db.table("studio_projects").select(
                "status, current_agent, progress, video_url, error_message"
            ).eq("id", project_id).single().execute()

            if not res.data:
                await websocket.send_text(json.dumps({
                    "error": "Projeto não encontrado",
                    "project_id": project_id,
                }))
                break

            data = res.data
            current_agent = data.get("current_agent", 0) or 0
            status = data.get("status", "queued")

            payload = {
                "project_id": project_id,
                "status": status,
                "current_agent": current_agent,
                "current_agent_name": AGENT_NAMES.get(current_agent, ""),
                "progress": data.get("progress", 0),
                "message": _get_message(status, current_agent),
                "video_url": data.get("video_url"),
                "error_message": data.get("error_message"),
            }

            # Envia update
            await websocket.send_text(json.dumps(payload))

            # Para de enviar se terminou ou deu erro
            if status in ("done", "error"):
                print(f"[WebSocket] Projeto {project_id} finalizado: {status}")
                break

            await asyncio.sleep(2)

    except WebSocketDisconnect:
        print(f"[WebSocket] Cliente desconectado do projeto {project_id}")
    except Exception as e:
        print(f"[WebSocket] Erro: {e}")
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass


def _get_message(status: str, agent: int) -> str:
    messages = {
        "queued":            "Aguardando na fila...",
        "researching":       "Coletando fontes e referências...",
        "scripting":         "Escrevendo roteiro com Claude...",
        "storyboarding":     "Criando storyboard por cena...",
        "prompting":         "Gerando prompts visuais...",
        "narrating":         "Gerando narração com ElevenLabs...",
        "generating_video":  "Gerando clipes de vídeo com Runway...",
        "music":             "Compondo trilha sonora com Suno...",
        "captions":          "Transcrevendo legendas com Whisper...",
        "editing":           "Renderizando vídeo final com Shotstack...",
        "done":              "Vídeo pronto para download!",
        "error":             "Erro na geração — créditos estornados.",
    }
    return messages.get(status, "Processando...")
