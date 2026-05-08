import os
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.models.response_model import (
    ChatRequest, AIResponse,
    AgentRequest, AgentResponse,
    MemoryMessage, MemoryResponse,
    PromptInfo, PromptsResponse,
    IngestResponse,
)
from app.services.ai_service import run_ai_service, load_prompt
from app.agents.agent import get_agent_executor
from app.rag.ingest import ingest_documents
from app.core.config import settings
from app.core.logger import get_logger
from app.memory.memory import memory

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["AI Service"])

DOCS_DIR = Path("data/documents")
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/health", summary="Health check")
def health():
    """Returns service status and model in use."""
    return {"status": "ok", "model": settings.model_name}


# ─── Chat ─────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=AIResponse, summary="Chat with AI (agent + optional RAG)")
def chat(request: ChatRequest):
    """
    Send a question to the AI service.

    - Runs through an **agent** with tool access (calculator, datetime).
    - Optionally activates **RAG** to retrieve context from ingested documents.
    - Selects prompt by **version** (v1 or v2).
    - Returns a structured response with `answer`, `sources`, and `steps`.
    """
    logger.info(f"POST /chat | question={request.question!r}")
    try:
        return run_ai_service(
            question=request.question,
            prompt_version=request.prompt_version,
            use_rag=request.use_rag,
        )
    except Exception as e:
        logger.error(f"Unhandled error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Streaming Chat ────────────────────────────────────────────────────────────

@router.post("/chat/stream", summary="Streaming chat (token-by-token)")
def chat_stream(request: ChatRequest):
    """
    Stream the AI response **token by token** using Server-Sent Events.

    Uses the selected prompt version and includes conversation memory.
    Ideal for real-time UI rendering.
    """
    logger.info(f"POST /chat/stream | question={request.question!r}")

    def token_generator():
        llm = ChatOpenAI(
            openai_api_key=settings.openai_api_key,
            model=settings.model_name,
            temperature=settings.temperature,
            streaming=True,
        )
        system_prompt = load_prompt(request.prompt_version)
        messages = [
            SystemMessage(content=system_prompt),
            *memory.get(),
            HumanMessage(content=request.question),
        ]
        for chunk in llm.stream(messages):
            yield chunk.content

    return StreamingResponse(token_generator(), media_type="text/plain")


# ─── Agent ────────────────────────────────────────────────────────────────────

@router.post("/agent", response_model=AgentResponse, summary="Run agent with tools")
def run_agent(request: AgentRequest):
    """
    Directly invoke the **agent** with its tools (calculator, datetime).

    The agent decides which tools to use and returns:
    - `answer` — final response
    - `tools_used` — list of tools invoked
    - `steps` — tool input/output trace
    """
    logger.info(f"POST /agent | question={request.question!r}")
    try:
        executor = get_agent_executor()
        result = executor.invoke({
            "input": request.question,
            "chat_history": memory.get(),
        })
        answer = result.get("output", "")
        tools_used = []
        steps = []
        for step in result.get("intermediate_steps", []):
            action, observation = step
            tools_used.append(action.tool)
            steps.append(f"{action.tool}({action.tool_input}) → {observation}")

        memory.add(request.question, answer)
        return AgentResponse(answer=answer, tools_used=tools_used, steps=steps)
    except Exception as e:
        logger.error(f"Agent error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── RAG Ingest ───────────────────────────────────────────────────────────────

@router.post("/ingest", response_model=IngestResponse, summary="Ingest a document for RAG")
def ingest(file: UploadFile = File(..., description="Upload a .txt or .pdf file to add to the knowledge base")):
    """
    Upload a **document** (.txt or .pdf) to be chunked, embedded, and stored
    in the FAISS vector store for RAG retrieval.

    After ingesting, use `POST /chat` with `use_rag: true` to query the document.
    """
    if not (file.filename.endswith(".txt") or file.filename.endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported.")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    save_path = DOCS_DIR / file.filename

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info(f"Ingesting uploaded file: {file.filename}")
    try:
        vectorstore = ingest_documents(str(save_path))
        chunk_count = vectorstore.index.ntotal
        return IngestResponse(
            message="Document ingested successfully.",
            filename=file.filename,
            chunks_created=chunk_count,
        )
    except Exception as e:
        logger.error(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Prompts ──────────────────────────────────────────────────────────────────

@router.get("/prompts", response_model=PromptsResponse, summary="List all available prompt versions")
def list_prompts():
    """
    Returns all **prompt versions** stored in `app/prompts/`.

    Use the `version` value (e.g. `v1`, `v2`) in `/chat` or `/chat/stream`
    to dynamically select which system prompt the AI uses.
    """
    prompts = []
    for txt_file in sorted(PROMPTS_DIR.glob("*.txt")):
        prompts.append(PromptInfo(
            version=txt_file.stem,
            content=txt_file.read_text().strip(),
        ))
    return PromptsResponse(prompts=prompts)


# ─── Memory ───────────────────────────────────────────────────────────────────

@router.get("/memory", response_model=MemoryResponse, summary="View conversation history")
def get_memory():
    """
    Returns the full **conversation history** stored in memory.

    Each message has a `role` (human / ai) and `content`.
    """
    messages = []
    for msg in memory.get():
        role = "human" if isinstance(msg, HumanMessage) else "ai"
        messages.append(MemoryMessage(role=role, content=msg.content))
    return MemoryResponse(messages=messages, total=len(messages))


@router.delete("/memory", summary="Clear conversation memory")
def clear_memory():
    """Clears all conversation history from memory."""
    memory.clear()
    logger.info("Memory cleared")
    return {"message": "Conversation memory cleared"}
