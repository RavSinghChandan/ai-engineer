import os

class Settings:
    # DeepSeek
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "REDACTED_DEEPSEEK_API_KEY")
    DEEPSEEK_API_URL: str = "https://api.deepseek.com/v1/chat/completions"
    DEEPSEEK_MODEL: str   = "deepseek-chat"

    # SaaS auth — single hardcoded key (replace with DB lookup for multi-tenant)
    API_KEY: str = os.getenv("SAAS_API_KEY", "ai-report-saas-2024")

    # Rate limiting (requests per window per IP)
    RATE_LIMIT_MAX: int    = 20
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # App
    APP_NAME: str    = "AI Report Generator"
    APP_VERSION: str = "2.0.0"
    CORS_ORIGINS: list = ["http://localhost:4200"]

settings = Settings()
