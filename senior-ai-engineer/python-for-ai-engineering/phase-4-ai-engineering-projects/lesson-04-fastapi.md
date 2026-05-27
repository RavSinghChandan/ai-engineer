# Python for AI Engineering — Phase 4
# Lesson 4: FastAPI — Async Endpoints, Request Models, Dependency Injection, Middleware

---

## 1. Intuition (Java Anchor)

Java: Spring Boot — `@RestController`, `@RequestBody`, `@Service`, `@Autowired`, `HandlerInterceptor`.
FastAPI is Spring Boot for Python — same architecture, much less boilerplate.

| Java Spring | FastAPI |
|---|---|
| `@RestController` + `@RequestMapping` | `@app.get("/path")` / `@app.post("/path")` |
| `@RequestBody @Valid UserRequest` | Pydantic model as function parameter |
| `@PathVariable` | `user_id: str` in function signature |
| `@RequestParam` | `q: str = Query(...)` |
| `@Service` / `@Component` | Function or class injected via `Depends` |
| `@Autowired` | `Depends(get_service)` |
| `HandlerInterceptor` | `@app.middleware("http")` |
| `@ControllerAdvice` + `@ExceptionHandler` | `@app.exception_handler(ExcType)` |
| `ResponseEntity<T>` | Return type hint + `response_model=` |
| `@Async` | `async def` endpoint |
| Spring Security filter | FastAPI dependency on every route |
| Swagger / Springdoc | Automatic at `/docs` — no config needed |

---

## 2. App Startup — Lifespan Pattern

```python
from fastapi import FastAPI
from contextlib import asynccontextmanager
from openai import AsyncOpenAI
import os

# Java: @Bean singleton initialized at startup
# FastAPI: lifespan context manager (replaces deprecated @app.on_event)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — runs once before first request (Java: @PostConstruct)
    app.state.llm_client = AsyncOpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=3,
        timeout=60.0,
    )
    app.state.vector_store = load_vector_store()   # load FAISS index from disk
    yield
    # Shutdown — runs on graceful stop (Java: @PreDestroy)
    # close connections, flush buffers, etc.

app = FastAPI(
    title="Bench Resource Optimizer",
    version="1.0.0",
    lifespan=lifespan,
)
```

---

## 3. Request and Response Models (Java: `@RequestBody` + `ResponseEntity`)

```python
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI()

# Request model (Java: @RequestBody @Valid class):
class CVAnalysisRequest(BaseModel):
    user_id: str = Field(min_length=1)
    cv_text: str = Field(min_length=50, max_length=50_000)
    target_role: Optional[str] = None

# Response model (Java: ResponseEntity<CVAnalysisResponse>):
class CVAnalysisResponse(BaseModel):
    user_id: str
    role: str
    match_percentage: int
    matched_skills: list[str]
    missing_skills: list[str]
    recommendation: str

# FastAPI validates request body automatically and returns 422 on error
# Java: @Valid triggers ConstraintViolationException → @ExceptionHandler returns 400

@app.post(
    "/analyze",
    response_model=CVAnalysisResponse,   # validates + filters response
    status_code=status.HTTP_200_OK,
)
async def analyze_cv(request: CVAnalysisRequest) -> CVAnalysisResponse:
    # request.user_id and request.cv_text are already validated
    result = await run_cv_analysis(request.cv_text, request.target_role)
    return CVAnalysisResponse(user_id=request.user_id, **result)

# Path variables (Java: @PathVariable):
@app.get("/users/{user_id}/profile", response_model=CVAnalysisResponse)
async def get_profile(user_id: str) -> CVAnalysisResponse:
    profile = await load_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return profile

# Query params (Java: @RequestParam):
from fastapi import Query

@app.get("/roles")
async def list_roles(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
) -> dict:
    return await fetch_roles(limit=limit, offset=offset, category=category)
```

---

## 4. Dependency Injection (Java: `@Autowired` / `@Inject`)

```python
# Java: @Autowired injects at class field level
# FastAPI: Depends() injects at function parameter level — same idea, different syntax

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Service class (Java: @Service):
class LLMService:
    def __init__(self):
        self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    async def complete(self, prompt: str) -> str:
        resp = await self._client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content

# Singleton provider (Java: @Bean with singleton scope):
_llm_service: LLMService | None = None

def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service

# Auth dependency (Java: Spring Security filter):
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    user = decode_jwt(token)   # raises if invalid
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Compose dependencies (Java: @Autowired multiple services):
@app.post("/analyze")
async def analyze(
    request: CVAnalysisRequest,
    current_user: dict = Depends(get_current_user),   # auth check
    llm: LLMService = Depends(get_llm_service),       # service injection
) -> CVAnalysisResponse:
    result = await llm.complete(f"Analyze CV: {request.cv_text}")
    return CVAnalysisResponse(user_id=current_user["sub"], ...)

# Role-based access (Java: @PreAuthorize("hasRole('ADMIN')")):
def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user

@app.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    await remove_user(user_id)
```

---

## 5. Middleware (Java: `HandlerInterceptor` / Filter)

```python
import time
import uuid
from fastapi import FastAPI, Request, Response

app = FastAPI()

# Middleware — runs around EVERY request (Java: HandlerInterceptor):
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next) -> Response:
    request_id = str(uuid.uuid4())[:8]
    start = time.perf_counter()

    # Pre-processing (Java: preHandle()):
    request.state.request_id = request_id

    response = await call_next(request)   # actual endpoint runs here

    # Post-processing (Java: afterCompletion()):
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"

    # Structured log (Java: MDC.put("requestId", requestId)):
    import logging
    logging.getLogger("request").info(
        "method=%s path=%s status=%d ms=%.1f req_id=%s",
        request.method, request.url.path, response.status_code, elapsed_ms, request_id,
    )
    return response

# CORS middleware (Java: CorsRegistry):
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # Angular dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 6. Exception Handling (Java: `@ControllerAdvice`)

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import ValidationError

app = FastAPI()

# Custom exception (Java: custom RuntimeException):
class CVParseError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

# Global handler (Java: @ExceptionHandler in @ControllerAdvice):
@app.exception_handler(CVParseError)
async def cv_parse_error_handler(request: Request, exc: CVParseError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": "CV_PARSE_ERROR", "detail": exc.message},
    )

@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": "VALIDATION_ERROR", "detail": exc.errors()},
    )

# Unhandled exceptions — catch-all (Java: @ExceptionHandler(Exception.class)):
@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging
    logging.getLogger(__name__).exception("Unhandled exception in %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "detail": "An unexpected error occurred"},
    )
```

---

## 7. File Upload (Java: `MultipartFile`)

```python
import tempfile
from fastapi import FastAPI, UploadFile, File, Depends

app = FastAPI()

# File upload (Java: @RequestParam("file") MultipartFile file):
@app.post("/upload-cv")
async def upload_cv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    # Validate file type
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    # Read into temp file (don't load entire file into memory for large uploads):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        text = extract_text_from_pdf(tmp.name)   # your PDF extractor

    return {"user_id": current_user["sub"], "chars_extracted": len(text)}
```

---

## 8. Background Tasks (Java: `@Async`)

```python
from fastapi import FastAPI, BackgroundTasks

app = FastAPI()

# Background task (Java: @Async method — fire and return immediately):
@app.post("/reindex")
async def trigger_reindex(
    background_tasks: BackgroundTasks,
    admin: dict = Depends(require_admin),
) -> dict:
    background_tasks.add_task(rebuild_vector_index)   # runs after response is sent
    return {"status": "reindex_started"}

async def rebuild_vector_index() -> None:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Starting vector index rebuild")
    # ... expensive embedding + FAISS rebuild
    logger.info("Vector index rebuild complete")
```

---

## 9. Interview Anchor

**"How do you structure a FastAPI service for a production AI application?"**

Say:
> "Same layering as Spring Boot. At the top: a `lifespan` context manager that initializes singletons — the LLM client, vector store, Redis connection — so they're not created per request. Routes use Pydantic models for request/response — FastAPI auto-generates 422 validation errors, same as Spring's `@Valid`. Dependency injection via `Depends` — one function per service, one function per auth level, composed at the route. Middleware for cross-cutting concerns: request ID, latency logging, CORS — analogous to Spring `HandlerInterceptor`. Global exception handlers in `@app.exception_handler` for `@ControllerAdvice` equivalence. The async model is crucial: every endpoint is `async def`, the LLM client is `AsyncOpenAI` — so while one request is waiting on the LLM, the event loop services other requests. FastAPI on Uvicorn with 4 workers gives better throughput on I/O-bound AI workloads than Spring MVC's thread-per-request model for the same hardware."

---

## 10. Quick Reference

```python
from fastapi import FastAPI, Depends, HTTPException, Query, status, BackgroundTasks
from fastapi import UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI()

# Route decorators
@app.get("/path")
@app.post("/path")
@app.put("/path/{id}")
@app.delete("/path/{id}")

# Path var, query param, request body
async def handler(
    user_id: str,                              # path variable
    q: str = Query(default=None),              # query param
    body: MyModel = ...,                       # request body (Pydantic)
): ...

# Response model
@app.post("/path", response_model=MyResponse, status_code=201)

# HTTPException
raise HTTPException(status_code=404, detail="not found")

# Dependency injection
def get_service() -> MyService: ...
async def endpoint(svc: MyService = Depends(get_service)): ...

# Middleware
@app.middleware("http")
async def my_middleware(request: Request, call_next): ...

# Exception handler
@app.exception_handler(MyException)
async def handler(request: Request, exc: MyException): ...

# Background task
def handler(tasks: BackgroundTasks):
    tasks.add_task(my_function, arg1, arg2)

# Java comparison
# @RestController + @GetMapping  → @app.get("/path")
# @RequestBody @Valid T body     → body: T (Pydantic model param)
# @PathVariable String id        → id: str in function signature
# @RequestParam String q         → q: str = Query(...)
# @Autowired MyService svc       → svc: MyService = Depends(get_service)
# HandlerInterceptor              → @app.middleware("http")
# @ExceptionHandler               → @app.exception_handler(...)
# @Async                          → async def + BackgroundTasks
```
