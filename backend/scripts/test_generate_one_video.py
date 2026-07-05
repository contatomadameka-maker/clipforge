"""
scripts/test_generate_one_video.py

TESTE MANUAL — gera 1 vídeo real no Kling, usando o template "Giro elegante"
(ou outro que você passar), pra você julgar a qualidade antes de automatizar
qualquer galeria/script de seed.

Isso VAI GASTAR CRÉDITO real do Kling (é só 1 vídeo, mas é de verdade).

Como rodar (no Shell do Render, dentro do serviço clipforge-6yzz, ou local
se tiver o backend clonado com as env vars configuradas):

    python -m scripts.test_generate_one_video \
        "https://url-da-foto-do-produto.jpg" \
        "Relógio Feminino Vintage" \
        "39,90"
"""

import sys
import os
import time
import httpx

from db.database import get_supabase
from services.template_video_service import (
    describe_product_photo,
    build_multi_prompt,
    build_narration_script,
)

KLING_API_KEY = os.environ["KLING_API_KEY"]
KLING_GENERATE_URL = "https://api-singapore.klingai.com/v1/videos/image2video"
KLING_STATUS_URL = "https://api-singapore.klingai.com/v1/videos/image2video/{task_id}"


def poll_kling_until_done(task_id: str, timeout_s: int = 600) -> str:
    elapsed = 0
    while elapsed < timeout_s:
        resp = httpx.get(
            KLING_STATUS_URL.format(task_id=task_id),
            headers={"Authorization": f"Bearer {KLING_API_KEY}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        status = data["task_status"]
        print(f"  status: {status} ({elapsed}s)")

        if status == "succeed":
            return data["task_result"]["videos"][0]["url"]
        if status == "failed":
            raise RuntimeError(f"Kling falhou: {data}")

        time.sleep(10)
        elapsed += 10

    raise TimeoutError("Timeout esperando o Kling terminar.")


def main():
    if len(sys.argv) < 3:
        print("Uso: python -m scripts.test_generate_one_video <url_foto> <nome_produto> [preco]")
        sys.exit(1)

    product_image_url = sys.argv[1]
    product_name = sys.argv[2]
    price = sys.argv[3] if len(sys.argv) > 3 else "39,90"

    supabase = get_supabase()
    template = (
        supabase.table("prompt_templates")
        .select("*")
        .eq("name", "Giro elegante — produto em destaque")
        .limit(1)
        .execute()
    ).data[0]

    print(f"Template: {template['name']}")
    print(f"Foto do produto: {product_image_url}")
    print(f"Nome: {product_name} | Preço: R$ {price}\n")

    print("1/4 — Descrevendo a foto com a Claude...")
    description = describe_product_photo(product_image_url, template["description_style"])
    print(f"   → {description}\n")

    print("2/4 — Montando o multi_prompt pro Kling...")
    multi_prompt = build_multi_prompt(template, description, product_name, price)
    narration_script = build_narration_script(template, product_name, price)
    for i, beat in enumerate(multi_prompt):
        print(f"   Beat {i+1} ({beat['duration']}s): {beat['prompt'][:100]}...")
    print()

    print("3/4 — Enviando pro Kling (isso gasta crédito real)...")
    total_duration = sum(beat["end_s"] - beat["start_s"] for beat in template["beats"])
    kling_duration = "10" if total_duration > 5 else "5"
    payload = {
        "model_name": "kling-v2-6",
        "image": product_image_url,
        "duration": kling_duration,
        "multi_prompt": multi_prompt,
        "negative_prompt": template["negative_prompt"],
        "mode": "pro",
        "sound": "off",
    }
    resp = httpx.post(
        KLING_GENERATE_URL,
        headers={"Authorization": f"Bearer {KLING_API_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if resp.status_code >= 400:
        print(f"\n❌ Kling retornou erro {resp.status_code}:")
        print(resp.text)
        print(f"\nPayload enviado:\n{payload}\n")
        resp.raise_for_status()
    task_id = resp.json()["data"]["task_id"]
    print(f"   task_id: {task_id}\n")

    print("4/4 — Aguardando o Kling terminar (pode levar 1-3 min)...")
    video_url = poll_kling_until_done(task_id)

    print("\n" + "=" * 60)
    print("VÍDEO PRONTO (mudo, sem narração ainda):")
    print(video_url)
    print("=" * 60)
    print("\nNarração que entraria por cima (próxima etapa a construir):")
    for beat in narration_script:
        print(f"  [{beat['start_s']}s-{beat['end_s']}s] {beat['text']}")


if __name__ == "__main__":
    main()
