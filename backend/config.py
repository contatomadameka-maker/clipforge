from pydantic_settings import BaseSettings
from functools import lru_cache
class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""
    redis_url: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    heygen_api_key: str = ""
    kling_api_key: str = ""
    fal_api_key: str = ""
    replicate_api_token: str = ""
    elevenlabs_api_key: str = ""
    tavily_api_key: str = ""
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "clipforge"
    r2_public_url: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    cakto_webhook_secret: str = ""
    hikerapi_key: str = ""
    tikhub_api_key: str = ""
    apify_api_token: str = ""
    sociavault_api_key: str = ""
    class Config:
        env_file = ".env"
        extra = "allow"
@lru_cache()
def get_settings() -> Settings:
    return Settings()
