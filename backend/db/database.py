# ─────────────────────────────────────────────────────────────
# backend/db/database.py
# Conexão com o Supabase (cliente singleton)
# ─────────────────────────────────────────────────────────────
from supabase import create_client, Client
from config import get_settings
from functools import lru_cache
@lru_cache()
def get_supabase() -> Client:
    """Retorna o cliente Supabase em cache."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
