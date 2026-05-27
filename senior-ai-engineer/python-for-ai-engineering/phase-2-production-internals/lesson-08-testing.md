# Python for AI Engineering — Phase 2
# Lesson 8: Testing

---

## 1. Intuition (Java Anchor)

Java: JUnit 5 + Mockito + Spring Test.
Python: pytest + unittest.mock + FastAPI TestClient.

| Java | Python |
|---|---|
| JUnit 5 `@Test` | pytest `test_` function / method |
| `@BeforeEach` | `@pytest.fixture` (function scope) |
| `@BeforeAll` | `@pytest.fixture(scope="module")` |
| `assertEquals(expected, actual)` | `assert actual == expected` |
| `assertThrows(Exception.class, ...)` | `with pytest.raises(Exception):` |
| Mockito `mock(Service.class)` | `MagicMock()` |
| `when(mock.method()).thenReturn(val)` | `mock.method.return_value = val` |
| `verify(mock).method(arg)` | `mock.method.assert_called_with(arg)` |
| `@MockBean` in Spring Test | `@pytest.fixture` with mock injection |
| `@ParameterizedTest` | `@pytest.mark.parametrize` |

---

## 2. pytest Basics (Java: JUnit 5)

```python
# Java: @Test void testGreet() { assertEquals("Hello Ravi", greet("Ravi")); }
# Python: function name starts with test_, plain assert

# test_greeting.py
def test_greet_returns_hello_name():
    result = greet("Ravi")
    assert result == "Hello Ravi"

def test_greet_empty_name_raises():
    with pytest.raises(ValueError):
        greet("")

# Run:
# pytest                     → run all tests
# pytest tests/test_greeting.py   → run one file
# pytest -v                  → verbose output
# pytest -k "test_greet"     → run tests matching pattern
# pytest --tb=short          → shorter traceback

# Class grouping (Java: @Nested inner class):
class TestGreeting:
    def test_basic(self):
        assert greet("Ravi") == "Hello Ravi"

    def test_empty(self):
        with pytest.raises(ValueError):
            greet("")
```

---

## 3. Fixtures (Java: `@BeforeEach` / `@BeforeAll`)

```python
import pytest

# Function-scoped fixture — runs before EACH test (Java: @BeforeEach)
@pytest.fixture
def llm_client():
    """Creates a fresh mock LLM client for each test."""
    from unittest.mock import MagicMock
    client = MagicMock()
    client.invoke.return_value = "mocked response"
    return client

# Module-scoped fixture — runs ONCE per module (Java: @BeforeAll)
@pytest.fixture(scope="module")
def db_connection():
    conn = create_test_db()
    yield conn        # 'yield' = setup + teardown
    conn.close()      # teardown — runs after all tests in module

# Session-scoped — once per test run
@pytest.fixture(scope="session")
def test_config():
    return {"jwt_secret": "test-secret", "model": "gpt-4o-mini"}

# Using fixtures — just declare as parameter (Java: @Autowired in test):
def test_pipeline_calls_llm(llm_client):
    service = RAGService(llm=llm_client)
    result = service.query("What is Python?")
    assert result == "mocked response"
    llm_client.invoke.assert_called_once()   # verify it was called

# conftest.py — shared fixtures available to all tests in directory
# (Java: @TestConfiguration class in shared test package)
```

---

## 4. Mocking (Java: Mockito)

```python
from unittest.mock import MagicMock, patch, AsyncMock

# MagicMock — like Mockito.mock()
mock_llm = MagicMock()

# Set return value — like Mockito.when().thenReturn()
mock_llm.invoke.return_value = "mocked answer"

# Call it:
result = mock_llm.invoke("some prompt")
assert result == "mocked answer"

# Verify calls — like Mockito.verify()
mock_llm.invoke.assert_called_once_with("some prompt")
mock_llm.invoke.assert_called_once()
mock_llm.invoke.assert_not_called()
mock_llm.invoke.call_count   # number of calls

# Side effects (raise exceptions or return different values each call):
mock_llm.invoke.side_effect = [
    "first response",     # first call returns this
    "second response",    # second call returns this
    RateLimitError("limit"),  # third call raises this
]

# AsyncMock — for async functions (Java: no equivalent — Mockito works sync)
mock_async_llm = AsyncMock()
mock_async_llm.invoke.return_value = "async mocked response"
result = await mock_async_llm.invoke("prompt")
```

---

## 5. `patch` — Monkey Patching (Java: `@MockBean` in Spring)

```python
from unittest.mock import patch

# patch replaces an object in the module under test for the duration of the test
# Java: @MockBean replaces Spring bean with mock

# Method 1: as context manager
def test_call_llm_uses_correct_model():
    with patch("agents.cv_parser.openai_client") as mock_client:
        mock_client.chat.completions.create.return_value.choices[0].message.content = "test"
        result = parse_cv("some CV text")
        assert result is not None

# Method 2: as decorator (cleaner for whole test)
@patch("agents.cv_parser.openai_client")
def test_cv_parser(mock_client):
    mock_client.invoke.return_value = '{"name": "Ravi", "skills": ["Python"]}'
    result = parse_cv("CV text")
    assert result["name"] == "Ravi"

# Method 3: patch os.getenv (patch environment for config tests)
@patch.dict("os.environ", {
    "JWT_SECRET": "test-secret-32-chars-long-abc",
    "DEEPSEEK_API_KEY": "test-key",
    "ADMIN_PASSWORD": "test-admin-pass",
})
def test_settings_load_correctly():
    settings = Settings()
    assert settings.log_level == "INFO"    # default
    assert settings.jwt_secret == "test-secret-32-chars-long-abc"
```

---

## 6. FastAPI TestClient (Java: MockMvc / RestAssured)

```python
# Java MockMvc:
# mockMvc.perform(post("/auth/login").content(json)).andExpect(status().isOk())

# Python FastAPI TestClient (uses httpx under the hood):
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_login_returns_token():
    response = client.post("/auth/login", json={
        "user_id": "admin",
        "password": "test-admin-pass"
    })
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"

def test_protected_endpoint_requires_auth():
    response = client.get("/api/profile")
    assert response.status_code == 401

def test_protected_endpoint_with_token(admin_headers):
    response = client.get("/api/profile", headers=admin_headers)
    assert response.status_code == 200

# Fixture for auth headers:
@pytest.fixture
def admin_headers():
    response = client.post("/auth/login", json={
        "user_id": "admin", "password": "test-admin-pass"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

---

## 7. Async Tests (Java: no direct equivalent — async testing is manual)

```python
# pytest-asyncio — test async functions
# pip install pytest-asyncio

# pytest.ini or pyproject.toml:
# [pytest]
# asyncio_mode = auto    # makes all async test functions run with asyncio automatically

import pytest

@pytest.mark.asyncio   # not needed if asyncio_mode=auto
async def test_async_llm_call():
    result = await call_llm_async("What is Python?")
    assert isinstance(result, str)
    assert len(result) > 0

# Async fixture:
@pytest.fixture
async def async_db():
    async with aiosqlite.connect(":memory:") as db:
        await init_db(db)
        yield db
        # cleanup happens after yield

async def test_save_and_retrieve(async_db):
    await save_user(async_db, "ravi", "user")
    user = await get_user(async_db, "ravi")
    assert user["role"] == "user"
```

---

## 8. Parametrize (Java: `@ParameterizedTest`)

```python
# Java: @ParameterizedTest @MethodSource("provideArgs") void test(String input, String expected)
# Python: @pytest.mark.parametrize

import pytest

@pytest.mark.parametrize("score,expected_level", [
    (95, "high"),
    (75, "medium"),
    (45, "low"),
    (0,  "low"),
])
def test_readiness_level(score, expected_level):
    assert calculate_readiness_level(score) == expected_level

# Multiple parameters:
@pytest.mark.parametrize("provider,model", [
    ("openai", "gpt-4o"),
    ("anthropic", "claude-sonnet-4-6"),
    ("deepseek", "deepseek-chat"),
])
def test_supported_models(provider, model):
    client = create_client(provider, model)
    assert client.model == model
```

---

## 9. AI Engineering Test Patterns

```python
# Pattern 1: Mock LLM in all API tests — never hit real API in CI
@pytest.fixture(scope="module")
def client():
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = json.dumps({
        "name": "Ravi Singh",
        "skills": ["Python", "FastAPI"],
        "experience_years": 5
    })

    with patch("main._llm", mock_llm), \
         patch("main.init_db", new=AsyncMock()), \
         patch("main.build_vector_store", return_value=MagicMock()):
        from main import app
        yield TestClient(app)

# Pattern 2: Test guardrails with edge cases
@pytest.mark.parametrize("bad_input", [
    "",
    " ",
    "hi",
    "a" * 10,   # too short
])
def test_cv_validation_rejects_bad_input(bad_input):
    with pytest.raises(ValidationError):
        validate_cv_text(bad_input)

# Pattern 3: Test retry logic with side effects
def test_llm_retries_on_rate_limit():
    mock_llm = MagicMock()
    mock_llm.invoke.side_effect = [
        RateLimitError("limit"),     # first call fails
        RateLimitError("limit"),     # second call fails
        "success",                   # third call succeeds
    ]
    result = call_with_retry(mock_llm.invoke, "prompt", max_retries=3)
    assert result == "success"
    assert mock_llm.invoke.call_count == 3
```

---

## 10. Interview Anchor

**"How do you test AI pipelines that call LLMs — without paying for API calls in CI?"**

Say:
> "Mock at the boundary. I never let tests hit real LLM APIs — that costs money, is slow, and is non-deterministic. I use `unittest.mock.patch` to replace the OpenAI client with a `MagicMock` that returns a pre-set JSON string. The patch is applied at module level in a `scope='module'` fixture so all tests in the file share one setup. For async LLM calls I use `AsyncMock` — same API as `MagicMock` but awaitable. For FastAPI endpoints I use `TestClient` — same as Java's `MockMvc`. For the guardrail and retry logic I use `side_effect` lists to simulate rate limit errors on first two calls and success on the third. This gives me 100% coverage of error paths without any real API calls."

---

## 11. Quick Reference

```python
# Run tests
pytest                           # all tests
pytest tests/test_api.py         # one file
pytest -v -k "test_login"        # verbose, filter by name
pytest --tb=short                # shorter traceback

# Assert (Java: assertEquals)
assert value == expected
assert value is not None
assert "key" in my_dict

# Expect exception (Java: assertThrows)
with pytest.raises(ValueError):
    bad_fn()
with pytest.raises(ValueError, match="must be positive"):
    bad_fn(-1)

# Fixture
@pytest.fixture
def resource():
    r = create()
    yield r          # test runs here
    r.cleanup()      # teardown

# Mock (Java: Mockito.mock())
mock = MagicMock()
mock.method.return_value = "value"
mock.method.side_effect = Exception("boom")
mock.method.assert_called_once_with(arg)

# Patch (Java: @MockBean)
with patch("module.ClassName") as mock:
    mock.method.return_value = "val"
    result = function_under_test()

@patch("module.fn", return_value="val")
def test_thing(mock_fn): ...

# Parametrize (Java: @ParameterizedTest)
@pytest.mark.parametrize("input,expected", [(1, 2), (3, 6)])
def test_double(input, expected):
    assert double(input) == expected

# Async test
@pytest.mark.asyncio
async def test_async_fn():
    result = await async_fn()
    assert result == expected
```
