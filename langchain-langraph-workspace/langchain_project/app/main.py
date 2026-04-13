import time
from fastapi import FastAPI, Request
from app.api.routes import router
from app.core.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title="AI Service",
    description="Production-ready LangChain AI service with agent, RAG, memory, and streaming",
    version="1.0.0",
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(f"{request.method} {request.url.path} | {response.status_code} | {duration}ms")
    return response


app.include_router(router)
