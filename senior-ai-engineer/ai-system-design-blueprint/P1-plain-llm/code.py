"""
P1 — PLAIN LLM APPLICATION
Golden Memory: Request → Prompt → LLM → Parse → Response
Stack: FastAPI + AsyncOpenAI + Pydantic
================================================================
HOW TO USE THIS FILE:
  - Each section is labelled. Read top to bottom once.
  - Copy any section directly into your project.
  - To ADD a new provider: go to Section 3 (LLM Client)
  - To ADD a new prompt technique: go to Section 4 (Prompt Builder)
  - To ADD structured output: go to Section 7 (Variants)
================================================================
"""

import os
import logging
from fastapi import FastAPI, Depends, HTTPException, Request as FastAPIRequest
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


# ================================================================
# SECTION 1 — REQUEST / RESPONSE MODELS (Pydantic DTOs)
# ================================================================
# These define what comes IN and what goes OUT.
# Pydantic auto-validates — no manual if/else needed.

class ChatRequest(BaseModel):
    message:       str   = Field(min_length=1, max_length=10_000)
    system_prompt: str   = "You are a helpful assistant."
    temperature:   float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens:    int   = Field(default=500,  ge=1,   le=4096)

class ChatResponse(BaseModel):
    answer:      str
    tokens_used: int
    model:       str


# ================================================================
# SECTION 2 — APP STARTUP (singleton LLM client)
# ================================================================
# The LLM client is created ONCE at startup and reused.
# Never create it inside the endpoint — that's a new connection per request.

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=3,    # handles transient 429 / 503 automatically
        timeout=60.0,     # prevents hanging requests
    )
    yield
    # cleanup here if needed

app = FastAPI(title="Plain LLM App", lifespan=lifespan)


# ================================================================
# SECTION 3 — LLM CLIENT (add new providers here)
# ================================================================
# To add Anthropic: replace AsyncOpenAI with AsyncAnthropic
# To add Gemini:    use google.generativeai async client
# Pattern stays the same — only client + model name changes.

# ANTHROPIC VARIANT (uncomment to use):
# from anthropic import AsyncAnthropic
# client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
# response = await client.messages.create(
#     model="claude-3-5-sonnet-20241022",
#     max_tokens=500,
#     messages=[{"role": "user", "content": req.message}],
# )
# answer = response.content[0].text


# ================================================================
# SECTION 4 — PROMPT BUILDER (your most important skill)
# ================================================================
# This is where AI engineering happens. Anyone can call an LLM.
# The prompt is YOUR contribution.

def build_messages(req: ChatRequest) -> list[dict]:
    """
    Assemble the message list for the LLM.

    GOOD SYSTEM PROMPT STRUCTURE:
        You are [ROLE].
        Your job is to [TASK].
        Rules:
        - Always [rule 1]
        - Never [rule 2]
        Respond in [FORMAT].
    """
    return [
        {"role": "system", "content": req.system_prompt},
        {"role": "user",   "content": req.message},
    ]

# ADD A NEW PROMPT TECHNIQUE HERE:
# Few-shot: add {"role": "user", "content": example_q}, {"role": "assistant", "content": example_a}
# Chain-of-thought: add "Think step by step." to system_prompt
# Persona: change system_prompt to "You are a senior Python engineer at Google."


# ================================================================
# SECTION 5 — AUTH (JWT)
# ================================================================

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ================================================================
# SECTION 6 — MAIN ENDPOINT
# ================================================================

@app.post("/chat", response_model=ChatResponse)
async def chat(
    req:     ChatRequest,
    request: FastAPIRequest,
    user:    dict = Depends(get_current_user),
) -> ChatResponse:

    # ── Rate limiting (plug in Redis counter here) ──────────────
    # if await is_rate_limited(user["sub"]):
    #     raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # ── Build prompt ────────────────────────────────────────────
    messages = build_messages(req)

    # ── LLM call ────────────────────────────────────────────────
    try:
        response = await request.app.state.llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except Exception as e:
        logger.error("LLM call failed: %s", e)
        raise HTTPException(status_code=502, detail="LLM unavailable")

    # ── Parse response ──────────────────────────────────────────
    answer = response.choices[0].message.content.strip()
    tokens = response.usage.total_tokens

    if not answer:
        raise HTTPException(status_code=500, detail="Empty LLM response")

    # ── Log for cost tracking ───────────────────────────────────
    logger.info("chat user=%s tokens=%d", user.get("sub"), tokens)

    return ChatResponse(answer=answer, tokens_used=tokens, model="gpt-4o")


# ================================================================
# SECTION 7 — VARIANTS (add new output styles here)
# ================================================================

# VARIANT A: STRUCTURED OUTPUT (typed JSON back from LLM)
# Use when: classifier, extractor, data transformer
# ──────────────────────────────────────────────────────

class SentimentResult(BaseModel):
    label:      str    # "positive" | "negative" | "neutral"
    confidence: float  # 0.0 – 1.0
    reason:     str

async def classify_sentiment(text: str, llm: AsyncOpenAI) -> SentimentResult:
    """
    Use beta.chat.completions.parse() for structured output.
    The SDK validates and returns a typed Pydantic object — no json.loads needed.
    """
    response = await llm.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Classify the sentiment of this text. Return JSON."},
            {"role": "user",   "content": text},
        ],
        response_format=SentimentResult,
    )
    return response.choices[0].message.parsed   # SentimentResult object


# VARIANT B: MULTI-TURN CONVERSATION
# Use when: chatbot with history
# ──────────────────────────────────

class TurnMessage(BaseModel):
    role:    str   # "user" | "assistant"
    content: str

class MultiTurnRequest(BaseModel):
    history:     list[TurnMessage]
    new_message: str
    system_prompt: str = "You are a helpful assistant."

def build_multiturn_messages(req: MultiTurnRequest) -> list[dict]:
    messages = [{"role": "system", "content": req.system_prompt}]
    for turn in req.history[-10:]:   # keep last 10 turns (cost control)
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": req.new_message})
    return messages


# ================================================================
# ➕ ADD NEW VARIANT HERE
# Copy one of the variants above as a template.
# Name it VARIANT C, VARIANT D etc.
# ================================================================
