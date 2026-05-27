# Python for AI Engineering — Phase 5
# Lesson 2: Dependency Injection in Python

---

## 1. Intuition (Java Anchor)

Java Spring: `@Autowired`, `@Component`, `@Service`, `@Bean` — the container manages object lifecycle and wires dependencies.
Python has no built-in DI container. Two patterns replace it:

1. **FastAPI `Depends()`** — function-parameter injection for HTTP handlers
2. **Module-level singletons** — initialized at startup, accessed as module globals or via `app.state`

| Java Spring DI | Python Equivalent |
|---|---|
| `@Autowired` on field | `Depends(get_service)` on route parameter |
| `@Bean` method | Factory function: `def get_client() -> OpenAI` |
| `@Component` / `@Service` | Plain class, instantiated in `lifespan` |
| Singleton scope (default) | Module-level variable or `@lru_cache` |
| Prototype scope | Create new instance inside `Depends` function |
| `@Configuration` class | `config/settings.py` + `lifespan()` |
| `@Conditional` / `@Profile` | `os.getenv("ENV")` check in factory |
| `ApplicationContext.getBean()` | `request.app.state.my_service` |
| Constructor injection | `__init__(self, settings: Settings)` |

---

## 2. FastAPI `Depends()` — Injection at Route Level

```python
# Java: @Autowired injects at class field level — once per object lifetime
# FastAPI Depends: injects at function call level — re-evaluated per request
# (unless you use yield or cache the result)

from fastapi import FastAPI, Depends, Request
from openai import AsyncOpenAI
from config.settings import get_settings, Settings
import os

app = FastAPI()

# Dependency provider functions (Java: @Bean factory methods):

def get_settings_dep() -> Settings:
    return get_settings()   # @lru_cache singleton — same object every call

def get_llm_client(settings: Settings = Depends(get_settings_dep)) -> AsyncOpenAI:
    # This creates a NEW client per request — BAD for production
    return AsyncOpenAI(api_key=settings.openai_api_key)
    # Better: return a singleton (shown below)

# Inject into route:
@app.post("/analyze")
async def analyze(
    body: CVAnalysisRequest,
    settings: Settings = Depends(get_settings_dep),
    client: AsyncOpenAI = Depends(get_llm_client),
) -> CVAnalysisResponse:
    ...

# Composing dependencies (Java: @Autowired chains):
def get_matching_service(
    client: AsyncOpenAI = Depends(get_llm_client),
    settings: Settings = Depends(get_settings_dep),
) -> MatchingService:
    return MatchingService(client, settings)

@app.post("/match")
async def match(
    body: MatchRequest,
    svc: MatchingService = Depends(get_matching_service),
    user: dict = Depends(get_current_user),
) -> MatchResponse:
    ...
```

---

## 3. Singleton Services via `app.state` (Recommended for Production)

```python
# Creating one LLM client per request wastes connections and ignores max_retries config.
# Better: initialize singletons at startup, store in app.state, inject via Depends.
# Java: @Bean with singleton scope — created once, reused everywhere.

from fastapi import FastAPI, Depends, Request
from contextlib import asynccontextmanager
from services.llm_service import LLMService
from repositories.vector_store import VectorStore
from config.settings import get_settings

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create once — Java: ApplicationContext instantiates @Bean singletons
    app.state.llm = LLMService(settings)
    app.state.vector_store = VectorStore(settings.data_dir)
    yield
    # Cleanup on shutdown

app = FastAPI(lifespan=lifespan)

# Dependency extractors — pull from app.state (Java: ApplicationContext.getBean()):
def get_llm(request: Request) -> LLMService:
    return request.app.state.llm

def get_vector_store(request: Request) -> VectorStore:
    return request.app.state.vector_store

# Routes inject via Depends — clean, testable:
@app.post("/analyze")
async def analyze(
    body: CVAnalysisRequest,
    llm: LLMService = Depends(get_llm),
    vs: VectorStore = Depends(get_vector_store),
) -> CVAnalysisResponse:
    chunks = vs.search(body.cv_text)
    result = await llm.complete(build_prompt(body.cv_text, chunks))
    return CVAnalysisResponse(...)
```

---

## 4. `@lru_cache` Singleton Pattern

```python
# Alternative to app.state for services that don't need async init.
# @lru_cache(maxsize=1) makes the factory run exactly once — singleton.
# Java: @Bean with default singleton scope.

from functools import lru_cache
from openai import AsyncOpenAI
from config.settings import get_settings

@lru_cache(maxsize=1)
def get_llm_client() -> AsyncOpenAI:
    s = get_settings()
    return AsyncOpenAI(
        api_key=s.openai_api_key,
        max_retries=s.llm_max_retries,
        timeout=s.llm_timeout,
    )

@lru_cache(maxsize=1)
def get_matching_service() -> MatchingService:
    return MatchingService(client=get_llm_client(), settings=get_settings())

# In routes:
def _get_matching_service() -> MatchingService:
    return get_matching_service()   # thin wrapper so FastAPI Depends works

@app.post("/match")
async def match(svc: MatchingService = Depends(_get_matching_service)):
    ...

# Reset singleton in tests (Java: @MockBean replaces the bean):
def reset_singletons():
    get_llm_client.cache_clear()
    get_matching_service.cache_clear()
```

---

## 5. Yield Dependencies — Setup/Teardown

```python
# Depends with yield: setup before, teardown after each request.
# Java: @Bean with prototype scope + try-finally, or @RequestScope.
# Use for: DB connections, temp files, request-scoped loggers.

import logging
import uuid
from fastapi import Depends

def get_request_logger() -> logging.Logger:
    """Creates a logger with a unique request ID — teardown on request end."""
    request_id = str(uuid.uuid4())[:8]
    logger = logging.getLogger(f"request.{request_id}")
    logger.info("Request started")
    yield logger                          # request handler runs here
    logger.info("Request completed")      # runs after response is sent

@app.post("/analyze")
async def analyze(
    body: CVAnalysisRequest,
    log: logging.Logger = Depends(get_request_logger),
) -> CVAnalysisResponse:
    log.info("Analyzing CV for user %s", body.user_id)
    ...
```

---

## 6. Testability — Overriding Dependencies

```python
# The main benefit of Depends: easy to override in tests.
# Java: @MockBean replaces a @Bean with a mock.
# FastAPI: app.dependency_overrides replaces any Depends function.

from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

# In test file:
def test_analyze_endpoint():
    mock_llm = MagicMock(spec=LLMService)
    mock_llm.complete = AsyncMock(return_value='{"match_percentage": 85}')

    # Override the real service with the mock:
    app.dependency_overrides[get_llm] = lambda: mock_llm

    client = TestClient(app)
    response = client.post("/analyze", json={"cv_text": "Python developer...", "target_role": "Python Dev"})

    assert response.status_code == 200
    mock_llm.complete.assert_called_once()

    # Restore original dependencies:
    app.dependency_overrides.clear()

# Fixture pattern (cleaner):
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def test_client(mock_llm_service):
    app.dependency_overrides[get_llm] = lambda: mock_llm_service
    yield TestClient(app)
    app.dependency_overrides.clear()
```

---

## 7. Constructor Injection in Services

```python
# Services use constructor injection — same as Spring @Autowired on constructor.
# This makes the dependencies explicit and testable without DI magic.

from openai import AsyncOpenAI
from config.settings import Settings

class MatchingService:
    """
    Constructor injection — Java: @Autowired constructor.
    All dependencies declared in __init__ → visible, mockable.
    """
    def __init__(self, client: AsyncOpenAI, settings: Settings):
        self._client = client
        self._model = settings.llm_model
        self._max_retries = settings.llm_max_retries

    async def analyze(self, cv_text: str, target_role: str) -> dict:
        prompt = build_prompt(cv_text, target_role)
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
        )
        return parse_response(response.choices[0].message.content)

# Test without FastAPI DI — just construct with mocks:
def test_matching_service():
    mock_client = MagicMock(spec=AsyncOpenAI)
    mock_client.chat.completions.create = AsyncMock(...)
    settings = Settings(jwt_secret="x" * 32, openai_api_key="sk-test")

    svc = MatchingService(client=mock_client, settings=settings)
    result = asyncio.run(svc.analyze("Python 5yr", "Python Dev"))
    assert result["match_percentage"] >= 0
```

---

## 8. Interview Anchor

**"How do you implement dependency injection in a Python FastAPI service without Spring?"**

Say:
> "Two mechanisms. For stateless, request-scoped dependencies — auth token parsing, request logger — I use FastAPI's `Depends()` directly in route signatures. The DI framework resolves them before the handler runs, and `yield`-based dependencies get teardown after. For stateful singletons — the LLM client, vector store, Redis connection — I initialize them in the `lifespan` context manager at startup and store them in `app.state`. Dependency extractors like `def get_llm(request: Request) -> LLMService: return request.app.state.llm` make them injectable via `Depends`. The key advantage over Spring: `app.dependency_overrides` lets me replace any `Depends` function with a mock for the duration of a test — no `@MockBean` annotation needed. For services themselves, I use explicit constructor injection so the dependencies are visible in the `__init__` signature — same benefit as Spring constructor injection, no magic field scanning."

---

## 9. Quick Reference

```python
# Depends — function-level injection
def get_service(settings: Settings = Depends(get_settings)) -> MyService:
    return MyService(settings)

@app.get("/path")
async def handler(svc: MyService = Depends(get_service)): ...

# Singleton via app.state (for stateful services)
@asynccontextmanager
async def lifespan(app):
    app.state.svc = MyService(get_settings())
    yield

def get_svc(request: Request) -> MyService:
    return request.app.state.svc

# Singleton via lru_cache (for stateless services)
@lru_cache(maxsize=1)
def get_my_service() -> MyService: return MyService(get_settings())

# Yield dependency (setup + teardown)
def get_db():
    db = connect()
    try: yield db
    finally: db.close()

# Override in tests
app.dependency_overrides[get_service] = lambda: mock_service
# restore: app.dependency_overrides.clear()

# Constructor injection in services
class MyService:
    def __init__(self, client: AsyncOpenAI, settings: Settings): ...

# Java comparison
# @Autowired field      → Depends(factory_fn) on route param
# @Bean singleton       → @lru_cache factory or app.state
# @Bean prototype       → create instance inside Depends fn
# @MockBean in test     → app.dependency_overrides[fn] = lambda: mock
# @PostConstruct        → code in lifespan() before yield
# @PreDestroy           → code in lifespan() after yield
# ApplicationContext    → app.state (stores initialized objects)
```
