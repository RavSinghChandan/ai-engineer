"""
Bench Resource Optimization System — FastAPI backend.
LLM: DeepSeek (OpenAI-compatible API)
Embeddings: HuggingFace all-MiniLM-L6-v2 (local, no API key needed)
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from typing import List
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
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set in .env")

    _llm = ChatOpenAI(
        model=model,
        openai_api_key=api_key,
        openai_api_base=base_url,
        temperature=0.3,
    )

    print("⏳ Loading HuggingFace embeddings (downloads once)...")
    embeddings = get_embeddings()
    _vector_store = build_vector_store(embeddings)
    print("✅ DeepSeek LLM + FAISS vector store ready.")
    yield


app = FastAPI(
    title="Bench Resource Optimization API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class MapRoleRequest(BaseModel):
    user_id: str
    target_role: str


class GeneratePlanRequest(BaseModel):
    user_id: str
    target_role: str
    missing_skills: List[str]


class UpdateProgressRequest(BaseModel):
    user_id: str
    completed_task_ids: List[str]


# ── Routes ────────────────────────────────────────────────────────────────────

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
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    raw_bytes = await file.read()
    resume_text = extract_text_from_pdf(raw_bytes)

    if not resume_text:
        raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    parsed = parse_cv(resume_text, _llm)
    user_id = save_user({"profile": parsed, "resume_text": resume_text[:500]})
    return {"user_id": user_id, "profile": parsed}


@app.post("/map-role")
def map_role_endpoint(req: MapRoleRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return map_role(user["profile"], req.target_role, _vector_store, _llm)


@app.post("/generate-plan")
def generate_plan_endpoint(req: GeneratePlanRequest):
    user = get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    current_skills = user["profile"].get("skills", [])
    plan = generate_plan(req.target_role, req.missing_skills, current_skills, _llm)

    save_progress(req.user_id, {
        "role": req.target_role,
        "plan": plan,
        "completed_task_ids": [],
    })
    return plan


@app.post("/update-progress")
def update_progress(req: UpdateProgressRequest):
    progress = get_progress(req.user_id)
    if not progress:
        raise HTTPException(status_code=404, detail="No plan found. Generate a plan first.")

    progress["completed_task_ids"] = req.completed_task_ids
    save_progress(req.user_id, progress)

    return calculate_readiness(
        progress["role"],
        progress["plan"],
        req.completed_task_ids,
        _llm,
    )


@app.get("/progress/{user_id}")
def get_progress_endpoint(user_id: str):
    progress = get_progress(user_id)
    if not progress:
        raise HTTPException(status_code=404, detail="No progress found.")
    return progress
