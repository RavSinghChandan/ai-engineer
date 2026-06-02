"""LLM abstraction — swap providers without touching agent logic."""
from langchain_core.language_models.chat_models import BaseChatModel

from .config_loader import LLMConfig


def build_llm(cfg: LLMConfig) -> BaseChatModel:
    provider = cfg.provider.lower()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            anthropic_api_key=cfg.api_key,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            openai_api_key=cfg.api_key,
        )

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=cfg.model,
            temperature=cfg.temperature,
            max_output_tokens=cfg.max_tokens,
            google_api_key=cfg.api_key,
        )

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=cfg.model, temperature=cfg.temperature)

    if provider == "deepseek":
        # DeepSeek is OpenAI-compatible
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            openai_api_key=cfg.api_key,
            base_url="https://api.deepseek.com/v1",
        )

    if provider == "grok":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=cfg.model,
            temperature=cfg.temperature,
            max_tokens=cfg.max_tokens,
            openai_api_key=cfg.api_key,
            base_url="https://api.x.ai/v1",
        )

    if provider == "bedrock":
        from langchain_aws import ChatBedrock
        return ChatBedrock(
            model_id=cfg.model,
            model_kwargs={"temperature": cfg.temperature, "max_tokens": cfg.max_tokens},
        )

    raise ValueError(
        f"Unsupported LLM provider: '{provider}'. "
        "Choose from: anthropic, openai, gemini, ollama, deepseek, grok, bedrock"
    )
