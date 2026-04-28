"""
Bench Resource Optimization System — FastAPI backend.
LLM: DeepSeek (OpenAI-compatible)  temperature=0 for speed + determinism
Embeddings: HuggingFace all-MiniLM-L6-v2 (local)
"""
import os
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from agents.cv_parser_agent import parse_cv
from agents.planning_agent import generate_plan
from agents.role_mapping_agent import map_role
from agents.tracking_agent import calculate_readiness
from rag.knowledge_base import build_vector_store, get_all_roles, get_embeddings
from storage import get_progress, get_user, save_progress, save_user
from utils.file_parser import extract_text_from_pdf

load_dotenv()

_llm = None
_vector_store = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _llm, _vector_store

    api_key = os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set in .env")

    _llm = ChatOpenAI(
        model=model,
        openai_api_key=api_key,
        openai_api_base=base_url,
        temperature=0,          # deterministic = marginally faster, consistent output
    )

    print("⏳ Loading HuggingFace embeddings (downloads once)...")
    embeddings = get_embeddings()
    _vector_store = build_vector_store(embeddings)
    print("✅ DeepSeek LLM + FAISS vector store ready.")
    yield


app = FastAPI(title="Bench Resource Optimization API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:4202", "http://127.0.0.1:4202"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ─────────────────────────────────────────────────────────────

class MapRoleRequest(BaseModel):
    user_id: str
    target_role: str

class GeneratePlanRequest(BaseModel):
    user_id: str
    target_role: str
    missing_skills: List[str]
    num_days: int = 7

class UpdateProgressRequest(BaseModel):
    user_id: str
    completed_task_ids: List[str]


# ── Routes ──────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "llm": "deepseek-chat"}


@app.get("/roles")
def list_roles():
    roles = get_all_roles()
    return [{"id": r["id"], "title": r["title"], "description": r["description"]}
            for r in roles]


@app.post("/upload-cv")
async def upload_cv(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")

    raw_bytes   = await file.read()
    resume_text = extract_text_from_pdf(raw_bytes)
    if not resume_text:
        raise HTTPException(422, "Could not extract text from PDF.")

    parsed  = parse_cv(resume_text, _llm)
    user_id = save_user({"profile": parsed, "resume_text": resume_text[:500]})
    return {"user_id": user_id, "profile": parsed}


@app.post("/map-role")
def map_role_endpoint(req: MapRoleRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    return map_role(user["profile"], req.target_role, _vector_store, _llm)


@app.post("/generate-plan")
async def generate_plan_endpoint(req: GeneratePlanRequest):
    """Async — runs phase-1 outline + all day tasks in parallel."""
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(404, "User not found.")

    current_skills = user["profile"].get("skills", [])
    plan = await generate_plan(
        req.target_role, req.missing_skills, current_skills, _llm, req.num_days
    )

    save_progress(req.user_id, {
        "role": req.target_role,
        "plan": plan,
        "completed_task_ids": [],
    })
    return plan


@app.post("/update-progress")
def update_progress(req: UpdateProgressRequest):
    """Pure Python — no LLM call, returns instantly."""
    progress = get_progress(req.user_id)
    if not progress:
        raise HTTPException(404, "No plan found. Generate a plan first.")

    progress["completed_task_ids"] = req.completed_task_ids
    save_progress(req.user_id, progress)

    return calculate_readiness(
        progress["role"],
        progress["plan"],
        req.completed_task_ids,
    )


@app.get("/progress/{user_id}")
def get_progress_endpoint(user_id: str):
    progress = get_progress(user_id)
    if not progress:
        raise HTTPException(404, "No progress found.")
    return progress
