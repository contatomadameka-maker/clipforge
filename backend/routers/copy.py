# ─────────────────────────────────────────────────────────────
# backend/routers/copy.py
# Endpoint para geração de script com Claude API
# ─────────────────────────────────────────────────────────────

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import get_settings
import anthropic

router = APIRouter()
settings = get_settings()


class GenerateScriptRequest(BaseModel):
    product_name: str
    category: str = "Geral"
    style: str = "UGC unboxing"
    tone: str = "Animado"
    duration: str = "30s"
    language: str = "pt-br"


class GenerateScriptResponse(BaseModel):
    script: str
    tokens_used: int


DURATION_WORDS = {
    "15s": "60-80 palavras",
    "30s": "120-150 palavras",
    "45s": "180-220 palavras",
    "60s": "240-280 palavras",
}

STYLE_INSTRUCTIONS = {
    "UGC unboxing": "Escreva como se fosse um usuário real fazendo unboxing pela primeira vez, espontâneo e autêntico.",
    "Review": "Escreva como um review honesto com pontos positivos claros e recomendação no final.",
    "Tutorial": "Escreva mostrando como usar o produto em passos simples e práticos.",
    "Oferta relâmpago": "Escreva com urgência e escassez, focando no desconto e no prazo limitado.",
}

TONE_INSTRUCTIONS = {
    "Animado": "Use energia alta, exclamações e entusiasmo genuíno.",
    "Natural": "Use linguagem conversacional e casual, como se falasse com um amigo.",
    "Profissional": "Use linguagem clara e confiante, sem gírias.",
    "Divertido": "Use humor leve, emojis e referências populares.",
}

LANGUAGE_INSTRUCTIONS = {
    "pt-br": "Escreva em português brasileiro informal e natural.",
    "en": "Write in casual American English.",
    "es": "Escribe en español latinoamericano informal.",
}


@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(req: GenerateScriptRequest):
    """Gera script para vídeo TikTok Shop usando Claude."""

    words = DURATION_WORDS.get(req.duration, "120-150 palavras")
    style_inst = STYLE_INSTRUCTIONS.get(req.style, "Escreva de forma natural e envolvente.")
    tone_inst = TONE_INSTRUCTIONS.get(req.tone, "Use tom natural.")
    lang_inst = LANGUAGE_INSTRUCTIONS.get(req.language, "Escreva em português brasileiro.")

    prompt = f"""Você é um especialista em criação de conteúdo para TikTok Shop.

Crie um script de vídeo para o produto: **{req.product_name}** (categoria: {req.category})

Estilo: {req.style}
{style_inst}

Tom: {req.tone}
{tone_inst}

{lang_inst}

Tamanho: {words} (para vídeo de {req.duration})

REGRAS OBRIGATÓRIAS:
- Comece de forma que prenda a atenção nos primeiros 3 segundos
- Mencione o produto naturalmente ao longo do script
- Termine sempre com call-to-action para o link na bio
- NÃO use colchetes ou placeholders como [ação]
- Escreva APENAS o texto que o avatar vai falar, sem instruções de câmera
- Use linguagem natural, como se fosse uma pessoa real falando

Retorne APENAS o script, sem explicações adicionais."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        script = message.content[0].text.strip()
        tokens = message.usage.input_tokens + message.usage.output_tokens

        return GenerateScriptResponse(script=script, tokens_used=tokens)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar script: {str(e)}")
