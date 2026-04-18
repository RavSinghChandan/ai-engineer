"""
Model fallback chain — tries models in priority order.

Primary   : gpt-4o-mini   (fast, cheap, capable)
Secondary : gpt-3.5-turbo (older but reliable)
Tertiary  : rule-based    (deterministic, no API call)

In production the secondary might be a different provider entirely
(Anthropic Claude, Google Gemini) for true multi-vendor redundancy.
"""

import logging
from typing import List, Optional

from langchain_core.messages import BaseMessage, AIMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MODEL_CHAIN = [
    "gpt-4o-mini",
    "gpt-3.5-turbo",
]

RULE_BASED_RESPONSES = {
    "balance": "Your account balance is temporarily unavailable. Please try again later or visit your nearest branch.",
    "loan": "Loan eligibility checks are temporarily unavailable. Please contact your relationship manager.",
    "compliance": "Compliance information is temporarily unavailable. Please refer to the Bank Policy Portal.",
    "fraud": "If you suspect fraud, please immediately call our 24/7 fraud hotline: 1-800-FRAUD-00.",
    "default": "Our AI assistant is temporarily unavailable. Please contact support at 1-800-BANK-000.",
}


def _rule_based_fallback(messages: List[BaseMessage], intent: Optional[str] = None) -> AIMessage:
    """Last-resort fallback — no API call, always succeeds."""
    key = intent or "default"
    response = RULE_BASED_RESPONSES.get(key, RULE_BASED_RESPONSES["default"])
    logger.warning("Using rule-based fallback response (intent=%s)", key)
    return AIMessage(content=response)


def invoke_with_fallback(
    messages: List[BaseMessage],
    intent: Optional[str] = None,
    temperature: float = 0,
    **kwargs,
) -> AIMessage:
    """
    Try each model in MODEL_CHAIN; fall back to rule-based if all fail.
    Returns an AIMessage regardless of outcome.
    """
    if not settings.openai_api_key:
        logger.warning("No OPENAI_API_KEY — using rule-based fallback immediately")
        return _rule_based_fallback(messages, intent)

    last_exc = None
    for model_name in MODEL_CHAIN:
        try:
            logger.info("Attempting model: %s", model_name)
            llm = ChatOpenAI(
                model=model_name,
                temperature=temperature,
                api_key=settings.openai_api_key,
                request_timeout=30,
                **kwargs,
            )
            response = llm.invoke(messages)
            logger.info("Model %s succeeded", model_name)
            return response
        except Exception as exc:
            last_exc = exc
            logger.warning("Model %s failed: %s — trying next", model_name, exc)

    logger.error("All models failed (%s) — using rule-based fallback", last_exc)
    return _rule_based_fallback(messages, intent)


class FallbackLLM:
    """
    Drop-in wrapper with the same .invoke() interface as ChatOpenAI
    but with automatic fallback through the model chain.
    """

    def __init__(self, temperature: float = 0, intent: Optional[str] = None):
        self.temperature = temperature
        self.intent = intent

    def invoke(self, messages: List[BaseMessage]) -> AIMessage:
        return invoke_with_fallback(messages, self.intent, self.temperature)
