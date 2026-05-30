from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.db import init_db
from routers.webhook_router import router as webhook_router
from routers.leads_router import router as leads_router
from routers.dashboard_router import router as dashboard_router

app = FastAPI(
    title="SalesFlow AI",
    description="Autonomous social media → sales conversion agent",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(leads_router)
app.include_router(dashboard_router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "salesflow-ai"}
