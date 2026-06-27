# ─────────────────────────────────────────────────────────────
# backend/services/studio/script_agent.py
# Agente 2 — Roteiro
# Cria título, gancho, cenas e narração completa
# API: Claude (Anthropic)
# ─────────────────────────────────────────────────────────────

import anthropic
import json
from config import get_settings

settings = get_settings()
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

STYLE_INSTRUCTIONS = {
    "documentary": "Tom de documentário profissional, narração em terceira pessoa, linguagem clara e envolvente.",
    "biblical":    "Tom reverente e épico, contextualiza historicamente, conecta com aplicação atual para o ouvinte.",
    "motivational":"Tom inspirador e energético, usa segunda pessoa, frases de impacto, histórias de superação.",
    "narrative":   "Tom de contador de histórias, ritmo dinâmico, cria suspense e curiosidade a cada cena.",
}


async def run(
    topic: str,
    research: dict,
    duration_minutes: int,
    style: str,
    language: str = "pt-BR",
) -> dict:
    """
    Recebe o tema + resultado da pesquisa e retorna o roteiro completo:
    - title: título do vídeo
    - hook: gancho de abertura (primeiros 15s)
    - scenes: lista de cenas com narração
    - total_duration: duração estimada em segundos
    """
    print(f"[Agente 2 — Roteiro] Iniciando para: {topic}")

    num_scenes = {5: 5, 8: 8, 12: 11, 15: 14}.get(duration_minutes, 8)
    style_instruction = STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["documentary"])

    sources_text = "\n".join([
        f"- {s['title']}: {s['content'][:300]}"
        for s in research.get("sources", [])[:6]
    ])

    prompt = f"""Você é um roteirista especialista em vídeos para YouTube.

TEMA: {topic}
IDIOMA: {language}
DURAÇÃO: {duration_minutes} minutos ({num_scenes} cenas)
ESTILO: {style_instruction}

CONTEXTO DE PESQUISA:
{research.get('summary', '')}

FONTES:
{sources_text}

Crie um roteiro completo em JSON com esta estrutura exata:
{{
  "title": "título otimizado para YouTube (máx 60 chars)",
  "hook": "gancho de abertura impactante para os primeiros 15 segundos",
  "scenes": [
    {{
      "scene_number": 1,
      "title": "título interno da cena",
      "narration": "texto completo da narração desta cena (mínimo 3 parágrafos)",
      "duration_seconds": 60,
      "emotion": "épico|dramático|reflexivo|inspirador|curioso|tenso"
    }}
  ],
  "total_duration_seconds": {duration_minutes * 60}
}}

REGRAS:
- Responda APENAS com o JSON, sem texto antes ou depois
- O gancho deve criar curiosidade imediata
- Cada cena tem pelo menos 3 parágrafos de narração
- A última cena deve ter conclusão e chamada para ação (like, inscrição)
- Use linguagem fluida, sem soar artificial
"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Remove possíveis marcadores de código
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    result = json.loads(raw)
    print(f"[Agente 2 — Roteiro] Concluído: {len(result.get('scenes', []))} cenas criadas")
    return result
