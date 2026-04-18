import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.routes.health import router as health_router
from app.api.routes.transaction import router as transaction_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Enable LangSmith tracing when configured
if settings.langchain_tracing_v2 and settings.langchain_api_key:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
    logger.info("LangSmith tracing enabled for project: %s", settings.langchain_project)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Banking AI Platform",
        description="Production-grade LangGraph Banking AI System",
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix="/api/v1")
    app.include_router(transaction_router, prefix="/api/v1")

    @app.on_event("startup")
    async def on_startup() -> None:
        logger.info("Banking AI Platform starting up [env=%s]", settings.app_env)

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        logger.info("Banking AI Platform shutting down")

    return app


app = create_app()
