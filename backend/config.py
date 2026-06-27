# ─────────────────────────────────────────────────────────────
# backend/config.py
# Configurações centralizadas — lidas do arquivo .env
# ─────────────────────────────────────────────────────────────

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"

    # ── Supabase ──────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str

    # ── Redis ─────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Cloudflare R2 ─────────────────────────────────────────
    cloudflare_r2_account_id: str = ""
    cloudflare_r2_access_key: str = ""
    cloudflare_r2_secret_key: str = ""
    cloudflare_r2_bucket: str = "clipforge-videos"
    cloudflare_r2_public_url: str = ""

    # ── APIs de IA — Studio ───────────────────────────────────
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    tavily_api_key: str = ""
    elevenlabs_api_key: str = ""
    runway_api_key: str = ""
    suno_api_key: str = ""
    shotstack_api_key: str = ""
    shotstack_env: str = "v1"

    # ── APIs de IA — TikTok ───────────────────────────────────
    heygen_api_key: str = ""
    kling_api_key: str = ""
    fal_api_key: str = ""

    # ── Stripe ────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Retorna as configurações em cache — instancia apenas uma vez."""
    return Settings()
