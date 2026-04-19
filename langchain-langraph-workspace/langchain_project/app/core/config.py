from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI — used for small token requests (< llm_token_threshold)
    openai_api_key: str = ""
    model_name: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    max_retries: int = 3

    # DeepSeek — used for large token requests (>= llm_token_threshold)
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"

    # Token routing threshold
    llm_token_threshold: int = 50

    # Prompt
    prompt_version: str = "v1"

    # LangSmith tracing (optional)
    langchain_tracing_v2: str = "false"
    langchain_api_key: str = ""
    langchain_project: str = "langchain-ai-service"

    # Arize Phoenix (optional)
    phoenix_collector_endpoint: str = "http://localhost:6006/v1/traces"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
