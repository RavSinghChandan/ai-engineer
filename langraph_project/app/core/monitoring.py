"""
Observability setup — Arize Phoenix 4.x + LangSmith.

Phoenix:  free, open-source LLM tracing (arize-phoenix >= 4.0.0)
          UI → http://localhost:6006
          Traces every LangChain / LangGraph LLM call automatically.

LangSmith: Anthropic-hosted tracing (optional, set env vars to enable)
"""

import logging
import os

logger = logging.getLogger(__name__)


def setup_phoenix(project_name: str = "banking-ai-platform") -> None:
    """
    Wire up Arize Phoenix 4.x OpenTelemetry tracing.
    Safe no-op if package is not installed.
    """
    endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "http://localhost:6006/v1/traces")
    try:
        from phoenix.otel import register
        from openinference.instrumentation.langchain import LangChainInstrumentor

        tracer_provider = register(
            project_name=project_name,
            endpoint=endpoint,
        )
        LangChainInstrumentor().instrument(tracer_provider=tracer_provider)
        logger.info("Arize Phoenix tracing enabled → %s  project=%s", endpoint, project_name)
    except ImportError:
        logger.warning(
            "Arize Phoenix not installed — run: "
            "pip install 'arize-phoenix>=4.0.0' openinference-instrumentation-langchain"
        )


def setup_langsmith(api_key: str, project: str) -> None:
    if not api_key:
        return
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = api_key
    os.environ["LANGCHAIN_PROJECT"] = project
    logger.info("LangSmith tracing enabled → project=%s", project)
