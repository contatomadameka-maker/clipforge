"""
scripts/seed_template_thumbnails.py

Gera 1 vídeo de amostra (mudo, só o Kling ainda — narração vem depois)
pra cada template ativo na biblioteca, usando uma foto de banco de imagens
gratuito compatível com a categoria do template. Salva o resultado no R2
e atualiza a coluna thumbnail_video_url.

IMPORTANTE: isso só funciona depois que a HeyGen/Kling tiverem crédito
comprado (item já está na sua lista de prioridades). Sem crédito, a
chamada ao Kling retorna erro de saldo insuficiente.

Como rodar:
    python -m scripts.seed_template_thumbnails
"""

import time
import httpx
from db.database import get_supabase
from services.template_video_service import generate_video_from_template
from services.storage_service import upload_bytes_to_r2  # ajuste o nome se for diferente

# Fotos de banco gratuito (Unsplash), uma por categoria — produto isolado,
# fundo neutro, sem pessoa. Troque por fotos melhores conforme for testando.
CATEGORY_SAMPLE_IMAGES = {
    "acessorios": "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800",  # relógio
    "moda": "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800",         # roupa em still
    "beleza": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800",       # cosmético
    "tech": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",         # gadget
    "alimentos": "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=800",    # produto alimentício
}

KLING_STATUS_URL = "https://api-singapore.klingai.com/v1/videos/image2video/{task_id}"


def poll_kling_until_done(task_id: str, kling_api_key: str, timeout_s: int = 600) -> str:
    """Aguarda o Kling terminar e retorna a URL do vídeo gerado."""
    elapsed = 0
    while elapsed < timeout_s:
        resp = httpx.get(
            KLING_STATUS_URL.format(task_id=task_id),
            headers={"Authorization": f"Bearer {kling_api_key}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()["data"]

        if data["task_status"] == "succeed":
            return data["task_result"]["videos"][0]["url"]
        if data["task_status"] == "failed":
            raise RuntimeError(f"Kling falhou pra task {task_id}: {data}")

        time.sleep(10)
        elapsed += 10

    raise TimeoutError(f"Timeout esperando o Kling terminar a task {task_id}")


def seed_thumbnails():
    supabase = get_supabase()

    templates = (
        supabase.table("prompt_templates")
        .select("*")
        .eq("active", True)
        .is_("thumbnail_video_url", "null")  # só gera pros que ainda não têm amostra
        .execute()
    ).data

    if not templates:
        print("Nenhum template pendente de amostra. Tudo já tem thumbnail_video_url.")
        return

    for template in templates:
        category = template["category"]
        sample_image = CATEGORY_SAMPLE_IMAGES.get(category)

        if not sample_image:
            print(f"[PULANDO] Template '{template['name']}': sem foto de amostra pra categoria '{category}'.")
            continue

        print(f"\n=== Gerando amostra pro template: {template['name']} ({category}) ===")

        try:
            result = generate_video_from_template(
                template=template,
                product_image_url=sample_image,
                product_name="produto de exemplo",
                price="R$ 39,90",
            )
            print(f"  Descrição gerada pela Claude: {result['product_description']}")
            print(f"  Kling task_id: {result['kling_task_id']}")

            import os
            video_url_kling = poll_kling_until_done(
                result["kling_task_id"], os.environ["KLING_API_KEY"]
            )
            print(f"  Vídeo pronto no Kling: {video_url_kling}")

            # Baixa do Kling e reenvia pro R2 (pra não depender de link externo)
            video_bytes = httpx.get(video_url_kling, timeout=120).content
            r2_key = f"template-thumbnails/{template['id']}.mp4"
            final_url = upload_bytes_to_r2(video_bytes, r2_key, content_type="video/mp4")

            supabase.table("prompt_templates").update(
                {"thumbnail_video_url": final_url}
            ).eq("id", template["id"]).execute()

            print(f"  ✅ thumbnail_video_url atualizada: {final_url}")

        except Exception as e:
            print(f"  ❌ ERRO no template '{template['name']}': {e}")
            continue

    print("\n=== Concluído. ===")


if __name__ == "__main__":
    seed_thumbnails()
