# Python for AI Engineering — Phase 1
# Lesson 5: *args and **kwargs

---

## 1. Intuition (Java Anchor)

Java has varargs: `void log(String... messages)` — accepts any number of Strings, packed into an array.
Python has two vararg mechanisms:
- `*args` — any number of **positional** arguments → packed into a **tuple**
- `**kwargs` — any number of **keyword** arguments → packed into a **dict**

This is how LangChain, FastAPI, and every Python SDK pass flexible config without defining 50 overloads.

---

## 2. `*args` — Variable Positional Arguments

```python
# Java varargs:
# public void log(String level, String... messages) {}

# Python *args:
def log(level: str, *messages):
    for msg in messages:
        print(f"[{level}] {msg}")

log("INFO", "Starting pipeline")
log("ERROR", "LLM failed", "Retrying", "Attempt 2")

# *messages is a TUPLE inside the function
def show_types(*args):
    print(type(args))    # <class 'tuple'>
    print(args)          # (1, "hello", 3.14)

show_types(1, "hello", 3.14)
```

---

## 3. `**kwargs` — Variable Keyword Arguments

```python
# No Java equivalent — closest is Map<String, Object>
# Java: void configure(Map<String, Object> params)
# Python **kwargs:

def configure_llm(**kwargs):
    print(type(kwargs))     # <class 'dict'>
    print(kwargs)           # {"model": "gpt-4o", "temperature": 0.2}

configure_llm(model="gpt-4o", temperature=0.2, max_tokens=500)

# Practical: forward arbitrary config to underlying SDK
def call_openai(prompt: str, **kwargs):
    return openai_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        **kwargs    # forward model, temperature, max_tokens, etc.
    )

# Caller decides which params to pass:
call_openai("What is RAG?", model="gpt-4o", temperature=0.0)
call_openai("Write a poem", model="gpt-4o", temperature=0.9, max_tokens=200)
```

---

## 4. Combining `*args` and `**kwargs`

```python
# Order rule: regular → *args → keyword-only → **kwargs
def build_request(endpoint: str, *path_parts, method: str = "GET", **headers):
    path = "/".join(path_parts)
    print(f"{method} {endpoint}/{path}")
    print(f"Headers: {headers}")

build_request("https://api.openai.com", "v1", "chat", "completions",
              method="POST",
              Authorization="Bearer sk-...",
              Content_Type="application/json")
```

---

## 5. Unpacking into Function Calls (The Most Used Pattern in AI Engineering)

```python
# The * and ** operators UNPACK collections INTO function arguments
# This is the inverse of collecting them

# *list unpacks into positional args
def add(a, b, c): return a + b + c
nums = [1, 2, 3]
add(*nums)      # same as add(1, 2, 3)

# **dict unpacks into keyword args
def call_llm(model, temperature, max_tokens): ...
config = {"model": "gpt-4o", "temperature": 0.2, "max_tokens": 500}
call_llm(**config)   # same as call_llm(model="gpt-4o", temperature=0.2, max_tokens=500)

# Java equivalent:
# Method.invoke(obj, args_array) — but only for reflection, not normal calls
# Python ** unpacking works on ANY function call — clean and everyday
```

---

## 6. Wrapper Functions — The Key AI Engineering Pattern

```python
# Python *args/**kwargs let you wrap any function without knowing its signature
# Java equivalent: dynamic proxy / reflection — very verbose

import time
import functools

def with_timing(fn):
    @functools.wraps(fn)              # preserves fn's name and docstring
    def wrapper(*args, **kwargs):     # accepts ANY arguments
        start = time.time()
        result = fn(*args, **kwargs)  # passes them through unchanged
        elapsed = time.time() - start
        print(f"{fn.__name__} took {elapsed:.3f}s")
        return result
    return wrapper

@with_timing
def call_llm(prompt: str, model: str = "gpt-4o") -> str:
    return openai_client.invoke(prompt, model=model)

# Now call_llm works exactly as before, plus timing
response = call_llm("What is RAG?", model="gpt-4o-mini")
# Output: call_llm took 1.234s
```

---

## 7. SDK-Style Parameter Forwarding

```python
# Real pattern used in LangChain, FastAPI, every major Python AI library
# Java equivalent: Builder pattern — but Python does it in one function

class LLMClient:
    def __init__(self, api_key: str, **default_kwargs):
        self.api_key = api_key
        self.defaults = default_kwargs    # store as dict

    def invoke(self, prompt: str, **override_kwargs) -> str:
        # Merge defaults with overrides (overrides win)
        params = {**self.defaults, **override_kwargs}
        return self._call_api(prompt, **params)

# Usage:
client = LLMClient(
    api_key="sk-...",
    model="gpt-4o",
    temperature=0.2,
    max_tokens=500,
)

# Use defaults:
client.invoke("Summarize this CV")

# Override for this call:
client.invoke("Write creatively", temperature=0.9, max_tokens=1000)
```

---

## 8. Merging Dicts with `**` (Python 3.5+)

```python
# ** can also be used to merge dicts inline
base    = {"model": "gpt-4o", "temperature": 0.2}
timeout = {"timeout": 30}
extras  = {"max_tokens": 500, "temperature": 0.7}   # overrides temperature

merged = {**base, **timeout, **extras}
# {"model": "gpt-4o", "temperature": 0.7, "timeout": 30, "max_tokens": 500}
# Later keys override earlier ones

# AI engineering: layered config
DEFAULT_LLM_CONFIG = {"model": "gpt-4o", "temperature": 0.2, "max_tokens": 500}
user_overrides     = {"temperature": 0.9}
final_config = {**DEFAULT_LLM_CONFIG, **user_overrides}
call_llm(prompt, **final_config)
```

---

## 9. AI Engineering Patterns

```python
# Pattern 1: Universal retry wrapper
def with_retry(fn, max_retries: int = 3, backoff: float = 1.0):
    def wrapper(*args, **kwargs):
        for attempt in range(max_retries):
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                time.sleep(backoff * (2 ** attempt))
    return wrapper

# Wraps ANY function — call_llm, embed_text, search_db — without changing them
resilient_call = with_retry(call_llm, max_retries=3)
resilient_embed = with_retry(embed_text, max_retries=5)

# Pattern 2: Agent tool dispatcher
def dispatch(tool_name: str, *args, **kwargs):
    tool = TOOL_REGISTRY.get(tool_name)
    if not tool:
        raise ValueError(f"Tool {tool_name} not found")
    return tool(*args, **kwargs)    # pass through all args/kwargs to the tool

# Pattern 3: LangChain-style chain forwarding
class PromptTemplate:
    def invoke(self, **inputs) -> str:
        return self.template.format(**inputs)

class LLMStep:
    def invoke(self, prompt: str, **llm_kwargs) -> str:
        return self.client.call(prompt, **llm_kwargs)

# Each step accepts **kwargs and forwards what it needs
```

---

## 10. Interview Anchor

**"How do you write Python functions that are reusable across different LLM providers?"**

Say:
> "I use `**kwargs` for SDK parameter forwarding. The function signature is `def call(prompt, **kwargs)` — kwargs gets forwarded directly to the underlying provider client. Callers can pass `model`, `temperature`, `max_tokens` or any provider-specific parameter without the wrapper function needing to know about them. Then I layer a `**defaults` merge at the top — `{**provider_defaults, **caller_kwargs}` — so callers override selectively. This is how LangChain's BaseChatModel works internally. In Java you'd need a Builder per provider — Python does it in two lines."

---

## 11. Quick Reference

```python
# Collect positional args into tuple
def fn(*args): ...

# Collect keyword args into dict
def fn(**kwargs): ...

# Both together
def fn(*args, **kwargs): ...

# Unpack list into positional args
fn(*my_list)

# Unpack dict into keyword args
fn(**my_dict)

# Merge dicts
merged = {**dict1, **dict2}    # dict2 keys override dict1

# Wrapper pattern
def wrap(fn):
    def wrapper(*args, **kwargs):
        return fn(*args, **kwargs)    # pass-through
    return wrapper
```
