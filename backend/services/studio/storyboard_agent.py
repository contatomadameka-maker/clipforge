# ─────────────────────────────────────────────────────────────
# backend/services/studio/storyboard_agent.py
# Agente 3 — Storyboard
# Define câmera, emoção, iluminação e prompt visual por cena
# API: OpenAI GPT-4o
# ─────────────────────────────────────────────────────────────

import openai
import json
from config import get_settings

settings = get_settings()
client = openai.AsyncOpenAI(api_key=settings.openai_api_key)


async def run(script: dict, style: str) -> dict:
    """
    Recebe o roteiro e retorna o storyboard:
    - scenes: cada cena com direção de câmera, emoção, iluminação
    """
    print(f"[Agente 3 — Storyboard] Iniciando para {len(script.get('scenes', []))} cenas")

    scenes_text = "\n".join([
        f"Cena {s['scene_number']}: {s['title']} — {s['narration'][:200]}..."
        for s in script.get("scenes", [])
    ])

    prompt = f"""Você é um diretor de cinema criando o storyboard de um vídeo estilo {style}.

ROTEIRO:
{scenes_text}

Para cada cena, defina em JSON:
{{
  "storyboard": [
    {{
      "scene_number": 1,
      "camera": "tipo de câmera e movimento (ex: close-up lento, plano aberto, travelling)",
      "lighting": "descrição da iluminação (ex: luz dourada do pôr do sol, sombras dramáticas)",
      "emotion": "emoção visual dominante",
      "color_palette": "paleta de cores (ex: tons quentes terrosos, azul frio e cinza)",
      "key_visual": "elemento visual principal da cena em uma frase",
      "duration_seconds": 60
    }}
  ]
}}

REGRAS:
- Responda APENAS com o JSON
- Crie direções cinematográficas realistas para geração por IA
- Cada cena deve ter identidade visual única mas coerente com o todo
- Use referências de filmes e documentários reais como inspiração
"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=3000,
    )

    result = json.loads(response.choices[0].message.content)
    print(f"[Agente 3 — Storyboard] Concluído: {len(result.get('storyboard', []))} cenas direcionadas")
    return result
