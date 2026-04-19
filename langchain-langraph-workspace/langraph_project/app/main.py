import time
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.config import get_settings
from app.core.logger import get_logger
from app.core.monitoring import setup_phoenix, setup_langsmith

from app.api.routes.health import router as health_router
from app.api.routes.transaction import router as transaction_router
from app.api.routes.loan import router as loan_router
from app.api.routes.account import router as account_router
from app.api.routes.compliance import router as compliance_router
from app.api.routes.conversation import router as conversation_router
from app.api.routes.loan_committee import router as committee_router
from app.api.routes.resilience import router as resilience_router
from app.api.routes.auth import router as auth_router
from app.api.routes.security import router as security_router
from app.api.routes.autonomous import router as autonomous_router

settings = get_settings()
logger = get_logger(__name__)

# ── Monitoring ────────────────────────────────────────────────────────────────
setup_phoenix(project_name=settings.langchain_project)
setup_langsmith(api_key=settings.langchain_api_key, project=settings.langchain_project)

# ── Swagger tag descriptions ──────────────────────────────────────────────────
OPENAPI_TAGS = [
    {
        "name": "Health",
        "description": "Service liveness check.",
    },
    {
        "name": "Transactions",
        "description": (
            "**Step 2 — Transaction Routing Graph.**  \n"
            "Routes a transaction to the correct processing engine "
            "(payment, loan, fraud, compliance, account, or human review) "
            "using a LangGraph conditional-edge graph."
        ),
    },
    {
        "name": "Loans",
        "description": (
            "**Step 3 — Loan Eligibility Stateful Workflow.**  \n"
            "Multi-step LangGraph pipeline that checks credit score, "
            "debt-to-income ratio, income multiples, computes a risk score, "
            "and returns APPROVED / REJECTED / PENDING_REVIEW."
        ),
    },
    {
        "name": "Accounts",
        "description": (
            "**Step 4 — Account Intelligence Agent (Tool Calling).**  \n"
            "ReAct-style LangGraph agent that autonomously calls "
            "`get_account_details` and `get_transactions` tools to answer "
            "natural-language questions about a bank account."
        ),
    },
    {
        "name": "Compliance",
        "description": (
            "**Step 5 — Compliance RAG Assistant.**  \n"
            "Retrieval-Augmented Generation over KYC, AML, PCI DSS, and GDPR "
            "policy documents. Grades retrieved chunks for relevance before "
            "generating a cited answer."
        ),
    },
    {
        "name": "Conversation",
        "description": (
            "**Step 6 — Conversational Banking Assistant with Memory.**  \n"
            "Multi-turn chat backed by LangGraph `MemorySaver` checkpoints "
            "(short-term) and a per-account topic profile (long-term). "
            "Same `session_id` continues the conversation across calls."
        ),
    },
    {
        "name": "Loan Committee",
        "description": (
            "**Step 7 — Multi-Agent Loan Approval Committee.**  \n"
            "Three autonomous agents share a typed state: "
            "**Planner** (risk identification) → **Executor** (eligibility checks) "
            "→ **Validator** (binding verdict). Returns APPROVED / REJECTED / ESCALATED."
        ),
    },
    {
        "name": "Resilience",
        "description": (
            "**Step 8 — Resilience Layer.**  \n"
            "Demonstrates all four patterns: circuit breaker → retry (tenacity) "
            "→ model fallback chain (gpt-4o-mini → gpt-3.5-turbo → rule-based) "
            "→ timeout (30 s). Includes ops endpoints to inspect and control "
            "circuit breakers at runtime."
        ),
    },
    {
        "name": "Security",
        "description": (
            "**Step 10 — Security Layer.**  \n"
            "JWT Bearer authentication (`POST /auth/token`) and role-based access "
            "control (admin > officer > customer). Human-in-the-loop approval "
            "implemented with LangGraph `interrupt_before` checkpointing: submit "
            "a loan → graph pauses → officer decides → graph resumes."
        ),
    },
    {
        "name": "Autonomous Agent",
        "description": (
            "**Step 11 — Autonomous Banking AI Agent.**  \n"
            "Single endpoint that accepts any natural-language banking query. "
            "The master orchestrator graph classifies intent, selects the right "
            "sub-workflow (loan / account / compliance / transaction / committee / "
            "resilience / conversation), executes it, optionally enriches with RAG, "
            "and falls back gracefully on failure. Full execution trace returned."
        ),
    },
]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Banking AI Platform",
        description=(
            "## Production-grade LangGraph Banking AI System\n\n"
            "Built with **LangGraph**, **FastAPI**, and **LangChain**. "
            "Monitored with **Arize Phoenix** (http://localhost:6006).\n\n"
            "### Steps implemented\n"
            "| Step | Feature |\n"
            "|---|---|\n"
            "| 2 | Transaction Routing Graph — conditional edges |\n"
            "| 3 | Loan Eligibility — stateful multi-gate workflow |\n"
            "| 4 | Account Agent — ReAct tool-calling loop |\n"
            "| 5 | Compliance RAG — FAISS + graded retrieval |\n"
            "| 6 | Conversational Memory — MemorySaver + profile |\n"
            "| 7 | Multi-Agent Loan Committee — Planner + Executor + Validator |\n"
            "| 8 | Resilience — retry + circuit breaker + fallback + timeout |\n"
            "| 10 | Security — JWT auth + RBAC + Human-in-the-Loop (interrupt) |\n"
            "| 11 | Autonomous Agent — master orchestrator, all workflows unified |\n\n"
            "### Observability\n"
            "- **Arize Phoenix** → http://localhost:6006 (run `phoenix serve` to start)\n"
            "- **LangSmith** → set `LANGCHAIN_API_KEY` in `.env`\n"
        ),
        version="1.0.0",
        openapi_tags=OPENAPI_TAGS,
        contact={
            "name": "Banking AI Platform",
            "email": "tejaswinimahale11@gmail.com",
        },
        license_info={"name": "MIT"},
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request timing middleware (ported from langchain_project) ─────────────
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = round((time.time() - start) * 1000, 2)
        logger.info(
            "%s %s | %s | %sms",
            request.method, request.url.path, response.status_code, duration,
        )
        return response

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health_router,      prefix="/api/v1")
    app.include_router(transaction_router, prefix="/api/v1")
    app.include_router(loan_router,        prefix="/api/v1")
    app.include_router(account_router,     prefix="/api/v1")
    app.include_router(compliance_router,  prefix="/api/v1")
    app.include_router(conversation_router,prefix="/api/v1")
    app.include_router(committee_router,   prefix="/api/v1")
    app.include_router(resilience_router,  prefix="/api/v1")
    app.include_router(auth_router,        prefix="/api/v1")
    app.include_router(security_router,    prefix="/api/v1")
    app.include_router(autonomous_router,  prefix="/api/v1")

    @app.on_event("startup")
    async def on_startup() -> None:
        logger.info("Banking AI Platform starting [env=%s]", settings.app_env)
        logger.info("Swagger UI  → http://%s:%s/docs", settings.app_host, settings.app_port)
        logger.info("Phoenix UI  → http://localhost:6006")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        logger.info("Banking AI Platform shutting down")

    return app


app = create_app()
