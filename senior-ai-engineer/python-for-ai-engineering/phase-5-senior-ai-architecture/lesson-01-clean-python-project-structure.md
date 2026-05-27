# Python for AI Engineering — Phase 5
# Lesson 1: Clean Python Project Structure

---

## 1. Intuition (Java Anchor)

Java Spring Boot project structure is standardized: `src/main/java/com/company/app/` with packages for `controller`, `service`, `repository`, `model`, `config`.
Python has no enforced structure — but a clean AI service follows the same layering principles.

| Java Spring Boot Layer | Python AI Service Layer |
|---|---|
| `controller/` — HTTP layer | `api/` or `routers/` — FastAPI routes |
| `service/` — business logic | `services/` — LLM, matching, storage |
| `repository/` — data access | `repositories/` — vector DB, file, Redis |
| `model/` — domain POJOs | `models/` — Pydantic models |
| `config/` — Spring `@Configuration` | `config/` — settings, env, constants |
| `exception/` — custom exceptions | `exceptions/` — domain error classes |
| `src/test/java/` | `tests/` |
| `pom.xml` | `pyproject.toml` / `requirements.txt` |
| `application.properties` | `.env` + `settings.py` (Pydantic) |

---

## 2. Recommended Project Layout

```
bench-resource-optimizer/
├── backend/
│   ├── api/                    # FastAPI routers (like Spring @RestController)
│   │   ├── __init__.py
│   │   ├── auth.py             # /auth routes
│   │   ├── candidates.py       # /candidates routes
│   │   └── roles.py            # /roles routes
│   │
│   ├── services/               # Business logic (like Spring @Service)
│   │   ├── __init__.py
│   │   ├── llm_service.py      # LLM client wrapper
│   │   ├── embedding_service.py
│   │   ├── matching_service.py
│   │   └── cv_parser.py
│   │
│   ├── repositories/           # Data access (like Spring @Repository)
│   │   ├── __init__.py
│   │   ├── vector_store.py     # FAISS / Pinecone
│   │   ├── profile_store.py    # JSON file / Redis
│   │   └── role_store.py
│   │
│   ├── models/                 # Pydantic models (like Spring @Entity / DTO)
│   │   ├── __init__.py
│   │   ├── requests.py         # API request bodies
│   │   ├── responses.py        # API response shapes
│   │   └── domain.py           # internal domain models
│   │
│   ├── config/                 # Config + settings
│   │   ├── __init__.py
│   │   └── settings.py         # Pydantic BaseSettings
│   │
│   ├── exceptions/             # Custom exceptions
│   │   └── __init__.py
│   │
│   ├── prompts/                # Prompt templates
│   │   ├── cv_analysis.txt
│   │   └── role_matching.txt
│   │
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_api/
│   │   ├── test_services/
│   │   └── test_repositories/
│   │
│   ├── main.py                 # FastAPI app + lifespan
│   ├── requirements.txt
│   ├── .env                    # local only — gitignored
│   ├── .env.example            # committed — shows required vars
│   └── Dockerfile
│
└── frontend/                   # Angular app
```

---

## 3. `main.py` — App Entry Point

```python
# main.py — equivalent to Spring Boot's @SpringBootApplication class
# Keep it thin: create app, register routers, configure middleware, define lifespan

from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

from api import auth, candidates, roles
from config.settings import get_settings
from services.llm_service import LLMService
from repositories.vector_store import VectorStore

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup (Java: @PostConstruct on @Configuration class)
    app.state.llm = LLMService(settings)
    app.state.vector_store = VectorStore.load(settings.data_dir)
    yield
    # Shutdown (Java: @PreDestroy)

app = FastAPI(title="Bench Resource Optimizer", lifespan=lifespan)

# Middleware
app.add_middleware(CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# Routers (Java: @Import or auto-scan)
app.include_router(auth.router,       prefix="/auth",       tags=["auth"])
app.include_router(candidates.router, prefix="/candidates", tags=["candidates"])
app.include_router(roles.router,      prefix="/roles",      tags=["roles"])
```

---

## 4. Router Pattern (Java: `@RestController`)

```python
# api/candidates.py
# Each router file = one Spring @RestController class

from fastapi import APIRouter, Depends, HTTPException, status
from models.requests import CVAnalysisRequest
from models.responses import CVAnalysisResponse
from services.matching_service import MatchingService
from api.auth import get_current_user   # shared auth dependency

router = APIRouter()

def get_matching_service() -> MatchingService:
    # In production: access from app.state or use a module-level singleton
    return MatchingService()

@router.post("/analyze", response_model=CVAnalysisResponse)
async def analyze_candidate(
    request: CVAnalysisRequest,
    current_user: dict = Depends(get_current_user),
    svc: MatchingService = Depends(get_matching_service),
) -> CVAnalysisResponse:
    result = await svc.analyze(request.cv_text, request.target_role)
    return CVAnalysisResponse(user_id=current_user["sub"], **result)
```

---

## 5. Settings — Centralized Config (Java: `@ConfigurationProperties`)

```python
# config/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

class Settings(BaseSettings):
    # Required — startup fails if missing (Java: @Value with no default)
    jwt_secret: str
    openai_api_key: str

    # Optional with defaults
    llm_model: str = "gpt-4o"
    llm_max_retries: int = 3
    llm_timeout: float = 60.0
    max_concurrent_llm_calls: int = 5
    log_level: str = "INFO"
    data_dir: Path = Path("data")
    allowed_origins: list[str] = ["http://localhost:4200"]

    model_config = SettingsConfigDict(
        env_file=".env",          # load from .env file
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

# Singleton (Java: @Bean with singleton scope)
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

# Usage in any module:
# from config.settings import get_settings
# settings = get_settings()
# settings.openai_api_key
```

---

## 6. Exception Hierarchy (Java: Custom Exception Classes)

```python
# exceptions/__init__.py
# Java: RuntimeException hierarchy — ServiceException, NotFoundException, etc.

class AppError(Exception):
    """Base exception for all application errors."""
    def __init__(self, message: str, code: str = "APP_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code

class CVParseError(AppError):
    def __init__(self, message: str):
        super().__init__(message, code="CV_PARSE_ERROR")

class LLMError(AppError):
    def __init__(self, message: str):
        super().__init__(message, code="LLM_ERROR")

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} '{id}' not found", code="NOT_FOUND")

class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        super().__init__(f"Validation failed for '{field}': {message}", code="VALIDATION_ERROR")

# Register handlers in main.py:
# @app.exception_handler(NotFoundError)
# async def not_found_handler(req, exc):
#     return JSONResponse(status_code=404, content={"error": exc.code, "detail": exc.message})
```

---

## 7. `__init__.py` — Public Interface (Java: `package-info.java`)

```python
# models/__init__.py
# Export only the public surface — Java: control what's in the package API

from models.requests import CVAnalysisRequest, RoleMatchRequest
from models.responses import CVAnalysisResponse, RoleMatchResponse
from models.domain import CVProfile, RoleDefinition

__all__ = [
    "CVAnalysisRequest", "RoleMatchRequest",
    "CVAnalysisResponse", "RoleMatchResponse",
    "CVProfile", "RoleDefinition",
]

# Consumers import from models, not models.requests:
# from models import CVAnalysisRequest, CVProfile
# This means internal file structure can change without breaking imports.
```

---

## 8. Interview Anchor

**"How do you structure a Python AI service for maintainability?"**

Say:
> "Same layered architecture as Spring Boot but with Python conventions. `api/` for FastAPI routers — one file per domain, each exports an `APIRouter`, included into the main app with a prefix. `services/` for business logic — stateless classes that take config at construction, accept Pydantic models, return Pydantic models. `repositories/` for data access — one class per backing store: vector DB, Redis, file. `models/` for Pydantic request/response/domain models — all in one place so the team knows where the data contracts are. `config/settings.py` with Pydantic `BaseSettings` — raises at startup if required env vars are missing, same guarantee as Spring's `@ConfigurationProperties` with `@NotNull`. Custom exceptions in `exceptions/` with a hierarchy under a single `AppError` base, mapped to HTTP status codes in `@app.exception_handler` handlers. `main.py` is thin — just wires the app together, registers routers and middleware, initializes singletons in the `lifespan` context manager."

---

## 9. Quick Reference

```
Project layout
backend/
  api/          ← FastAPI routers (@RestController)
  services/     ← business logic (@Service)
  repositories/ ← data access (@Repository)
  models/       ← Pydantic models (@Entity / DTO)
  config/       ← settings.py (BaseSettings)
  exceptions/   ← AppError hierarchy
  prompts/      ← .txt / .j2 prompt templates
  tests/        ← conftest + test modules
  main.py       ← FastAPI app entry point

# main.py pattern
app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, ...)
app.include_router(auth.router, prefix="/auth")

# Settings
class Settings(BaseSettings):
    jwt_secret: str          # required — no default
    llm_model: str = "gpt-4o"  # optional with default
    model_config = SettingsConfigDict(env_file=".env")

@lru_cache(maxsize=1)
def get_settings() -> Settings: return Settings()

# Exception hierarchy
class AppError(Exception): pass
class NotFoundError(AppError): pass
class LLMError(AppError): pass

# __init__.py exports
from models.requests import CVAnalysisRequest
__all__ = ["CVAnalysisRequest"]

# Java comparison
# api/           → controller/
# services/      → service/
# repositories/  → repository/
# models/        → model/ (entity + DTO)
# config/        → config/ (@Configuration)
# exceptions/    → exception/ (custom RuntimeExceptions)
# main.py        → @SpringBootApplication class
# BaseSettings   → @ConfigurationProperties
# lru_cache      → @Bean singleton scope
```
