# ─────────────────────────────────────────────────────────────
# backend/services/studio/research_agent.py
# Agente 1 — Pesquisa
# Coleta fontes, contexto, dados e referências sobre o tema
# API: Tavily
# ─────────────────────────────────────────────────────────────

import httpx
from config import get_settings

settings = get_settings()


async def run(topic: str, language: str = "pt-BR") -> dict:
    """
    Recebe o tema do vídeo e retorna um dict com:
    - sources: lista de fontes encontradas
    - summary: resumo consolidado do contexto
    - facts: fatos relevantes para o roteiro
    """
    print(f"[Agente 1 — Pesquisa] Iniciando para: {topic}")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": topic,
                    "search_depth": "advanced",
                    "include_answer": True,
                    "include_raw_content": False,
                    "max_results": 10,
                    "include_domains": [],
                    "exclude_domains": [],
                },
            )
            res.raise_for_status()
            data = res.json()

        sources = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
                "score": r.get("score", 0),
            }
            for r in data.get("results", [])
        ]

        result = {
            "sources": sources,
            "summary": data.get("answer", ""),
            "total_sources": len(sources),
            "query": topic,
        }

        print(f"[Agente 1 — Pesquisa] Concluído: {len(sources)} fontes coletadas")
        return result

    except httpx.HTTPError as e:
        print(f"[Agente 1 — Pesquisa] Erro HTTP: {e}")
        raise Exception(f"Falha na pesquisa Tavily: {str(e)}")
    except Exception as e:
        print(f"[Agente 1 — Pesquisa] Erro: {e}")
        raise
