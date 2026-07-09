"""Application configuration.

Single source of truth for every tunable value. Nothing in the codebase
reads os.environ directly — everything goes through `Settings`.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "AI Content Factory"
    environment: str = "development"  # development | testing | production
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # --- Security ---
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # --- CORS ---
    cors_origins: str = "http://localhost:4200,http://127.0.0.1:4200"

    # --- Persistence (local-first: SQLite; swap URL for PostgreSQL later) ---
    database_url: str = f"sqlite+aiosqlite:///{BACKEND_DIR}/data/acf.db"

    # --- Storage ---
    media_dir: Path = BACKEND_DIR / "media"
    data_dir: Path = BACKEND_DIR / "data"

    # --- LLM providers ---
    llm_provider: str = "deepseek"  # deepseek | openai | gemini | claude | mistral
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.7
    llm_max_retries: int = 3

    # --- TTS providers ---
    tts_provider: str = "macos_say"  # macos_say | elevenlabs | openai
    macos_voice: str = "Samantha"
    macos_speech_rate: int = 178
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"

    # --- Avatar providers (disabled until keys are provided) ---
    avatar_provider: str = "none"  # none | heygen | synthesia
    heygen_api_key: str = ""

    # --- Video ---
    video_width: int = 1280
    video_height: int = 720
    video_fps: int = 30

    # --- Pipeline ---
    max_script_revisions: int = 1
    review_pass_score: int = 7

    @field_validator("media_dir", "data_dir")
    @classmethod
    def _ensure_dir(cls, v: Path) -> Path:
        v.mkdir(parents=True, exist_ok=True)
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sync_database_url(self) -> str:
        """Synchronous URL used by Alembic."""
        return self.database_url.replace("+aiosqlite", "").replace("+asyncpg", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
