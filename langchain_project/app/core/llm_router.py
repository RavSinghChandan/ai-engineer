"""
LLM Router — selects OpenAI or DeepSeek based on estimated token count.

  < settings.llm_token_threshold tokens  → OpenAI  (fast, cost-effective for small payloads)
  >= settings.llm_token_threshold tokens → DeepSeek (handles large context efficiently)
"""

from langchain_openai import ChatOpenAI

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_CHARS_PER_TOKEN = 4  # rough approximation: 1 token ≈ 4 characters


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def get_llm(text: str = "") -> ChatOpenAI:
    """Return the appropriate LLM based on estimated token count of *text*."""
    token_count = estimate_tokens(text)
    if token_count >= settings.llm_token_threshold:
        logger.info(
            f"Routing to DeepSeek — estimated {token_count} tokens "
            f"(threshold={settings.llm_token_threshold})"
        )
        if not settings.deepseek_api_key:
            raise ValueError("DEEPSEEK_API_KEY is not set in environment variables.")
        return ChatOpenAI(
            model=settings.deepseek_model,
            openai_api_key=settings.deepseek_api_key,
            openai_api_base=settings.deepseek_base_url,
            temperature=settings.temperature,
        )
    else:
        logger.info(
            f"Routing to OpenAI — estimated {token_count} tokens "
            f"(threshold={settings.llm_token_threshold})"
        )
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not set in environment variables.")
        return ChatOpenAI(
            model=settings.model_name,
            openai_api_key=settings.openai_api_key,
            temperature=settings.temperature,
        )
