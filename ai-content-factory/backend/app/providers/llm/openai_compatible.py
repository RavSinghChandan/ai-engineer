"""OpenAI-compatible chat-completions adapter.

DeepSeek, OpenAI, Mistral (and most providers) speak this protocol —
one adapter class, many providers, selected purely by base_url/key/model.
"""
import asyncio

import openai
from openai import AsyncOpenAI

from app.core.exceptions import ProviderRateLimitedError, ProviderUnavailableError
from app.core.logging import get_logger
from app.providers.ports import LLMRequest, LLMResponse

logger = get_logger(__name__)


class OpenAICompatibleLLM:
    def __init__(self, *, base_url: str | None, api_key: str, model: str, max_retries: int = 3):
        self._client = AsyncOpenAI(base_url=base_url, api_key=api_key, max_retries=0)
        self._model = model
        self._max_retries = max_retries

    async def complete(self, request: LLMRequest) -> LLMResponse:
        last_error: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": request.system},
                        {"role": "user", "content": request.user},
                    ],
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                    response_format={"type": "json_object"} if request.json_mode else {"type": "text"},
                )
                choice = response.choices[0]
                usage = response.usage
                return LLMResponse(
                    text=choice.message.content or "",
                    model=response.model,
                    prompt_tokens=usage.prompt_tokens if usage else 0,
                    completion_tokens=usage.completion_tokens if usage else 0,
                )
            except openai.RateLimitError as exc:
                last_error = exc
                delay = 2**attempt
                logger.warning("llm_rate_limited", attempt=attempt, retry_in=delay)
                await asyncio.sleep(delay)
            except (openai.APIConnectionError, openai.APIStatusError) as exc:
                last_error = exc
                delay = 2**attempt
                logger.warning("llm_transient_error", attempt=attempt, error=str(exc), retry_in=delay)
                await asyncio.sleep(delay)
        if isinstance(last_error, openai.RateLimitError):
            raise ProviderRateLimitedError(f"LLM rate limited after {self._max_retries} attempts") from last_error
        raise ProviderUnavailableError(f"LLM unavailable: {last_error}") from last_error
