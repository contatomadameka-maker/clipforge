"""
scripts/seed_avatar_library.py

Cria a biblioteca inicial de avatares (6 personas, conforme o brief do ClipForge)
usando o photo_avatar_service, e salva o resultado na tabela `avatars` do Supabase.

Rodar manualmente (não é uma rota de API — é um script de setup):
    python -m scripts.seed_avatar_library

Requer: HEYGEN_API_KEY, SUPABASE_URL, SUPABASE_KEY no ambiente.
"""

import time
from services import photo_avatar_service as pa
from db.database import get_supabase  # ajuste o import conforme seu database.py

# Prompts pensados pra fugir da "cara de avatar de IA":
# traços físicos concretos, iluminação de celular, ambiente doméstico real,
# roupa cotidiana (não editorial), pose levemente assimétrica.
PERSONAS = [
    {
        "name": "Larissa",
        "nicho": "moda/beleza",
        "prompt": (
            "Mulher brasileira, 24 anos, pele morena clara, cabelo castanho "
            "ondulado solto na altura dos ombros, sorriso natural discreto, "
            "vestindo blusa básica cor terracota, sentada em um quarto "
            "aconchegante com luz natural de janela lateral, fundo desfocado "
            "com estante de livros e plantas, foto estilo câmera de celular, "
            "leve grão, sem maquiagem pesada, pele com textura realista"
        ),
        "look_prompt": "sentada no sofá da sala, luz de fim de tarde, plantas ao fundo, segurando um copo",
    },
    {
        "name": "Ágata",
        "nicho": "tech/review",
        "prompt": (
            "Mulher brasileira, 29 anos, cabelo liso preto preso em rabo baixo, "
            "óculos de grau discretos, expressão confiante e atenta, camiseta "
            "básica cinza, em pé em frente a uma mesa de escritório caseiro com "
            "notebook desfocado ao fundo, luz de anel suave, foto estilo webcam "
            "de boa qualidade, textura de pele realista, sem retoque exagerado"
        ),
        "look_prompt": "em pé em frente a um setup de podcast, microfone de braço visível, luz de anel, fundo com painel acústico",
    },
    {
        "name": "Lucas",
        "nicho": "tech/unboxing",
        "prompt": (
            "Homem brasileiro, 27 anos, pele morena, barba curta bem aparada, "
            "cabelo curto, camiseta preta lisa, sorriso animado tipo unboxing, "
            "sentado em mesa de escritório caseiro com luz de janela e "
            "notebook desfocado ao fundo, foto estilo celular, textura de pele "
            "realista, leve grão"
        ),
        "look_prompt": "sentado no quarto, luz de anel de lado, estante de setup gamer desfocada ao fundo",
    },
    {
        "name": "Pedro",
        "nicho": "fitness/lifestyle",
        "prompt": (
            "Homem brasileiro, 31 anos, pele parda, cabelo curto raspado nas "
            "laterais, expressão confiante e simpática, vestindo camiseta "
            "esportiva azul marinho, em pé em uma sala com luz natural forte "
            "vinda de uma janela grande, fundo levemente desfocado com sofá "
            "cinza, foto estilo câmera frontal de celular, textura de pele "
            "realista"
        ),
        "look_prompt": "em pé na varanda de casa, luz de manhã, plantas ao fundo, roupa casual de fim de semana",
    },
    {
        "name": "Camila",
        "nicho": "alimentos/casa",
        "prompt": (
            "Mulher brasileira, 35 anos, cabelo cacheado volumoso na altura do "
            "ombro, sorriso caloroso, vestindo avental leve por cima de "
            "camiseta básica, em pé em uma cozinha doméstica com bancada de "
            "madeira e luz natural de janela, foto estilo câmera de celular, "
            "textura de pele realista, leve grão"
        ),
        "look_prompt": "sentada à mesa da sala de jantar, luz de tarde, prato desfocado ao fundo",
    },
    {
        "name": "Adriano",
        "nicho": "geral/oferta relâmpago",
        "prompt": (
            "Homem brasileiro, 40 anos, cabelo curto grisalho nas laterais, "
            "expressão confiante e acessível, vestindo camisa social azul "
            "clara sem gravata, em pé em um home office com estante de livros "
            "desfocada ao fundo, luz de janela lateral suave, foto estilo "
            "webcam de boa qualidade, textura de pele realista"
        ),
        "look_prompt": "sentado à mesa de escritório caseiro, notebook aberto desfocado, luz de anel suave",
    },
]


def seed():
    supabase = get_supabase()

    for persona in PERSONAS:
        print(f"\n=== Gerando persona: {persona['name']} ({persona['nicho']}) ===")

        # 1. Gera a foto-base da persona
        gen = pa.generate_persona(name=persona["name"], appearance_prompt=persona["prompt"])
        generation_id = gen["generation_id"]

        # poll simples (rodar isso via Celery em produção, não bloqueando)
        status = None
        for _ in range(60):
            status = pa.get_generation_status(generation_id)
            if status.get("status") in ("success", "completed"):
                break
            time.sleep(5)
        if not status or status.get("status") not in ("success", "completed"):
            print(f"  [ERRO] geração não completou pra {persona['name']}: {status}")
            continue

        image_key = status["image_key"]
        base_avatar_id = status.get("id") or status.get("avatar_id")
        print(f"  Foto base gerada. image_key={image_key}")

        # 2. Cria o Avatar Group
        group = pa.create_avatar_group(
            name=f"clipforge-{persona['name'].lower()}",
            image_key=image_key,
            generation_id=generation_id,
        )
        group_id = group["group_id"] if "group_id" in group else group.get("id")
        print(f"  Avatar group criado: {group_id}")

        # 3. Gera um look adicional (segundo ambiente) mantendo a identidade
        look = pa.generate_look(reference_avatar_id=base_avatar_id, look_prompt=persona["look_prompt"])
        look_generation_id = look["generation_id"]

        look_status = None
        for _ in range(60):
            look_status = pa.get_generation_status(look_generation_id)
            if look_status.get("status") in ("success", "completed"):
                break
            time.sleep(5)

        if look_status and look_status.get("status") in ("success", "completed"):
            pa.add_look_to_group(group_id=group_id, image_keys=[look_status["image_key"]])
            print("  Look adicional anexado ao grupo.")
        else:
            print(f"  [AVISO] look adicional falhou, seguindo só com o look base: {look_status}")

        # 4. Treina o grupo
        pa.train_avatar_group(group_id)
        print("  Treinamento disparado, aguardando...")
        pa.wait_for_training(group_id, timeout_s=600)
        print("  Treinamento concluído.")

        # 5. Pega detalhes finais (talking_photo_id) do look base
        details = pa.get_photo_avatar_details(base_avatar_id)
        talking_photo_id = details.get("talking_photo_id") or details.get("id")

        # 6. Salva no Supabase
        supabase.table("avatars").insert({
            "name": persona["name"],
            "preview_url": details.get("image_url") or details.get("preview_url"),
            "heygen_avatar_id": talking_photo_id,
            "language": ["pt-BR"],
            "plan_required": "starter",
            "active": True,
        }).execute()
        print(f"  Salvo no Supabase como avatar '{persona['name']}'.")

    print("\n=== Biblioteca de avatares criada. ===")


if __name__ == "__main__":
    seed()
