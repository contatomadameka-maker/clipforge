"""
services/photo_avatar_service.py

Geração e gerenciamento de avatares fotorrealistas próprios (biblioteca ClipForge)
via HeyGen Photo Avatar API (v3/avatars, tipo "prompt").

Fluxo:
  1. generate_persona()          -> cria a "cara" da persona (1a geração, type=prompt)
  2. create_avatar_group()       -> agrupa a persona (permite múltiplos looks)
  3. generate_look()             -> gera novo cenário/roupa usando avatar_id da persona
                                     como referência (mantém a identidade)
  4. add_look_to_group()         -> anexa o look gerado ao grupo
  5. train_avatar_group()        -> treina o grupo pra consistência entre looks
  6. get_training_status()       -> poll até status == "ready"
  7. get_photo_avatar_details()  -> pega talking_photo_id / image_key final

IMPORTANTE: o vídeo é gerado passando `talking_photo_id` (não `avatar_id`) no
endpoint de vídeo — isso é diferente dos avatares públicos da HeyGen.
"""

import os
import time
import httpx
from typing import Optional

HEYGEN_API_KEY = os.environ["HEYGEN_API_KEY"]
BASE_URL = "https://api.heygen.com"

HEADERS = {
    "X-Api-Key": HEYGEN_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}


class PhotoAvatarError(Exception):
    pass


def _post(path: str, payload: dict) -> dict:
    resp = httpx.post(f"{BASE_URL}{path}", headers=HEADERS, json=payload, timeout=60)
    data = resp.json()
    if resp.status_code >= 400 or data.get("error"):
        raise PhotoAvatarError(f"{path} -> {resp.status_code}: {data}")
    return data["data"]


def _get(path: str) -> dict:
    resp = httpx.get(f"{BASE_URL}{path}", headers=HEADERS, timeout=30)
    data = resp.json()
    if resp.status_code >= 400 or data.get("error"):
        raise PhotoAvatarError(f"{path} -> {resp.status_code}: {data}")
    return data["data"]


def generate_persona(
    name: str,
    appearance_prompt: str,
    pose: str = "half_body",
    orientation: str = "vertical",
    style: str = "Realistic",
) -> dict:
    """
    Cria a primeira imagem/identidade de uma persona sintética.

    appearance_prompt deve ser MUITO descritivo para fugir da cara de "avatar de IA":
    traços físicos concretos, roupa, pose, iluminação, ambiente. Evitar adjetivos
    vagos ("linda", "bonito") — preferir descrição fotográfica.

    Exemplo de prompt bom:
      "Mulher brasileira, 26 anos, pele morena clara, cabelo castanho ondulado
       na altura dos ombros, sorriso natural discreto, vestindo blusa básica
       cor terracota, sentada em um quarto aconchegante com luz natural de janela
       lateral, fundo desfocado com estante de livros, foto estilo iPhone,
       leve grão, sem maquiagem pesada"

    Retorna dict com generation_id (usar em get_generation_status pra pegar image_key).
    """
    payload = {
        "type": "prompt",
        "name": name,
        "prompt": appearance_prompt,
        "pose": pose,
        "orientation": orientation,
        "style": style,
    }
    return _post("/v3/avatars", payload)


def generate_look(
    reference_avatar_id: str,
    look_prompt: str,
    pose: str = "half_body",
) -> dict:
    """
    Gera um NOVO cenário/roupa/ângulo para uma persona já existente, mantendo
    a identidade (rosto) consistente. Usa o avatar_id (ou look id) já criado
    como referência.

    Exemplos de look_prompt para variar ambientes tipo PipClip:
      - "sentada no sofá da sala, luz de fim de tarde, plantas ao fundo"
      - "em pé em frente a um setup de podcast, microfone visível, luz de anel"
      - "no quarto, câmera selfie levemente de cima, roupa de ficar em casa"
    """
    payload = {
        "type": "prompt",
        "name": f"look-{int(time.time())}",
        "prompt": look_prompt,
        "pose": pose,
        "avatar_id": reference_avatar_id,
    }
    return _post("/v3/avatars", payload)


def create_avatar_group(name: str, image_key: str, generation_id: Optional[str] = None) -> dict:
    """Agrupa a primeira foto gerada em um Avatar Group (permite adicionar mais looks depois)."""
    payload = {"name": name, "image_key": image_key}
    if generation_id:
        payload["generation_id"] = generation_id
    return _post("/v2/photo_avatar/avatar_group/create", payload)


def add_look_to_group(group_id: str, image_keys: list[str]) -> dict:
    """Anexa uma ou mais imagens (looks) já geradas a um grupo existente."""
    payload = {"group_id": group_id, "image_keys": image_keys}
    return _post("/v2/photo_avatar/avatar_group/add", payload)


def train_avatar_group(group_id: str) -> dict:
    """Dispara o treinamento do grupo pra melhorar consistência entre looks."""
    return _post("/v2/photo_avatar/train", {"group_id": group_id})


def get_training_status(group_id: str) -> dict:
    return _get(f"/v2/photo_avatar/train/status/{group_id}")


def wait_for_training(group_id: str, timeout_s: int = 600, interval_s: int = 10) -> dict:
    """Poll até status == 'ready' ou 'failed'. Rodar isso dentro de uma Celery task,
    nunca bloqueando uma request HTTP síncrona."""
    elapsed = 0
    while elapsed < timeout_s:
        status = get_training_status(group_id)
        if status.get("status") in ("ready", "completed"):
            return status
        if status.get("status") == "failed":
            raise PhotoAvatarError(f"Training falhou pro grupo {group_id}: {status}")
        time.sleep(interval_s)
        elapsed += interval_s
    raise PhotoAvatarError(f"Timeout esperando treino do grupo {group_id}")


def get_photo_avatar_details(photo_avatar_id: str) -> dict:
    """Retorna detalhes do avatar/look, incluindo o talking_photo_id usado na geração de vídeo."""
    return _get(f"/v2/photo_avatar/{photo_avatar_id}")


def get_generation_status(generation_id: str) -> dict:
    """Pra checar o status de uma geração assíncrona de foto (generate_persona/generate_look)."""
    return _get(f"/v2/photo_avatar/generation/{generation_id}")
