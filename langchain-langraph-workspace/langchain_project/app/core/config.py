from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    model_name: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    prompt_version: str = "v1"
    max_retries: int = 3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
