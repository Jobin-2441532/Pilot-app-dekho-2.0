"""
Configuration — loads from .env file via pydantic-settings.
"""

from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM — Provider selection (waterfall: primary → secondary → tertiary → static)
    llm_provider_primary: str = "groq"          # "openrouter" | "groq" | "gemini"
    llm_provider_secondary: str = "gemini"       # fallback — Gemini 2.0 Flash (free)
    llm_provider_tertiary: str = "openrouter"    # last-resort fallback
    llm_timeout_seconds: int = 15
    llm_rate_limit_per_minute: int = 20

    # Groq (primary provider)
    groq_api_key: str = ""
    groq_llm_model: str = "llama3-8b-8192"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # Gemini (secondary — free, high quality)
    gemini_api_key: str = ""
    gemini_llm_model: str = "gemini-3.6-flash"

    # OpenRouter (tertiary / last-resort fallback)
    openrouter_api_key: str = ""
    openrouter_llm_model: str = "google/gemma-2-9b-it:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://localhost/dekho_db"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # App
    app_env: str = "development"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Feature flags
    use_mock_data: bool = True

    # Auth — JWT (shared secret with V2 main app, HS256)
    jwt_secret_key: str = Field("dekho-super-secret-key-change-in-production", validation_alias="JWT_SECRET_KEY")
    auth_enabled: bool = False   # set True when integrated with V2 frontend

    # Session / cache TTLs
    session_ttl_seconds: int = 1800
    context_cache_ttl_seconds: int = 300
    in_session_message_limit: int = 10



@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
