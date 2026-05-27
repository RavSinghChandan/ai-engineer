# Python for AI Engineering — Complete Revision Guide
### All 5 Phases · 38 Lessons · Read in 45–60 Minutes

---

> **How to use this:** Each section has the key concept, the Java anchor (what maps to what), the code pattern you must know, and the interview line. Nothing is skipped — only simplified. Read top to bottom for a full revision.

---

# PHASE 1 — Python Core

---

## L01 · Python Mental Model vs Java

Python is **dynamically typed** — types are checked at runtime, not compile time. Variables are names pointing to objects, not typed containers.

```python
x = 5        # x points to int object
x = "hello"  # x now points to str object — valid in Python, invalid in Java
```

**Java anchor:** Java is `int x = 5` — type bound at declaration. Python is closer to `Object x = 5` but smarter.

**Three things that surprise Java developers:**
1. No `null` — Python uses `None` (same concept, different name)
2. `==` compares value; `is` compares identity (like Java's `==` for objects vs `.equals()`)
3. Everything is an object — functions, classes, modules are all first-class objects you can pass around

**Interview line:** "Python trades compile-time type safety for flexibility. I use type hints and Pydantic models to get the safety back where it matters — at API boundaries."

---

## L02 · Variables and Mutability

**Mutable:** `list`, `dict`, `set` — can be modified in place.
**Immutable:** `int`, `str`, `tuple`, `frozenset` — cannot be modified.

```python
# Mutable default argument bug — the #1 Python gotcha from Java devs:
def bad(items=[]):          # list created ONCE at function definition
    items.append("x")
    return items
bad()  # ["x"]
bad()  # ["x", "x"]  ← bug! same list reused

def good(items=None):       # correct pattern
    if items is None:
        items = []
    return items
```

**`is` vs `==`:**
- `a == b` → same value (Java: `.equals()`)
- `a is b` → same object in memory (Java: `==` for reference types)

**Unpacking (Java: no equivalent):**
```python
a, b = 1, 2          # tuple unpacking
first, *rest = [1,2,3,4]   # rest = [2,3,4]
```

---

## L03 · Core Collections

| Python | Java |
|---|---|
| `list` | `ArrayList<T>` |
| `tuple` | `List.of(...)` (immutable) |
| `dict` | `HashMap<K,V>` |
| `set` | `HashSet<T>` |
| `deque` | `ArrayDeque<T>` |
| `Counter` | Manual `HashMap<String,Integer>` |
| `defaultdict` | `computeIfAbsent` pattern |

```python
from collections import Counter, defaultdict, deque

# Counter — frequency map (Java: no built-in):
skills = ["Python", "Java", "Python", "Docker"]
counts = Counter(skills)    # {"Python": 2, "Java": 1, "Docker": 1}
counts.most_common(2)       # [("Python", 2), ("Java", 1)]

# defaultdict — never KeyError on missing key:
dd = defaultdict(list)
dd["skills"].append("Python")   # no KeyError even if "skills" never existed

# dict is ordered (Python 3.7+) — Java HashMap is not
```

**Key difference from Java:** Python containers hold references to objects, not copies. `list_b = list_a` does NOT copy — both names point to the same list. Use `list_a.copy()` or `list_a[:]`.

---

## L04 · Functions

```python
# First-class: functions can be stored and passed
def greet(name): return f"Hello {name}"
say = greet             # same function, different name
funcs = [greet, str.upper]   # list of functions — Java: List<Function<String,String>>

# Closure — inner function remembers outer scope (Java: lambda capturing final variable):
def make_multiplier(n):
    def multiply(x):
        return x * n   # n captured from outer scope
    return multiply

double = make_multiplier(2)
double(5)   # 10
```

**Docstring:** first string literal after `def` — accessible via `help(fn)`.

---

## L05 · `*args` and `**kwargs`

```python
# *args = variable positional args (Java: String... args — varargs)
def total(*numbers): return sum(numbers)
total(1, 2, 3, 4)    # 10

# **kwargs = variable keyword args (Java: Map<String,Object> — no direct syntax)
def create(**fields): return fields
create(name="Ravi", role="engineer")   # {"name": "Ravi", "role": "engineer"}

# Unpack into call (Java: no equivalent):
args = [1, 2, 3]
total(*args)         # same as total(1, 2, 3)

config = {"name": "Ravi", "role": "engineer"}
create(**config)     # same as create(name="Ravi", role="engineer")
```

**AI engineering use:** `**prompt_kwargs` to pass arbitrary LLM parameters through layers without changing every function signature.

---

## L06 · Comprehensions

```python
# List comprehension (Java: stream().map().filter().collect()):
squares  = [x**2 for x in range(10)]
filtered = [x for x in scores if x > 0.8]
flat     = [item for sublist in nested for item in sublist]   # flatMap

# Dict comprehension (Java: Collectors.toMap()):
score_map = {name: score for name, score in zip(names, scores)}

# Set comprehension (Java: Collectors.toSet()):
unique_skills = {skill.lower() for cv in cvs for skill in cv.skills}

# Generator expression — lazy (Java: stream() without terminal operation):
total_tokens = sum(len(chunk.split()) for chunk in chunks)   # no list created
```

**Rule:** use comprehensions for simple transforms. Use explicit `for` loops when the logic is complex.

---

## L07 · Iterators and Generators

```python
# Generator function — yields lazily (Java: no equivalent, closest is Stream.generate())
def stream_chunks(text, size=1000):
    for i in range(0, len(text), size):
        yield text[i:i+size]   # suspends here, resumes on next()

# Consume:
for chunk in stream_chunks(document):
    process(chunk)   # only one chunk in memory at a time

# Generator for LLM token streaming:
def stream_tokens(response_stream):
    for chunk in response_stream:
        token = chunk.choices[0].delta.content
        if token: yield token

full_text = "".join(stream_tokens(stream))   # collect all tokens
```

**Key insight:** `yield` turns a function into a generator. The function body runs lazily — one `yield` per `next()` call. Memory stays constant no matter how large the input.

---

## L08 · Decorators

```python
# Decorator = function that wraps another function (Java: AOP @Around advice)
import functools, time, logging

def log_calls(func):
    @functools.wraps(func)   # preserve original function name/docstring
    def wrapper(*args, **kwargs):
        logger.info("Calling %s", func.__name__)
        result = func(*args, **kwargs)
        logger.info("Done %s", func.__name__)
        return result
    return wrapper

@log_calls              # equivalent to: analyze = log_calls(analyze)
def analyze(cv): ...

# Decorator with arguments (Java: @Retryable(maxAttempts=3)):
def retry(max_attempts=3):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try: return func(*args, **kwargs)
                except Exception:
                    if attempt == max_attempts - 1: raise
        return wrapper
    return decorator

@retry(max_attempts=3)
def call_llm(prompt): ...
```

---

## L09 · Context Managers

```python
# with statement = try-with-resources (Java: try (Resource r = ...) { })
# Guarantees cleanup even on exception

# File handling:
with open("file.txt", "r") as f:
    content = f.read()   # f.close() called automatically

# Custom context manager:
from contextlib import contextmanager

@contextmanager
def timer(label):
    start = time.perf_counter()
    yield                    # code inside `with` block runs here
    elapsed = (time.perf_counter() - start) * 1000
    print(f"{label}: {elapsed:.0f}ms")

with timer("LLM call"):
    response = client.chat.completions.create(...)
```

**AI engineering pattern:** `tempfile.NamedTemporaryFile()` as context manager — temp file auto-deleted after `with` block. Use for PDF uploads.

---

## L10 · Pythonic OOP

```python
# @property — getter/setter without () (Java: getField() / setField())
class CVProfile:
    def __init__(self, name: str):
        self._name = name

    @property
    def name(self) -> str:           # read: profile.name (no parentheses)
        return self._name

    @name.setter
    def name(self, value: str):      # write: profile.name = "Ravi"
        self._name = value.strip()

# @dataclass — replaces Lombok @Data:
from dataclasses import dataclass, field

@dataclass
class EmbeddedChunk:
    source: str
    text: str
    embedding: list[float]
    chunk_index: int = 0

# __repr__, __eq__, __init__ auto-generated
# @dataclass(frozen=True) → immutable, like Java record
```

**Java anchor:** `@dataclass` = Lombok `@Data`. `@dataclass(frozen=True)` = Java `record`.

---

# PHASE 2 — Production Internals

---

## L01 · Python Object Model

Everything in Python is an object with three properties:
- **Identity:** `id(x)` — memory address (Java: `System.identityHashCode(x)`)
- **Type:** `type(x)` — class (Java: `x.getClass()`)
- **Value:** `x` — the data

**Dunder methods** (`__method__`) are how Python's operators work:
```python
class Vector:
    def __add__(self, other): return Vector(self.x + other.x)  # enables a + b
    def __len__(self): return 2                                  # enables len(v)
    def __repr__(self): return f"Vector({self.x}, {self.y})"  # enables repr(v)
```

**MRO (Method Resolution Order):** Python searches the class hierarchy left-to-right for method lookup. `ClassName.__mro__` shows the order.

---

## L02 · Typing and Protocols

```python
from typing import Optional, Union, TypeVar, Protocol
from typing import Callable, TypedDict

# Optional[str] = str | None (Java: Optional<String> / @Nullable)
def find(user_id: str) -> Optional[dict]: ...

# Union[str, int] = str | int (Java: no equivalent — use polymorphism)
def process(value: str | int) -> str: ...

# Protocol — structural typing, no explicit inheritance (Java: interface + implements)
class Embedder(Protocol):
    def embed(self, text: str) -> list[float]: ...

# Any class with an embed() method satisfies Embedder — no implements needed

# TypedDict — dict with known key types (Java: Map<String, Object> with validation)
class CVData(TypedDict):
    name: str
    skills: list[str]
    experience_years: int
```

**Interview line:** "I use Protocol instead of abstract base classes for AI service interfaces — it's duck typing with type checking. Any class that has the right methods satisfies the protocol, no inheritance needed."

---

## L03 · Async Python

```python
import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI()

# async def = @Async method in Spring (but cooperative, not thread-based)
async def call_llm(prompt: str) -> str:
    response = await async_client.chat.completions.create(
        model="gpt-4o", messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

# Parallel calls (Java: CompletableFuture.allOf()):
results = await asyncio.gather(
    call_llm("prompt1"),
    call_llm("prompt2"),
    call_llm("prompt3"),
)   # all three run concurrently

# Semaphore — limit concurrency (Java: new Semaphore(5)):
semaphore = asyncio.Semaphore(5)
async def rate_limited_call(prompt):
    async with semaphore:
        return await call_llm(prompt)
```

**Critical rule:** `async def` functions must be `await`ed. Never call blocking I/O inside an async function — use `await loop.run_in_executor(None, blocking_fn)`.

---

## L04 · Exceptions and Error Design

```python
# Custom exception hierarchy (Java: RuntimeException hierarchy):
class AppError(Exception):
    def __init__(self, message: str, code: str = "APP_ERROR"):
        self.message = message; self.code = code

class CVParseError(AppError): pass
class LLMError(AppError): pass
class NotFoundError(AppError): pass

# Retry pattern — fail loud after N attempts:
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from openai import RateLimitError, APITimeoutError

@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_exponential(min=1, max=60),
    stop=stop_after_attempt(5),
)
async def safe_call(prompt): ...

# Exception handling — only catch what you can handle:
try:
    result = await safe_call(prompt)
except RateLimitError:
    raise LLMError("Rate limit exceeded")   # translate to domain exception
```

---

## L05 · Structured Logging

```python
import logging

# Configure JSON logging at startup:
from pythonjsonlogger import jsonlogger
handler = logging.StreamHandler()
handler.setFormatter(jsonlogger.JsonFormatter())
logging.root.handlers = [handler]
logging.root.setLevel("INFO")

logger = logging.getLogger(__name__)

# Log with structured fields (Java: MDC key-value pairs):
logger.info("LLM call", extra={
    "model": "gpt-4o", "tokens": 850,
    "latency_ms": 1234, "cache_hit": False,
})

# Correlation ID — async-safe MDC (Java: MDC.put("requestId", id)):
from contextvars import ContextVar
REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="")
# Set in middleware: REQUEST_ID.set(request_id)
# Use in logging filter to inject into every log record
```

---

## L06 · Config Management

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    jwt_secret: str                        # required — fails at startup if missing
    openai_api_key: str
    llm_model: str = "gpt-4o"             # optional with default
    redis_url: str = "redis://localhost:6379"

    model_config = SettingsConfigDict(env_file=".env")

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()   # singleton — loaded once
```

**Rule:** Never `os.getenv("KEY")` scattered across the codebase. One `Settings` class, one place. It fails at startup (not at runtime) if anything is missing — same guarantee as Spring `@ConfigurationProperties`.

---

## L07 · Packaging and Environments

```python
# venv (Java: Maven local repo isolation):
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# requirements.txt (Java: pom.xml dependencies):
# fastapi==0.111.0
# openai==1.30.0
# pydantic==2.7.0

# pyproject.toml — modern standard (replaces setup.py):
# [project]
# name = "bench-optimizer"
# dependencies = ["fastapi", "openai", "pydantic"]

# uv — fast package manager (replaces pip for speed):
# uv pip install -r requirements.txt   (10x faster than pip)
```

---

## L08 · Testing

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

# Fixture (Java: @BeforeEach setup):
@pytest.fixture
def client():
    return TestClient(app)

# Mock LLM in tests (Java: @MockBean):
@pytest.fixture
def mock_llm():
    svc = MagicMock(spec=LLMService)
    svc.complete = AsyncMock(return_value='{"match_percentage": 85}')
    app.dependency_overrides[get_llm] = lambda: svc
    yield svc
    app.dependency_overrides.clear()

# Test:
def test_analyze(client, mock_llm):
    response = client.post("/analyze", json={"cv_text": "Python...", "target_role": "Dev"})
    assert response.status_code == 200
    mock_llm.complete.assert_called_once()

# patch — swap a module-level name temporarily:
with patch("services.llm_service.AsyncOpenAI") as MockClient:
    MockClient.return_value.chat.completions.create = AsyncMock(...)
```

---

# PHASE 3 — AI Libraries

---

## L01 · NumPy

```python
import numpy as np

# Arrays — typed, fixed-shape, vectorized (Java: no equivalent — double[] is primitive)
a = np.array([1.0, 2.0, 3.0], dtype=np.float32)   # always float32 for AI
m = np.zeros((3, 1536), dtype=np.float32)          # matrix of embeddings

# Vectorized ops — no loops:
norms = np.linalg.norm(m, axis=1, keepdims=True)   # row-wise norm
normalized = m / norms                              # broadcast divide

# Cosine similarity between one query and all stored vectors:
scores = np.dot(normalized_matrix, query_vector)    # shape: (N,)
top_k = np.argsort(scores)[::-1][:5]               # top 5 indices

# shapes:
# (1536,)       → single embedding vector
# (N, 1536)     → matrix of N embeddings
# (N,)          → similarity scores
```

---

## L02 · Pandas

```python
import pandas as pd

df = pd.read_csv("candidates.csv")        # load (Java: JDBC ResultSet)
df = pd.read_parquet("embeddings.parquet")

# Filter (Java: stream().filter()):
senior = df[df["experience_years"] >= 5]
python_devs = df[df["skills"].str.contains("Python")]

# Groupby (Java: Collectors.groupingBy()):
avg_match = df.groupby("role")["match_score"].mean()

# New column (Java: no equivalent — must build new list):
df["score_pct"] = df["match_score"] * 100

# Export:
df.to_parquet("output.parquet", index=False)
df.to_csv("output.csv", index=False)
```

---

## L03 · HTTP Clients

```python
import httpx

# Sync client (Java: RestTemplate):
with httpx.Client(timeout=30.0) as client:
    response = client.get("https://api.example.com/data")
    data = response.json()

# Async client (Java: WebClient):
async with httpx.AsyncClient() as client:
    response = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})

# Retry with tenacity — httpx has no built-in retry:
@retry(wait=wait_exponential(min=1, max=30), stop=stop_after_attempt(3))
async def fetch(url): ...
```

---

## L04 · Pydantic

```python
from pydantic import BaseModel, Field, field_validator

class RoleMappingOutput(BaseModel):
    role: str
    match_percentage: int = Field(ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
    recommendation: str

    @field_validator("match_percentage", mode="before")
    @classmethod
    def parse_pct(cls, v):
        if isinstance(v, str):
            return int(v.rstrip("%"))
        return v

# Parse LLM JSON output:
parsed = RoleMappingOutput.model_validate_json(llm_response)

# Serialize:
parsed.model_dump()             # → dict
parsed.model_dump_json()        # → JSON string (handles datetime)
parsed.model_dump(exclude_none=True)
```

**Java anchor:** Pydantic = Lombok `@Data` + Bean Validation + Jackson in one library.

---

## L05 · File Handling

```python
from pathlib import Path
import json

# pathlib (Java: java.nio.file.Path):
path = Path("data") / "resumes" / "ravi.pdf"
path.exists(); path.stem; path.suffix; path.parent
output_dir = Path("output")
output_dir.mkdir(parents=True, exist_ok=True)
pdfs = list(Path("data").rglob("*.pdf"))   # recursive glob

# JSON:
with open("file.json") as f: data = json.load(f)
with open("file.json", "w") as f: json.dump(data, f, indent=2)

# Parquet — best for large AI datasets:
df.to_parquet("embeddings.parquet", compression="snappy")
df = pd.read_parquet("embeddings.parquet")
```

---

## L06 · Regex

```python
import re

# Key functions:
re.search(r"pattern", text)    # first match anywhere (Java: matcher.find())
re.findall(r"pattern", text)   # all matches as list
re.sub(r"pattern", repl, text) # replace all (Java: replaceAll)

# AI engineering patterns — pre-compile at module level:
JSON_BLOCK   = re.compile(r"```(?:json)?\s*([\s\S]+?)\s*```")
EMAIL_PAT    = re.compile(r"[\w.-]+@[\w.-]+\.\w+")
INJECTION    = re.compile(r"ignore\s+(previous|all|above)|forget\s+instructions", re.I)

def extract_json_from_llm(response: str) -> str:
    m = JSON_BLOCK.search(response)
    return m.group(1) if m else response.strip()

def check_injection(text: str) -> bool:
    return bool(INJECTION.search(text))
```

---

## L07 · Serialization

```python
import json
from datetime import datetime
import numpy as np

# Custom encoder for AI types (Java: custom Jackson serializer):
class AIEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):  return obj.isoformat()
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, np.floating): return float(obj)
        if hasattr(obj, "model_dump"):  return obj.model_dump()
        return super().default(obj)

json.dumps(data, cls=AIEncoder)

# Pydantic for API responses:
model.model_dump()                    # → dict
model.model_dump_json()               # → JSON string (handles datetime)
model.model_dump(exclude_none=True)
Model.model_validate(dict_data)
Model.model_validate_json(json_str)
```

---

# PHASE 4 — AI Engineering Projects

---

## L01 · OpenAI SDK Patterns

```python
from openai import OpenAI, AsyncOpenAI

# Singleton async client (Java: @Bean singleton RestTemplate):
async_client = AsyncOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    max_retries=3,    # auto-retry 429 and 5xx
    timeout=60.0,
)

# Chat completion:
response = await async_client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a recruiter."},
        {"role": "user",   "content": prompt},
    ],
    temperature=0.2,
)
text   = response.choices[0].message.content
tokens = response.usage.total_tokens

# Structured output with Pydantic:
response = await async_client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}],
    response_format=RoleMappingOutput,   # Pydantic model directly
)
result: RoleMappingOutput = response.choices[0].message.parsed

# Provider swap (DeepSeek, Azure, Ollama — same SDK):
client = OpenAI(api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com")
```

**Three production principles:** (1) singleton async client, never create per request; (2) always use `response_format` or `.parse()` for structured output; (3) log `usage.total_tokens` on every call.

---

## L02 · Embedding Pipelines

```python
# Chunking strategies:
chunks = chunk_by_characters(text, size=1000, overlap=200)   # simplest
chunks = chunk_by_sentences(text, max_chars=1000)            # better for retrieval
chunks = chunk_by_tokens(text, max_tokens=512, overlap=50)   # exact — use tiktoken

# Batch embed — ONE API call for many chunks (not one per chunk):
response = client.embeddings.create(
    model="text-embedding-3-small",
    input=chunks,    # list of up to 2048 strings
)
embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]

# Async batching with rate control:
semaphore = asyncio.Semaphore(5)
async def embed_batch(batch):
    async with semaphore:
        return (await async_client.embeddings.create(model=..., input=batch)).data

# Full pipeline: preprocess → chunk → batch embed → persist
```

**Key numbers:** `text-embedding-3-small` = 1536 dimensions, $0.02/million tokens. 512 tokens per chunk ≈ 2000 characters. Never embed one chunk at a time.

---

## L03 · Vector DB Integration

| Option | Use when |
|---|---|
| FAISS in-process | Dev + single-server, < 1M vectors |
| Pinecone managed | Production, multi-server, needs metadata filter |
| Weaviate self-hosted | Production, want data control, stores full objects |

```python
import faiss, numpy as np

# FAISS:
index = faiss.IndexFlatIP(1536)   # inner product = cosine if normalized
faiss.normalize_L2(vectors)       # normalize before add and query
index.add(vectors)
D, I = index.search(query, k=5)  # D=scores, I=row indices
faiss.write_index(index, "index.faiss")

# Pinecone:
index.upsert(vectors=[{"id": chunk_id, "values": emb, "metadata": meta}])
results = index.query(vector=query_emb, top_k=5, include_metadata=True,
                      filter={"role": {"$eq": "python-dev"}})
```

**Abstraction:** use a `VectorRepository` Protocol so FAISS and Pinecone are swappable via a factory function.

---

## L04 · FastAPI

```python
from fastapi import FastAPI, Depends, HTTPException

app = FastAPI(lifespan=lifespan)   # lifespan = startup/shutdown (@PostConstruct/@PreDestroy)

# Route = @RestController + @PostMapping:
@app.post("/analyze", response_model=CVAnalysisResponse)
async def analyze(
    body: CVAnalysisRequest,            # auto-validated Pydantic model
    user: dict = Depends(get_current_user),  # auth (@Autowired equivalent)
    svc: LLMService = Depends(get_llm),      # service injection
) -> CVAnalysisResponse: ...

# Middleware (Java: HandlerInterceptor):
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Latency"] = f"{(time.perf_counter()-start)*1000:.0f}ms"
    return response

# Exception handler (Java: @ControllerAdvice):
@app.exception_handler(NotFoundError)
async def handle_not_found(req, exc):
    return JSONResponse(status_code=404, content={"error": exc.message})
```

---

## L05 · AI Agent Patterns

**Two patterns:**
- **Sequential chain** — fixed order of LLM calls, each feeds the next. Simple, predictable. Use for defined workflows.
- **ReAct loop** — LLM decides which tool to call, calls it, gets result, decides again. Flexible. Use for open-ended tasks.

```python
# Tool definition (schema for LLM):
tool = {"type": "function", "function": {
    "name": "search_cv_database",
    "description": "Search CVs by natural language query",
    "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
}}

# ReAct loop:
for step in range(max_steps):
    response = await client.chat.completions.create(model="gpt-4o", messages=messages, tools=[tool])
    message = response.choices[0].message
    messages.append(message)
    if not message.tool_calls: return message.content   # done
    for tc in message.tool_calls:
        result = TOOL_REGISTRY[tc.function.name](**json.loads(tc.function.arguments))
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
```

---

## L06 · Prompt Engineering in Code

```python
# Never scatter prompts as f-strings — keep in prompts/ directory
# Build with PromptBuilder for complex prompts

prompt = (
    PromptBuilder()
    .system("You are a recruiter. Return JSON only.")
    .few_shot(example_input, example_output)   # improves accuracy
    .section("CV", cv_text)
    .section("Role", target_role)
    .output_schema('{"match_percentage": int, "matched_skills": list}')
    .temperature(0.0)
    .build()
)

# Validate inputs before building:
class PromptInput(BaseModel):
    cv_text: str = Field(min_length=50, max_length=50_000)
    @field_validator("cv_text")
    @classmethod
    def no_injection(cls, v):
        if INJECTION_PAT.search(v): raise ValueError("Injection detected")
        return v

# Version prompts: PromptVersion.V1, V2, V3 — log which version used
```

---

## L07 · Streaming Responses

```python
# Async generator that yields tokens:
async def stream_tokens(prompt: str):
    stream = await async_client.chat.completions.create(
        model="gpt-4o", messages=[{"role": "user", "content": prompt}], stream=True
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token: yield token

# FastAPI SSE endpoint (Java: Spring WebFlux text/event-stream):
@app.get("/stream")
async def stream_endpoint(prompt: str) -> StreamingResponse:
    async def events():
        async for token in stream_tokens(prompt):
            yield f"data: {token}\n\n"   # SSE format — double newline = event delimiter
        yield "data: [DONE]\n\n"
    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no"})   # disable Nginx buffering
```

---

## L08 · Rate Limiting and Retries

```python
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type
from openai import RateLimitError, APITimeoutError, BadRequestError
import asyncio

# Three layers of protection:
# 1. SDK: AsyncOpenAI(max_retries=3) — handles 429/5xx automatically
# 2. tenacity: custom backoff with jitter — prevents thundering herd
# 3. Semaphore: caps concurrent calls — prevents rate limit in the first place

@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_random_exponential(min=1, max=60),   # jitter prevents simultaneous retries
    stop=stop_after_attempt(5),
)
async def safe_llm_call(prompt): ...

# Concurrency control:
semaphore = asyncio.Semaphore(5)
async def rate_limited(prompt):
    async with semaphore:
        return await safe_llm_call(prompt)

# NEVER retry BadRequestError (400) — it's a code bug, not a transient failure
```

---

# PHASE 5 — Senior AI Architecture

---

## L01 · Clean Project Structure

```
backend/
  api/           ← FastAPI routers   (@RestController)
  services/      ← business logic    (@Service)
  repositories/  ← data access       (@Repository)
  models/        ← Pydantic models   (DTO + @Entity)
  config/        ← settings.py       (@ConfigurationProperties)
  exceptions/    ← AppError hierarchy
  prompts/       ← .txt / .j2 templates
  tests/
  main.py        ← thin wiring file  (@SpringBootApplication)
```

**Rules:**
- `main.py` only wires — no business logic
- Services accept Pydantic models, return Pydantic models
- Each router file = one domain (auth, candidates, roles)
- `models/__init__.py` exports the public surface — internal file structure can change without breaking imports

---

## L02 · Dependency Injection

```python
# Singleton services — initialize in lifespan, inject via Depends:
@asynccontextmanager
async def lifespan(app):
    app.state.llm = LLMService(get_settings())   # created once
    yield

def get_llm(request: Request) -> LLMService:
    return request.app.state.llm

@app.post("/analyze")
async def analyze(svc: LLMService = Depends(get_llm)): ...

# Override in tests (Java: @MockBean):
app.dependency_overrides[get_llm] = lambda: mock_llm_service
# restore: app.dependency_overrides.clear()

# Services use constructor injection — makes dependencies explicit:
class MatchingService:
    def __init__(self, client: AsyncOpenAI, settings: Settings): ...
```

---

## L03 · Background Processing

| Need | Tool |
|---|---|
| Fire-and-forget after response | FastAPI `BackgroundTasks` |
| Long-running loop in same process | `asyncio.create_task` |
| Durable tasks surviving restart | Celery + Redis |
| Scheduled / cron jobs | APScheduler |

```python
# BackgroundTasks (Java: @Async):
@app.post("/upload")
async def upload(tasks: BackgroundTasks):
    tasks.add_task(reindex_candidate, user_id, cv_text)
    return {"status": "queued"}

# asyncio loop (Java: daemon thread):
task = asyncio.create_task(periodic_reindex_loop(interval=3600))
# Cancel on shutdown: task.cancel(); await task

# Celery (Java: RabbitMQ consumer):
@celery_app.task(max_retries=3)
def embed_cv_task(user_id, cv_text): ...
embed_cv_task.delay(user_id, cv_text)   # enqueue from FastAPI
```

---

## L04 · Caching

**Three-tier strategy:**

1. **`@lru_cache`** — static data, never expires, in-process. Role definitions, model metadata.
2. **Redis** — distributed, TTL-based, survives restarts. LLM responses (hash of prompt → answer), embedding vectors (hash of text → vector).
3. **Semantic cache** — for LLM responses where paraphrases should hit the same cache entry. Embed the query, cosine similarity ≥ 0.95 → cache hit.

```python
# LLM response cache key:
key = f"llm:{hashlib.sha256(json.dumps(messages, sort_keys=True).encode()).hexdigest()[:16]}"

# Only cache temperature=0.0 calls (deterministic)
# Embedding cache: f"embedding:{hashlib.md5(text.encode()).hexdigest()}"
# TTL: LLM responses = 1 hour, embeddings = 7 days

# Cache-aside (Java: @Cacheable):
async def get_or_compute(key, fn, ttl):
    if cached := await redis.get(key): return json.loads(cached)
    result = await fn()
    await redis.setex(key, ttl, json.dumps(result))
    return result
```

---

## L05 · Observability

```python
# Structured JSON logging:
from pythonjsonlogger import jsonlogger
logging.root.handlers = [handler_with_json_formatter]

logger.info("LLM call", extra={
    "model": "gpt-4o", "tokens": 850, "latency_ms": 1234,
    "cost_usd": 0.00255, "cache_hit": False,
})

# Prometheus metrics to track (Java: Micrometer):
from prometheus_client import Counter, Histogram, make_asgi_app
LLM_CALLS   = Counter("llm_calls_total", "Total LLM calls", ["model", "status"])
LLM_LATENCY = Histogram("llm_latency_seconds", "LLM latency", buckets=[0.5,1,2,5,10,30])
app.mount("/metrics", make_asgi_app())   # expose for Prometheus scraping

# Health endpoint (Java: Actuator /health):
@app.get("/health")
async def health(): return {"status": "ok", "checks": {"redis": "ok", "llm": "ok"}}
```

**LLM-specific metrics every production service must track:**
- `llm_tokens_used_total` — cost control (alert when doubles)
- `llm_latency_p95` — SLA monitoring
- `llm_cache_hit_rate` — should be > 60% for Q&A systems
- `llm_error_rate` — alert threshold 1%

---

# Master Interview Answer Bank

---

**"How do you structure OpenAI SDK usage in production?"**
> "Singleton async client at startup with `max_retries=3` and explicit timeout. Always `beta.chat.completions.parse()` with a Pydantic model for structured output — eliminates the class of bugs where LLM returns a different JSON shape. Log `usage.total_tokens` and latency on every call for cost alerting."

**"How does Pydantic replace multiple Java libraries?"**
> "Three libraries in one: Lombok `@Data` (auto `__init__`, `__repr__`, `__eq__`), Bean Validation (`Field(ge=0, le=100)`), and Jackson (`model_validate_json()`, `model_dump_json()`). FastAPI reads Pydantic models to generate Swagger and validate request bodies automatically."

**"How do you build an embedding pipeline?"**
> "Four stages: preprocess (clean whitespace, normalize unicode), chunk (512 tokens with 50-token overlap for RAG precision), batch embed (one API call for 100 chunks, not 100 calls), persist (JSON or Parquet to avoid re-embedding on restart). Cost: `text-embedding-3-small` is $0.02/million tokens — 10,000 CVs ≈ $5 total."

**"FAISS vs Pinecone vs Weaviate?"**
> "FAISS in-process for dev and single-server (no network, sub-ms). Pinecone for production at scale — managed, auto-scales, metadata filtering. Weaviate when you want self-hosted and it stores full text objects alongside vectors. Always abstract behind a `VectorRepository` Protocol so the backend is swappable."

**"How do you implement DI without Spring?"**
> "FastAPI `Depends()` for function-level injection. Singletons in `app.state` initialized in `lifespan()`. Override with `app.dependency_overrides[fn] = lambda: mock` in tests — same effect as `@MockBean`. Constructor injection in services makes all dependencies explicit."

**"How do you handle rate limits?"**
> "Three layers: SDK `max_retries=3` (handles 429 automatically), tenacity `wait_random_exponential` on top (jitter prevents thundering herd), and `asyncio.Semaphore(5)` to cap concurrency so rate limits are hit less often. Never retry `BadRequestError` (400) — it's a code bug."

**"How do you observe an AI service?"**
> "Structured JSON logs with token count, latency, and cost per call. Prometheus metrics: calls counter, latency histogram, token gauge — all labeled by model and status. Correlation IDs via `ContextVar` (async-safe MDC). `/health` checking Redis, vector store, LLM client. The AI-specific metric that matters most: cost per query — alert when it doubles."

**"How do you stream LLM responses?"**
> "Async generator yields tokens from `stream=True` response. FastAPI `StreamingResponse` wraps the generator and writes `data: {token}\n\n` SSE format. Set `X-Accel-Buffering: no` header to disable Nginx buffering. Accumulate tokens in the generator to save full response to DB after streaming — real-time UX plus complete audit log."

---

# Quick Java → Python Cheat Sheet

| Java | Python |
|---|---|
| `ArrayList<T>` | `list` |
| `HashMap<K,V>` | `dict` |
| `HashSet<T>` | `set` |
| `Optional<T>` | `Optional[T]` / `T \| None` |
| `instanceof` | `isinstance(obj, Type)` |
| `null` | `None` |
| `System.out.println()` | `print()` |
| `String.format("Hello %s", name)` | `f"Hello {name}"` |
| `str.equals(other)` | `str == other` |
| `@Data` (Lombok) | `@dataclass` |
| `@NotNull @Min @Max` | `Field(ge=0, le=100)` in Pydantic |
| `ObjectMapper.readValue()` | `Model.model_validate_json()` |
| `ObjectMapper.writeValueAsString()` | `model.model_dump_json()` |
| `@RestController + @PostMapping` | `@app.post("/path")` |
| `@RequestBody @Valid T body` | Pydantic model as FastAPI param |
| `@Autowired` | `Depends(factory_fn)` |
| `@Bean` singleton | `@lru_cache` factory or `app.state` |
| `@MockBean` in tests | `app.dependency_overrides[fn] = mock` |
| `@Async` | `async def` + `BackgroundTasks` |
| `CompletableFuture.allOf()` | `await asyncio.gather(...)` |
| `new Semaphore(5)` | `asyncio.Semaphore(5)` |
| `@Retryable(maxAttempts=3)` | `@retry(stop=stop_after_attempt(3))` |
| `MDC.put("key", val)` | `ContextVar.set(val)` |
| `@Scheduled(cron="...")` | APScheduler `CronTrigger` |
| `Flux<String>` (WebFlux) | `AsyncIterator[str]` / async generator |
| `Micrometer Counter` | `prometheus_client.Counter` |
| `Micrometer Timer` | `prometheus_client.Histogram` |
| Actuator `/health` | `@app.get("/health")` |
| Spring Batch `Job` | Celery task |
| `Pattern.compile()` | `re.compile()` at module level |
| `interface + implements` | `Protocol` (duck typing) |
