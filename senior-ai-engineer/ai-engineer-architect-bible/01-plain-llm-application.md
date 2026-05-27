# Architecture 1 — Plain LLM Application
## Golden Memory: `Request → Prompt → LLM → Parse → Response`

**Use for:** chatbot · summarizer · classifier · extractor · Q&A

---

## Architecture Flow

```
User Request
   ↓
Frontend (Web / Mobile / API Client)
   ↓
FastAPI Endpoint (/chat)
   ↓
Request DTO Validation (Pydantic)
   ↓
Authentication / Authorization
   ↓
Rate Limiting / Security Checks
   ↓
Prompt Builder
   ├── system prompt
   ├── user prompt
   └── model parameters
         temperature
         max tokens
   ↓
LLM SDK Client
   ↓
OpenAI / Anthropic / Gemini API
   ↓
Model Inference
   ↓
LLM Raw Response
   ↓
Response Parser
   ↓
Business Post-processing
   ├── formatting
   ├── validation
   └── error handling
   ↓
JSON Response
   ↓
Frontend UI
```

---

## Production Code

```python
# ============================================================
# PLAIN LLM APPLICATION — COMPLETE PRODUCTION CODE
# Stack: FastAPI + OpenAI SDK + Pydantic
# Pattern: Request → Prompt → LLM → Parse → Response
# ============================================================

import os
import logging
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# ── 1. MODELS (Pydantic DTO) ─────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    system_prompt: str = "You are a helpful assistant."
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=500, ge=1, le=4096)

class ChatResponse(BaseModel):
    answer: str
    tokens_used: int
    model: str

# ── 2. STARTUP — singleton client ────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = AsyncOpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=3,
        timeout=60.0,
    )
    yield

app = FastAPI(title="Plain LLM App", lifespan=lifespan)

# ── 3. AUTH ───────────────────────────────────────────────────

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ── 4. PROMPT BUILDER ─────────────────────────────────────────

def build_messages(req: ChatRequest) -> list[dict]:
    """Assemble system + user messages for the LLM."""
    return [
        {"role": "system", "content": req.system_prompt},
        {"role": "user",   "content": req.message},
    ]

# ── 5. RESPONSE PARSER ────────────────────────────────────────

def parse_response(response) -> tuple[str, int]:
    """Extract text and token count from raw LLM response."""
    content = response.choices[0].message.content
    tokens  = response.usage.total_tokens
    return content, tokens

# ── 6. ENDPOINT ───────────────────────────────────────────────

from fastapi import Request as FastAPIRequest

@app.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    request: FastAPIRequest,
    user: dict = Depends(get_current_user),   # auth
) -> ChatResponse:

    # Rate limiting check (example — real: use Redis counter)
    # if await is_rate_limited(user["sub"]): raise HTTPException(429)

    # Prompt Builder
    messages = build_messages(req)

    # LLM SDK Call
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

    # Response Parser
    answer, tokens = parse_response(response)

    # Business Post-processing
    answer = answer.strip()
    if not answer:
        raise HTTPException(status_code=500, detail="Empty LLM response")

    logger.info("chat user=%s tokens=%d", user.get("sub"), tokens)

    return ChatResponse(answer=answer, tokens_used=tokens, model="gpt-4o")


# ── 7. STRUCTURED OUTPUT VARIANT ──────────────────────────────
# Use this when you need typed JSON back (extractor / classifier)

from pydantic import BaseModel as PydanticBase

class SentimentResult(PydanticBase):
    label: str          # "positive" | "negative" | "neutral"
    confidence: float   # 0.0 – 1.0
    reason: str

async def classify_sentiment(text: str, llm: AsyncOpenAI) -> SentimentResult:
    response = await llm.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Classify the sentiment. Return JSON."},
            {"role": "user",   "content": text},
        ],
        response_format=SentimentResult,   # Pydantic model → structured output
    )
    return response.choices[0].message.parsed   # already a SentimentResult object


# ── INTERVIEW CHEAT SHEET ─────────────────────────────────────
# Q: "Walk me through a plain LLM service."
#
# A: "FastAPI endpoint receives a ChatRequest Pydantic model —
#    validation is automatic, 422 on bad input.
#    Auth via JWT Bearer token decoded in a Depends() function.
#    Prompt builder assembles system + user messages as a list of dicts.
#    AsyncOpenAI singleton (initialized at startup) sends the call —
#    max_retries=3 handles transient 429s automatically.
#    Response parser extracts content and token count.
#    For structured output I use beta.chat.completions.parse() with a
#    Pydantic response_format — the SDK returns a typed object, no
#    json.loads needed.
#    Log tokens on every call for cost tracking."
```
