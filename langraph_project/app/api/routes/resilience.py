import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.graphs.resilient_agent import run_resilient_agent
from app.resilience.circuit_breaker import (
    openai_breaker,
    get_all_breaker_statuses,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resilience", tags=["Resilience"])


class ResilientQueryRequest(BaseModel):
    query: str
    intent: Optional[str] = None


class ResilientQueryResponse(BaseModel):
    response: str
    circuit_state: str
    used_fallback: bool
    attempt_count: int
    breaker_statuses: list


class CircuitBreakerAction(BaseModel):
    action: str   # "trip" | "reset"


@router.post(
    "/query",
    response_model=ResilientQueryResponse,
    summary="Query through full resilience stack",
    description=(
        "Routes a query through the **4-layer resilience pipeline**:\n\n"
        "1. **Circuit Breaker** — blocks calls when OpenAI failure rate is high (OPEN state)\n"
        "2. **Retry with backoff** — retries transient failures up to 3× with exponential backoff\n"
        "3. **Model fallback chain** — escalates: `gpt-4o-mini → gpt-3.5-turbo → static response`\n"
        "4. **Thread-pool timeout** — hard 10-second limit per LLM call\n\n"
        "**Circuit states:** `CLOSED` (normal) · `OPEN` (blocking) · `HALF_OPEN` (testing recovery)\n\n"
        "Returns `used_fallback=true` and `circuit_state` so callers know which path was taken."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Normal query": {
                            "summary": "Standard banking question (circuit CLOSED)",
                            "value": {"query": "What is the current interest rate for a 30-year fixed mortgage?", "intent": "loan"},
                        },
                        "Fraud intent": {
                            "summary": "Fraud-related query",
                            "value": {"query": "I noticed an unauthorized transaction on my account. What should I do?", "intent": "fraud"},
                        },
                        "No intent hint": {
                            "summary": "Query without intent — agent infers automatically",
                            "value": {"query": "How do I transfer money internationally?"},
                        },
                    }
                }
            }
        }
    },
)
async def resilient_query(request: ResilientQueryRequest) -> ResilientQueryResponse:
    """Query routed through the full resilience stack."""
    try:
        result = run_resilient_agent(request.query, request.intent)
    except Exception as exc:
        logger.exception("Resilient agent failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ResilientQueryResponse(**result)


@router.get(
    "/status",
    summary="Circuit breaker status",
    description=(
        "Returns the current state of all registered circuit breakers.\n\n"
        "**Fields per breaker:** `name`, `state` (CLOSED/OPEN/HALF_OPEN), "
        "`failure_count`, `success_count`, `last_failure_time`.\n\n"
        "Use this endpoint for health dashboards and ops monitoring."
    ),
)
async def circuit_breaker_status() -> dict:
    return {"breakers": get_all_breaker_statuses()}


@router.post(
    "/circuit/{name}",
    summary="Manually trip or reset a circuit breaker",
    description=(
        "Manually override a circuit breaker state — useful for **chaos testing** and **ops recovery**.\n\n"
        "**Actions:**\n"
        "- `trip` — forces state to `OPEN` (blocks all LLM calls, triggers fallback path)\n"
        "- `reset` — forces state to `CLOSED` (resumes normal operation)\n\n"
        "**Available breakers:** `openai`\n\n"
        "Returns the updated breaker status after the action is applied."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "Trip openai breaker": {
                            "summary": "Force OPEN — simulate OpenAI outage",
                            "value": {"action": "trip"},
                        },
                        "Reset openai breaker": {
                            "summary": "Force CLOSED — restore normal operation",
                            "value": {"action": "reset"},
                        },
                    }
                }
            }
        }
    },
)
async def control_circuit_breaker(name: str, body: CircuitBreakerAction) -> dict:
    breakers = {
        "openai": openai_breaker,
    }
    cb = breakers.get(name)
    if not cb:
        raise HTTPException(status_code=404, detail=f"Breaker '{name}' not found")

    if body.action == "trip":
        cb._failure_count = cb.failure_threshold
        cb._last_failure_time = __import__("time").monotonic()
        from app.resilience.circuit_breaker import CircuitState
        cb._state = CircuitState.OPEN
        logger.warning("Circuit '%s' manually TRIPPED", name)
    elif body.action == "reset":
        from app.resilience.circuit_breaker import CircuitState
        cb._state = CircuitState.CLOSED
        cb._failure_count = 0
        cb._success_count = 0
        logger.info("Circuit '%s' manually RESET", name)
    else:
        raise HTTPException(status_code=400, detail="action must be 'trip' or 'reset'")

    return cb.status()
