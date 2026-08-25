# ─────────────────────────────────────────────────────────────
# backend/services/studio/script_agent.py
# Agente 2 — Roteiro
# Cria título, gancho, cenas e narração completa
# API: Claude (Anthropic)
#
# NOVO: parâmetros opcionais `is_reference` e `visual_style` — quando
# o Agente 1 rodou no modo "Link de referência" (research_agent.
# run_from_reference), esses campos reforçam no prompt que o roteiro
# deve seguir a ESTRUTURA identificada mas ser 100% original, e passam
# a descrição do estilo visual adiante (útil pro Agente 4, Prompts
# Visuais, usar depois). Sem esses parâmetros, o comportamento é
# idêntico ao de antes — nada muda pro modo normal (por tema).
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
    is_reference: bool = False,
    visual_style: str = "",
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

    # No modo referência, reforça bem explicitamente que é pra seguir a
    # ESTRUTURA (já detalhada dentro de research['summary']) mas nunca
    # copiar conteúdo literal — e adiciona o estilo visual identificado,
    # se tiver vindo.
    reference_instruction = ""
    if is_reference:
        reference_instruction = (
            "\nATENÇÃO — MODO LINK DE REFERÊNCIA: o contexto de pesquisa abaixo "
            "é a análise de um vídeo de referência (transcrição + estrutura "
            "narrativa identificada), não uma pesquisa na web. Use-o SÓ pra "
            "entender o formato vencedor (gancho, ritmo, viradas, tom) — o "
            "roteiro que você escrever precisa ser 100% ORIGINAL: nunca copie "
            "frases, dados específicos ou conteúdo literal do vídeo de "
            "referência, só a estrutura/abordagem narrativa.\n"
        )
        if visual_style:
            reference_instruction += f"\nESTILO VISUAL IDENTIFICADO NO VÍDEO DE REFERÊNCIA (pra manter o mesmo clima nas cenas):\n{visual_style}\n"

    prompt = f"""Você é um roteirista especialista em vídeos para YouTube.
TEMA: {topic}
IDIOMA: {language}
DURAÇÃO: {duration_minutes} minutos ({num_scenes} cenas)
ESTILO: {style_instruction}
{reference_instruction}
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
