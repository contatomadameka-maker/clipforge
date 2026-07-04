"""
scripts/test_describe_product.py

Teste ISOLADO só da etapa de visão (Claude descrevendo a foto do produto).
NÃO chama o Kling, NÃO gasta crédito de vídeo — só testa se a descrição
gerada fica boa o suficiente pra plugar no lugar de {PRODUCT_DESCRIPTION}
no template.

Como rodar:
    python -m scripts.test_describe_product "https://url-da-foto-do-produto.jpg"

Ou, se preferir testar com uma foto local (ainda não subiu pro R2):
    python -m scripts.test_describe_product --local /caminho/para/foto.jpg
"""

import sys
import os
import base64
import httpx
from anthropic import Anthropic

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

# Mesmo texto que está na coluna description_style do template "Giro elegante"
DESCRIPTION_STYLE = (
    "Descrição clínica e fotográfica, focando em forma, cor, material, "
    "textura e acabamento visível na foto. Nunca mencione marca, nunca "
    "invente características que não estão visíveis. Estilo: como uma "
    "ficha técnica de e-commerce de luxo, mas em formato de prompt de vídeo."
)


def describe_from_bytes(image_bytes: bytes, media_type: str) -> str:
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    message = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
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
                            f"{DESCRIPTION_STYLE}\n\n"
                            "Descreva o produto desta foto em inglês, em 2-3 frases, "
                            "no estilo de um prompt de geração de vídeo (formato usado "
                            "por ferramentas como Kling AI / RunwayML). Foque em forma, "
                            "cor, material e características visuais únicas. NÃO mencione "
                            "marca. NÃO invente detalhes que não dá pra ver na foto. "
                            "Responda APENAS com a descrição, sem preâmbulo."
                        ),
                    },
                ],
            }
        ],
    )
    return message.content[0].text.strip()


def main():
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.test_describe_product <url_da_foto>")
        print("  ou: python -m scripts.test_describe_product --local <caminho>")
        sys.exit(1)

    if sys.argv[1] == "--local":
        path = sys.argv[2]
        with open(path, "rb") as f:
            image_bytes = f.read()
        ext = path.split(".")[-1].lower()
        media_type = "image/png" if ext == "png" else "image/jpeg"
    else:
        url = sys.argv[1]
        resp = httpx.get(url, timeout=30)
        resp.raise_for_status()
        image_bytes = resp.content
        media_type = resp.headers.get("content-type", "image/jpeg")

    print("Gerando descrição...\n")
    description = describe_from_bytes(image_bytes, media_type)

    print("=" * 60)
    print("DESCRIÇÃO GERADA (isso vai substituir {PRODUCT_DESCRIPTION}):")
    print("=" * 60)
    print(description)
    print("=" * 60)

    # Simula como ficaria o beat final do hook (0-2s), só pra visualizar
    example_beat = (
        f"{description} Product centered on screen facing forward, slow "
        "horizontal rotation left to right showing only the front, elegant "
        "minimal environment with soft warm natural lighting, neutral beige "
        "background, no person, product only."
    )
    print("\nExemplo de como ficaria o prompt do primeiro beat (0-2s):\n")
    print(example_beat)


if __name__ == "__main__":
    main()
