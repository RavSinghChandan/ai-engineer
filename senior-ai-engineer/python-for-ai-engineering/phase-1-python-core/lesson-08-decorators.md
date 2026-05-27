# Python for AI Engineering — Phase 1
# Lesson 8: Decorators

---

## 1. Intuition (Java Anchor)

Java has annotations (`@Override`, `@Transactional`, `@Cacheable`) — but those are metadata processed by a framework at runtime.
Python decorators are **executable wrappers** — they are just functions that wrap other functions.

Java `@Cacheable` on a Spring method → Spring AOP creates a proxy around the method.
Python `@cache` on a function → you literally wrap the function in another function that handles caching.

The difference: in Python, **you** write the decorator — no framework needed.

---

## 2. How Decorators Work (Desugared)

```python
# A decorator is just a function that takes a function and returns a function
# Java AOP analogy: an Aspect that wraps a method — but in plain Python, no XML

def my_decorator(fn):
    def wrapper(*args, **kwargs):
        print("Before")
        result = fn(*args, **kwargs)
        print("After")
        return result
    return wrapper

# @syntax is just syntactic sugar for:
def greet(name): return f"Hello {name}"
greet = my_decorator(greet)   # manual decoration

# Equivalent with @ syntax:
@my_decorator
def greet(name): return f"Hello {name}"
# Python executes: greet = my_decorator(greet) at class-load time
```

---

## 3. `functools.wraps` — Preserve Function Identity

```python
import functools

# Without @wraps, the wrapped function loses its name and docstring
def bad_decorator(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper

@bad_decorator
def my_fn(): """My function.""" pass
print(my_fn.__name__)    # "wrapper" — wrong!
print(my_fn.__doc__)     # None — lost!

# With @wraps — Java analogy: keeping the original method's annotations
def good_decorator(fn):
    @functools.wraps(fn)   # copies __name__, __doc__, __module__, etc.
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)
    return wrapper

@good_decorator
def my_fn(): """My function.""" pass
print(my_fn.__name__)    # "my_fn" — preserved
print(my_fn.__doc__)     # "My function." — preserved
# FastAPI uses __name__ to generate route docs — always use @wraps
```

---

## 4. Retry Decorator (Most Used in AI Engineering)

```python
import functools
import time

def retry(max_attempts: int = 3, backoff: float = 1.0, exceptions=(Exception,)):
    """Decorator factory — takes config, returns decorator."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_attempts):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt < max_attempts - 1:
                        wait = backoff * (2 ** attempt)   # exponential backoff
                        print(f"Attempt {attempt+1} failed: {e}. Retrying in {wait}s")
                        time.sleep(wait)
            raise last_exc
        return wrapper
    return decorator

# Usage — decorate any LLM call:
@retry(max_attempts=3, backoff=1.0, exceptions=(APIRateLimitError, TimeoutError))
def call_llm(prompt: str) -> str:
    return openai_client.invoke(prompt)

# Java equivalent: @Retryable(maxAttempts=3, backoff=@Backoff(delay=1000, multiplier=2))
# Python: you write the logic yourself — more control, no framework dependency
```

---

## 5. Logging / Tracing Decorator

```python
import functools
import time
import logging

logger = logging.getLogger(__name__)

def trace(fn):
    """Log entry, exit, duration, and exceptions for any function."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        fn_name = fn.__name__
        logger.info(f"→ {fn_name} called")
        start = time.perf_counter()
        try:
            result = fn(*args, **kwargs)
            elapsed = (time.perf_counter() - start) * 1000
            logger.info(f"← {fn_name} completed in {elapsed:.1f}ms")
            return result
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"✗ {fn_name} failed after {elapsed:.1f}ms: {e}")
            raise
    return wrapper

@trace
def parse_cv(text: str) -> dict: ...

@trace
def map_role(profile: dict, role: str) -> dict: ...

# Java equivalent: @Around advice in Spring AOP — but requires AspectJ setup
# Python: 5 lines, zero dependencies
```

---

## 6. Decorator Factory (Decorators with Arguments)

```python
# Without arguments: @decorator
# With arguments:    @decorator(arg1, arg2)
# The factory is a function that RETURNS a decorator

def rate_limit(calls_per_second: float):
    """Limit how fast a function can be called."""
    min_interval = 1.0 / calls_per_second
    last_call = [0.0]    # list to allow mutation in closure

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            elapsed = time.time() - last_call[0]
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)
            last_call[0] = time.time()
            return fn(*args, **kwargs)
        return wrapper
    return decorator

@rate_limit(calls_per_second=2.0)   # max 2 LLM calls/second
def call_llm(prompt: str) -> str: ...

# Structure: rate_limit(2.0) → returns decorator → decorator(fn) → returns wrapper
# Java: custom annotation + AOP advice to implement this — much more code
```

---

## 7. Stacking Decorators

```python
# Multiple decorators are applied bottom-up

@trace          # applied second (outermost)
@retry(max_attempts=3)   # applied first (innermost)
def call_llm(prompt: str) -> str:
    return api.invoke(prompt)

# Equivalent to:
# call_llm = trace(retry(max_attempts=3)(call_llm))

# Execution order:
# trace wrapper runs → calls retry wrapper → retry calls original fn
# On retry: retry catches exception, sleeps, calls original again
# trace sees total time including all retries
```

---

## 8. Class-Based Decorator (Java: Decorator Design Pattern)

```python
# Python decorators map directly to GoF Decorator pattern
# Java Decorator: class CachingLLM implements LLMService { LLMService wrapped; }

class Cached:
    """Decorator class — wraps a function with in-memory cache."""
    def __init__(self, fn):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.cache = {}

    def __call__(self, *args, **kwargs):
        key = (args, tuple(sorted(kwargs.items())))
        if key not in self.cache:
            self.cache[key] = self.fn(*args, **kwargs)
        return self.cache[key]

@Cached
def embed_text(text: str) -> list[float]:
    return embedding_model.encode(text)

# Python's functools.lru_cache does this in one line:
from functools import lru_cache

@lru_cache(maxsize=1000)
def embed_text(text: str) -> list[float]:
    return embedding_model.encode(text)
# Java equivalent: @Cacheable("embeddings") with Spring Cache
```

---

## 9. AI Engineering Patterns

```python
# Production decorator stack for any LLM function:
import functools

def llm_call(model: str = "gpt-4o", max_retries: int = 3):
    """Combined: retry + logging + latency tracking."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    start = time.perf_counter()
                    result = fn(*args, **kwargs)
                    ms = (time.perf_counter() - start) * 1000
                    logger.info(f"{fn.__name__} | model={model} | {ms:.0f}ms | ok")
                    return result
                except RateLimitError:
                    time.sleep(2 ** attempt)
                except Exception as e:
                    logger.error(f"{fn.__name__} | attempt={attempt} | {e}")
                    if attempt == max_retries - 1:
                        raise
        return wrapper
    return decorator

@llm_call(model="gpt-4o", max_retries=3)
def parse_cv(text: str) -> dict: ...

@llm_call(model="gpt-4o-mini", max_retries=5)
def classify_skill(skill: str) -> str: ...
```

---

## 10. Interview Anchor

**"How do you add retry and logging to LLM calls without modifying every function?"**

Say:
> "Decorators. I write a `@llm_call(model, max_retries)` decorator factory that wraps any LLM function with retry logic, exponential backoff, and structured logging. I stack it on the function definition — no boilerplate in the function body itself. Java does this with Spring AOP `@Around` advice — powerful but requires AspectJ, XML config, or annotations. Python decorators give you the same capability in 20 lines of pure Python. The key is `functools.wraps` to preserve the original function's name and docstring, because FastAPI uses `__name__` for OpenAPI docs."

---

## 11. Quick Reference

```python
# Basic decorator
def dec(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # before
        result = fn(*args, **kwargs)
        # after
        return result
    return wrapper

@dec
def my_fn(): ...

# Decorator factory (with args)
def dec_factory(arg):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return fn(*args, **kwargs)
        return wrapper
    return decorator

@dec_factory(arg=value)
def my_fn(): ...

# Stacking (bottom-up application)
@outer
@inner
def fn(): ...
# = outer(inner(fn))

# Built-in useful decorators
@functools.lru_cache(maxsize=128)   # memoize
@staticmethod                        # no self/cls
@classmethod                         # cls instead of self
@property                            # getter
```
