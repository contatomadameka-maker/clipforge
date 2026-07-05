# ─────────────────────────────────────────────────────────────
# backend/services/template_video_service.py
# Gera vídeo de produto a partir de um template pronto (biblioteca de
# prompts, estilo PipClip) + foto do produto enviada pelo usuário.
# ─────────────────────────────────────────────────────────────

import os
import re
import httpx
import base64
from anthropic import Anthropic

KLING_API_KEY = os.environ["KLING_API_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
KLING_API_URL = "https://api-singapore.klingai.com/v1/videos/image2video"

anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)


def _detect_media_type(image_bytes: bytes) -> str:
    """
    Detecta o formato real da imagem pelos primeiros bytes (assinatura do
    arquivo), em vez de confiar no header Content-Type — o R2 às vezes
    serve imagens com Content-Type genérico (application/octet-stream),
    o que faz a Claude rejeitar com 'Could not process image'.
    """
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    # Fallback: assume jpeg (formato mais comum de upload de produto)
    return "image/jpeg"


def describe_product_photo(image_url: str, description_style: str) -> str:
    """
    Usa a Claude (visão) pra descrever a foto do produto do usuário no MESMO
    estilo clínico/fotográfico do template — sem mencionar marca, sem
    invenções, só o que dá pra ver na imagem.
    """
    # Baixa a imagem e converte pra base64 (Claude precisa do binário, não da URL)
    img_resp = httpx.get(image_url, timeout=30, follow_redirects=True)
    img_resp.raise_for_status()

    if len(img_resp.content) < 100:
        raise ValueError(
            f"Resposta da URL da imagem parece vazia ou inválida "
            f"({len(img_resp.content)} bytes). Confira se a URL '{image_url}' "
            f"aponta pra uma imagem real e pública."
        )

    media_type = _detect_media_type(img_resp.content)
    image_b64 = base64.b64encode(img_resp.content).decode("utf-8")

    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=100,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"{description_style}\n\n"
                            "Descreva o produto desta foto em inglês, em UMA frase curta "
                            "(máximo 25 palavras / 160 caracteres), no estilo de um prompt "
                            "de geração de vídeo. Foque só na característica visual mais "
                            "marcante (cor, forma, material principal). NÃO mencione marca. "
                            "NÃO invente detalhes que não dá pra ver na foto. Responda "
                            "APENAS com a descrição, sem preâmbulo."
                        ),
                    },
                ],
            }
        ],
    )
    return message.content[0].text.strip()


def _fill_placeholders(text: str, values: dict) -> str:
    def repl(match):
        key = match.group(1)
        return values.get(key, "")
    return re.sub(r"\{(\w+)\}", repl, text)


def _truncate_to_limit(text: str, limit: int = 500) -> str:
    """
    Trava de segurança: o Kling rejeita prompts com mais de 512 caracteres.
    Usamos 500 como margem. Corta no último espaço antes do limite, pra não
    truncar no meio de uma palavra.
    """
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut


def build_multi_prompt(template: dict, product_description: str, product_name: str, price: str = "") -> list[dict]:
    """
    Monta o array multi_prompt do Kling a partir dos beats do template,
    substituindo os placeholders pela descrição real do produto do usuário.
    """
    values = {
        "PRODUCT_DESCRIPTION": product_description,
        "PRODUCT_NAME": product_name,
        "PRICE": price,
    }

    multi_prompt = []
    for beat in template["beats"]:
        duration = beat["end_s"] - beat["start_s"]
        camera_prompt = _fill_placeholders(beat["camera_prompt"], values)
        camera_prompt = _truncate_to_limit(camera_prompt)  # nunca passa de 512
        multi_prompt.append({
            "prompt": camera_prompt,
            "duration": str(duration),
        })

    return multi_prompt


def build_narration_script(template: dict, product_name: str, price: str = "") -> list[dict]:
    """Retorna a lista de falas (com timing) pra gerar a narração em PT-BR depois."""
    values = {"PRODUCT_NAME": product_name, "PRICE": price}
    return [
        {
            "start_s": beat["start_s"],
            "end_s": beat["end_s"],
            "text": _fill_placeholders(beat["narration_pt"], values),
        }
        for beat in template["beats"]
    ]


def generate_video_from_template(
    template: dict,
    product_image_url: str,
    product_name: str,
    price: str = "",
) -> dict:
    """
    Ponto de entrada principal. Roda dentro de uma Celery task (não numa
    request síncrona — a geração no Kling pode levar 1-3 minutos).

    Retorna o task_id do Kling; o polling de status usa o mesmo padrão
    que já existe no heygen.py (GET /status/{id}).
    """
    product_description = describe_product_photo(
        product_image_url, template["description_style"]
    )

    multi_prompt = build_multi_prompt(template, product_description, product_name, price)
    narration_script = build_narration_script(template, product_name, price)

    payload = {
        "model_name": "kling-v2-6",
        "image": product_image_url,
        "multi_prompt": multi_prompt,
        "negative_prompt": template.get(
            "negative_prompt",
            "blurry, distorted, extra limbs, watermark, text overlay, low quality",
        ),
        "mode": "pro",
        "sound": "off",  # narração em PT-BR é adicionada depois via TTS + mux
    }

    resp = httpx.post(
        KLING_API_URL,
        headers={
            "Authorization": f"Bearer {KLING_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()

    return {
        "kling_task_id": data["data"]["task_id"],
        "product_description": product_description,
        "narration_script": narration_script,
    }
