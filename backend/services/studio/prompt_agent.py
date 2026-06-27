# ─────────────────────────────────────────────────────────────
# backend/services/studio/prompt_agent.py
# Agente 4 — Prompts visuais
# Gera 1 prompt cinematográfico detalhado por cena
# API: OpenAI GPT-4o
# ─────────────────────────────────────────────────────────────

import openai
import json
from config import get_settings

settings = get_settings()
client = openai.AsyncOpenAI(api_key=settings.openai_api_key)


async def run(script: dict, storyboard: dict) -> list[dict]:
    """
    Combina roteiro + storyboard e gera prompts otimizados
    para geração de vídeo por IA (Runway Gen-4).
    Retorna lista de dicts com scene_number e visual_prompt.
    """
    print(f"[Agente 4 — Prompts] Iniciando geração de prompts visuais")

    scenes = script.get("scenes", [])
    board = {s["scene_number"]: s for s in storyboard.get("storyboard", [])}

    prompts = []

    for scene in scenes:
        num = scene["scene_number"]
        direction = board.get(num, {})

        prompt_input = f"""Crie um prompt cinematográfico detalhado para geração de vídeo por IA.

CENA {num}: {scene.get('title', '')}
NARRAÇÃO: {scene.get('narration', '')[:300]}
CÂMERA: {direction.get('camera', '')}
ILUMINAÇÃO: {direction.get('lighting', '')}
EMOÇÃO: {direction.get('emotion', '')}
PALETA: {direction.get('color_palette', '')}
VISUAL CHAVE: {direction.get('key_visual', '')}

Escreva um prompt em inglês de 2-3 frases para o Runway Gen-4.
Inclua: sujeito principal, ambiente, iluminação, movimento de câmera, estilo cinematográfico.
Responda APENAS com o prompt, sem explicações.
"""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt_input}],
            max_tokens=300,
        )

        visual_prompt = response.choices[0].message.content.strip()

        prompts.append({
            "scene_number": num,
            "visual_prompt": visual_prompt,
            "duration_seconds": scene.get("duration_seconds", 60),
        })

        print(f"[Agente 4 — Prompts] Cena {num} pronta")

    print(f"[Agente 4 — Prompts] Concluído: {len(prompts)} prompts gerados")
    return prompts
