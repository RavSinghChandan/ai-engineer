"""Model registry — resolves a logical model role to a concrete LLM adapter.

Agents ask for ModelRole.SCRIPT_WRITER; the registry decides which
provider serves it. Today every role maps to the configured default
provider (DeepSeek); adding per-role routing or new providers is a
change here + config, never in agents.
"""
from functools import lru_cache

from app.core.config import Settings, get_settings
from app.core.exceptions import ValidationFailedError
from app.domain.enums import ModelRole
from app.providers.llm.openai_compatible import OpenAICompatibleLLM
from app.providers.ports import LLMPort


def _build_provider(settings: Settings, provider: str) -> LLMPort:
    if provider == "deepseek":
        if not settings.deepseek_api_key:
            raise ValidationFailedError("DEEPSEEK_API_KEY is not configured in backend/.env")
        return OpenAICompatibleLLM(
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=settings.deepseek_model,
            max_retries=settings.llm_max_retries,
        )
    if provider == "openai":
        if not settings.openai_api_key:
            raise ValidationFailedError("OPENAI_API_KEY is not configured in backend/.env")
        return OpenAICompatibleLLM(
            base_url=None,
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            max_retries=settings.llm_max_retries,
        )
    raise ValidationFailedError(f"Unknown LLM provider '{provider}'")


class ModelRegistry:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._cache: dict[str, LLMPort] = {}

    def for_role(self, role: ModelRole) -> LLMPort:
        # Single default route today; per-role DB-backed routing slots in here.
        provider = self._settings.llm_provider
        if provider not in self._cache:
            self._cache[provider] = _build_provider(self._settings, provider)
        return self._cache[provider]


@lru_cache
def get_model_registry() -> ModelRegistry:
    return ModelRegistry(get_settings())
