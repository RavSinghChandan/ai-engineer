# Python for AI Engineering — Phase 2
# Lesson 4: Exceptions + Error Design

---

## 1. Intuition (Java Anchor)

Java distinguishes **checked exceptions** (must declare or catch) vs **unchecked exceptions** (RuntimeException — optional).
Python has **only unchecked exceptions** — you never declare `throws` in a method signature.

Everything else maps cleanly:

| Java | Python |
|---|---|
| `try { } catch (Exception e) { }` | `try: ... except Exception as e:` |
| `finally { }` | `finally:` |
| `throw new Exception()` | `raise Exception()` |
| `throws IOException` | (no equivalent — use docstring) |
| Custom: `class MyEx extends RuntimeException` | `class MyError(Exception):` |
| Multi-catch: `catch (A \| B e)` | `except (A, B) as e:` |

---

## 2. try / except / else / finally

```python
# Java:
# try {
#     result = callLLM(prompt);
# } catch (APIException e) {
#     log.error(e);
#     throw new ServiceException(e);
# } finally {
#     closeConnection();
# }

# Python:
try:
    result = call_llm(prompt)
except APIRateLimitError as e:
    logger.error(f"Rate limit hit: {e}")
    raise ServiceError("LLM temporarily unavailable") from e
except TimeoutError as e:
    logger.warning(f"LLM timeout: {e}")
    return "Request timed out. Please retry."
except Exception as e:
    logger.exception(f"Unexpected error: {e}")   # logs full traceback
    raise
finally:
    release_connection()   # always runs — like Java finally

# 'else' block — runs only if NO exception was raised (no Java equivalent)
try:
    result = call_llm(prompt)
except Exception as e:
    handle_error(e)
else:
    log_success(result)    # only if try succeeded
finally:
    cleanup()              # always
```

---

## 3. Exception Hierarchy (Java: Throwable → Exception → RuntimeException)

```python
# Python hierarchy:
# BaseException
#   ├── SystemExit          — sys.exit() — don't catch
#   ├── KeyboardInterrupt   — Ctrl+C — don't catch
#   └── Exception           — catch THIS in production code
#         ├── ValueError      — bad value (Java: IllegalArgumentException)
#         ├── TypeError       — wrong type (Java: ClassCastException)
#         ├── KeyError        — dict key missing (Java: NoSuchElementException)
#         ├── IndexError      — list index out of range (Java: IndexOutOfBoundsException)
#         ├── AttributeError  — attribute missing (Java: NullPointerException-ish)
#         ├── FileNotFoundError — (Java: IOException)
#         ├── RuntimeError    — generic runtime error
#         └── NotImplementedError — abstract method not overridden (Java: UnsupportedOperationException)

# NEVER catch BaseException or bare except: — you'll swallow SystemExit and Ctrl+C
try:
    pass
except:            # WRONG — catches everything including SystemExit
    pass

try:
    pass
except Exception:  # CORRECT — catches all user-land exceptions
    pass
```

---

## 4. Custom Exceptions (Java: Custom RuntimeException subclass)

```python
# Java:
# public class LLMError extends RuntimeException {
#     private final int statusCode;
#     public LLMError(String msg, int code) { super(msg); this.statusCode = code; }
# }

# Python:
class AIEngineerError(Exception):
    """Base exception for all AI engineering errors."""
    pass

class LLMError(AIEngineerError):
    """LLM API call failed."""
    def __init__(self, message: str, status_code: int = 500, provider: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider

class RateLimitError(LLMError):
    """LLM rate limit exceeded — retry after backoff."""
    pass

class ContextLengthError(LLMError):
    """Prompt exceeds model's context window."""
    def __init__(self, message: str, token_count: int, max_tokens: int):
        super().__init__(message)
        self.token_count = token_count
        self.max_tokens = max_tokens

class RetrievalError(AIEngineerError):
    """Vector DB search failed."""
    pass

class GuardrailError(AIEngineerError):
    """Content failed safety or quality guardrail."""
    def __init__(self, message: str, guardrail_name: str, score: float):
        super().__init__(message)
        self.guardrail_name = guardrail_name
        self.score = score

# Usage — catch specific, re-raise as generic:
try:
    response = openai.call(prompt)
except openai.RateLimitError as e:
    raise RateLimitError(str(e), status_code=429, provider="openai") from e
except openai.BadRequestError as e:
    raise LLMError(str(e), status_code=400, provider="openai") from e
```

---

## 5. Exception Chaining — `raise ... from` (Java: `initCause`)

```python
# Java: throw new ServiceException("msg", originalException);
# Python: raise NewError("msg") from original_error

# WHY: preserves the original traceback for debugging

try:
    result = vector_db.search(query)
except ConnectionError as e:
    # Chain: ServiceError caused by ConnectionError
    raise RetrievalError("Vector DB unavailable") from e
    # Traceback shows BOTH errors: "During handling of the above exception, another occurred"

# Suppress chaining (rarely needed):
raise NewError("msg") from None   # hides original — only do this if original is noise
```

---

## 6. Fail-Fast Design (Java: Guard Clauses)

```python
# Java pattern: validate inputs at top, throw early, avoid deep nesting
# Python: same pattern — called "guard clauses" or "fail fast"

# BAD — deeply nested:
def process_cv(text: str, user_id: str) -> dict:
    if text:
        if len(text) > 100:
            if user_id:
                result = parse(text)
                if result:
                    return result
    return {}

# GOOD — fail fast, flat:
def process_cv(text: str, user_id: str) -> dict:
    if not text:
        raise ValueError("CV text cannot be empty")
    if len(text) < 100:
        raise ValueError(f"CV too short: {len(text)} chars (minimum 100)")
    if not user_id:
        raise ValueError("user_id is required")

    result = parse(text)
    if not result:
        raise RuntimeError("CV parsing returned empty result")
    return result

# The Zen: "Flat is better than nested"
```

---

## 7. Retry Patterns with Exception Handling

```python
import time

def call_llm_with_retry(
    prompt: str,
    max_retries: int = 3,
    base_delay: float = 1.0,
) -> str:
    last_error = None

    for attempt in range(max_retries):
        try:
            return call_llm(prompt)

        except RateLimitError as e:
            # Retry with exponential backoff — expected error
            last_error = e
            delay = base_delay * (2 ** attempt)
            logger.warning(f"Rate limit on attempt {attempt+1}, retrying in {delay}s")
            time.sleep(delay)

        except ContextLengthError:
            # Don't retry — truncate the prompt instead
            truncated = prompt[:int(len(prompt) * 0.8)]
            return call_llm(truncated)

        except LLMError as e:
            # Don't retry on permanent errors (400, auth failures)
            if e.status_code in (400, 401, 403):
                raise

            last_error = e
            if attempt < max_retries - 1:
                time.sleep(base_delay)

    raise last_error   # exhausted retries

# Java: @Retryable(maxAttempts=3, backoff=@Backoff(delay=1000, multiplier=2))
# Python: explicit — you see exactly what retries and why
```

---

## 8. Context Manager for Error Handling

```python
from contextlib import contextmanager

@contextmanager
def handle_llm_errors(operation: str):
    """Wrap LLM calls with consistent error handling and logging."""
    try:
        yield
    except RateLimitError as e:
        logger.warning(f"{operation} rate limited: {e}")
        raise
    except LLMError as e:
        logger.error(f"{operation} failed [HTTP {e.status_code}]: {e}")
        raise
    except Exception as e:
        logger.exception(f"{operation} unexpected error: {e}")
        raise RuntimeError(f"{operation} failed unexpectedly") from e

# Usage:
with handle_llm_errors("parse_cv"):
    profile = parse_cv(cv_text)

with handle_llm_errors("map_role"):
    mapping = map_role(profile, target_role)
```

---

## 9. AI Engineering Error Hierarchy in Production

```python
# Real production error hierarchy for an AI service:

class BenchOptimizerError(Exception):
    """Root exception for all application errors."""

# Layer 1: Input validation
class ValidationError(BenchOptimizerError):
    pass

class CVTooShortError(ValidationError):
    pass

class UnsupportedFileTypeError(ValidationError):
    pass

# Layer 2: LLM / AI errors
class LLMError(BenchOptimizerError):
    def __init__(self, msg, provider="", status_code=500):
        super().__init__(msg)
        self.provider = provider
        self.status_code = status_code

class RateLimitError(LLMError): pass
class ContextLengthError(LLMError): pass
class HallucinationDetectedError(LLMError): pass

# Layer 3: Infrastructure
class InfraError(BenchOptimizerError): pass
class VectorDBError(InfraError): pass
class CacheError(InfraError): pass

# FastAPI handler — map to HTTP status codes:
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ValidationError)
async def validation_handler(req: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"error": str(exc)})

@app.exception_handler(RateLimitError)
async def rate_limit_handler(req: Request, exc: RateLimitError):
    return JSONResponse(status_code=429, content={"error": "Rate limited. Retry later."})

@app.exception_handler(BenchOptimizerError)
async def general_handler(req: Request, exc: BenchOptimizerError):
    return JSONResponse(status_code=500, content={"error": "Internal error"})
```

---

## 10. Interview Anchor

**"How do you design error handling in a production AI pipeline?"**

Say:
> "Three principles. First, custom exception hierarchy — I define a root `AppError` and specific subclasses like `RateLimitError`, `ContextLengthError`, `GuardrailError`. Each carries context — provider name, HTTP status code, guardrail score — not just a message string. Second, fail-fast at boundaries — validate inputs at the top of every function with guard clauses, raise immediately, no deep nesting. Third, different retry strategies per error type — `RateLimitError` gets exponential backoff retry, `ContextLengthError` gets prompt truncation and retry, `AuthError` gets immediate raise with no retry. In FastAPI I register exception handlers that map each exception class to the right HTTP status code — same as Spring's `@ExceptionHandler`."

---

## 11. Quick Reference

```python
# try/except/else/finally
try:
    result = risky()
except SpecificError as e:
    handle(e)
except (Error1, Error2) as e:    # multi-catch (Java: catch (A|B e))
    handle(e)
except Exception as e:
    raise                         # re-raise
else:
    use(result)                   # only if no exception
finally:
    cleanup()                     # always

# raise
raise ValueError("bad input")                  # new exception
raise NewError("msg") from original_error      # chained (Java: initCause)
raise                                          # re-raise current exception

# Custom exception
class MyError(Exception):
    def __init__(self, msg, code: int):
        super().__init__(msg)
        self.code = code

# Common built-ins (Java equivalent)
ValueError      → IllegalArgumentException
TypeError       → ClassCastException
KeyError        → NoSuchElementException
IndexError      → IndexOutOfBoundsException
AttributeError  → NullPointerException-adjacent
RuntimeError    → RuntimeException
NotImplementedError → UnsupportedOperationException
```
