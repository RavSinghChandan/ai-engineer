# Python for AI Engineering — Phase 2
# Lesson 2: Typing + Protocols

---

## 1. Intuition (Java Anchor)

Java is statically typed — the compiler catches type errors before runtime.
Python is dynamically typed — but since Python 3.5+ you can add **type hints** that:
- Make code self-documenting (same as Java signatures)
- Enable IDE autocompletion and refactoring
- Let tools like `mypy` catch errors before runtime
- Are used by Pydantic, FastAPI, and LangChain to drive validation and schema generation

Type hints in Python are **optional** — the runtime ignores them unless a framework reads them.
But in production AI engineering code, you always write them. No exceptions.

---

## 2. Basic Type Hints (Java: Type Declarations)

```python
# Java: String name, int age, List<String> skills
# Python type hints — same information, different syntax:

name: str = "Ravi"
age: int = 30
score: float = 0.85
active: bool = True

# Function signatures — closest to Java method signatures
def greet(name: str, times: int = 1) -> str:
    return (f"Hello {name}! " * times).strip()

# Java: public String greet(String name, int times) { ... }
# The mapping is 1:1 — just different syntax

# None return (Java: void)
def log_event(event: str) -> None:
    print(f"[LOG] {event}")
```

---

## 3. `Optional` (Java: `Optional<T>` / nullable)

```python
from typing import Optional

# Java: Optional<String> email  or  @Nullable String email
# Python: Optional[str] = str | None

def find_user(user_id: str) -> Optional[dict]:
    """Returns user dict or None if not found."""
    result = db.query(user_id)
    return result if result else None

# Python 3.10+ shorthand using | :
def find_user(user_id: str) -> dict | None:   # same as Optional[dict]
    pass

# Usage — must check for None before using (same discipline as Java Optional.isPresent())
user = find_user("ravi")
if user is not None:
    process(user)

# Optional parameters:
def call_llm(prompt: str, system_prompt: Optional[str] = None) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    return api.invoke(messages)
```

---

## 4. `Union` (Java: Generics with Wildcards / Sealed Classes)

```python
from typing import Union

# Java 17 sealed class or instanceof checks
# Python Union — value can be one of several types

def process_input(data: Union[str, dict, list]) -> str:
    if isinstance(data, str):
        return data
    elif isinstance(data, dict):
        return json.dumps(data)
    else:
        return "\n".join(str(item) for item in data)

# Python 3.10+ shorthand:
def process_input(data: str | dict | list) -> str: ...

# AI engineering: LLM response can be string or structured:
LLMOutput = Union[str, dict]

def parse_response(response: LLMOutput) -> dict:
    if isinstance(response, str):
        return json.loads(response)
    return response
```

---

## 5. `List`, `Dict`, `Tuple` Generics (Java: `List<T>`, `Map<K,V>`)

```python
from typing import List, Dict, Tuple, Set   # Python 3.8 and below
# Python 3.9+ — use built-in types directly (no import needed):

# Java: List<String>          → Python: list[str]
# Java: Map<String, Integer>  → Python: dict[str, int]
# Java: List<Map<String,Any>> → Python: list[dict[str, Any]]

def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts, return list of embedding vectors."""
    return [model.encode(text) for text in texts]

def build_config(params: dict[str, str | int | float]) -> dict:
    return {k: v for k, v in params.items()}

def parse_chunk(chunk: tuple[str, float, str]) -> dict:
    text, score, source = chunk
    return {"text": text, "score": score, "source": source}

# Nested generics:
def group_by_role(profiles: list[dict[str, str]]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for profile in profiles:
        role = profile.get("role", "unknown")
        groups.setdefault(role, []).append(profile)
    return groups
```

---

## 6. `TypedDict` (Java: Record / POJO with types)

```python
from typing import TypedDict

# Java Record: record CVProfile(String name, String email, List<String> skills) {}
# TypedDict — typed dict, no class instantiation needed, works with IDE

class CVProfile(TypedDict):
    name: str
    email: str
    skills: list[str]
    experience_years: int

class CVProfilePartial(TypedDict, total=False):   # total=False → all keys optional
    name: str
    email: str

# Usage — still a regular dict, but IDE knows the shape:
def process_profile(profile: CVProfile) -> str:
    return f"{profile['name']} | {profile['experience_years']} years"

profile: CVProfile = {
    "name": "Ravi",
    "email": "ravi@x.com",
    "skills": ["Python"],
    "experience_years": 5,
}
# IDE autocompletes profile["name"], warns on profile["typo"]
```

---

## 7. `Protocol` (Java: Interface — but structural, not nominal)

```python
from typing import Protocol

# Java interface: class must explicitly declare 'implements LLMClient'
# Python Protocol: any class that has the right methods qualifies — no declaration

class LLMClient(Protocol):
    """Structural interface — any class with invoke() satisfies this."""
    def invoke(self, prompt: str) -> str: ...
    def count_tokens(self, text: str) -> int: ...

# These classes don't extend LLMClient — but they satisfy the Protocol:
class OpenAIWrapper:
    def invoke(self, prompt: str) -> str: return openai.call(prompt)
    def count_tokens(self, text: str) -> int: return len(text.split())

class AnthropicWrapper:
    def invoke(self, prompt: str) -> str: return anthropic.call(prompt)
    def count_tokens(self, text: str) -> int: return len(text.split())

# Function typed against Protocol — accepts either:
def run_pipeline(llm: LLMClient, query: str) -> str:
    tokens = llm.count_tokens(query)
    return llm.invoke(query)

run_pipeline(OpenAIWrapper(), "What is RAG?")      # works
run_pipeline(AnthropicWrapper(), "What is RAG?")   # works — no explicit impl needed

# Java equivalent: both classes would need to declare 'implements LLMClient'
# Protocol is Python's structural typing — duck typing with IDE support
```

---

## 8. `Callable` (Java: Functional Interfaces)

```python
from typing import Callable

# Java: Function<String, String>  →  Callable[[str], str]
# Java: BiFunction<String,int,str> → Callable[[str, int], str]
# Java: Runnable                   → Callable[[], None]

# Type hint for functions passed as arguments:
def with_retry(
    fn: Callable[[str], str],    # function that takes str, returns str
    max_retries: int = 3,
) -> Callable[[str], str]:
    def wrapper(prompt: str) -> str:
        for attempt in range(max_retries):
            try:
                return fn(prompt)
            except Exception:
                if attempt == max_retries - 1:
                    raise
    return wrapper

# More complex: function that takes any args
from typing import Any
Transformer = Callable[..., Any]    # any signature

# Tool function type for agents:
ToolFn = Callable[[str], str]
tools: dict[str, ToolFn] = {
    "search": search_web,
    "calculate": run_calc,
}
```

---

## 9. Generics with `TypeVar` (Java: `<T>`)

```python
from typing import TypeVar, Generic

T = TypeVar("T")   # Java: <T>

# Generic function — works with any type:
def first_or_default(items: list[T], default: T) -> T:
    return items[0] if items else default

first_or_default(["a", "b"], "none")   # returns str
first_or_default([1, 2], 0)            # returns int
# mypy infers the return type from the input type — like Java generics

# Generic class — like Java List<T>:
class ResultCache(Generic[T]):
    def __init__(self):
        self._cache: dict[str, T] = {}

    def get(self, key: str) -> T | None:
        return self._cache.get(key)

    def set(self, key: str, value: T) -> None:
        self._cache[key] = value

str_cache: ResultCache[str] = ResultCache()
dict_cache: ResultCache[dict] = ResultCache()
```

---

## 10. `Literal` — Restrict to Specific Values (Java: Enum)

```python
from typing import Literal

# Java: enum Role { USER, ADMIN }
# Python Literal — restrict parameter to specific string values:

Role = Literal["user", "admin"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
Provider = Literal["openai", "anthropic", "deepseek"]

def create_token(user_id: str, role: Role) -> str:
    # mypy will error if you pass role="superuser" — not in Literal
    pass

def set_log_level(level: LogLevel) -> None:
    logging.getLogger().setLevel(level)

# AI engineering: model selection
def call_llm(
    prompt: str,
    provider: Provider = "openai",
    strategy: Literal["fast", "smart", "balanced"] = "balanced",
) -> str:
    pass
```

---

## 11. Dependency Injection Typing Pattern

```python
# Java Spring: @Autowired LLMService llmService;
# Python: type hints in __init__ enable DI containers and make code testable

from typing import Protocol

class VectorDB(Protocol):
    def search(self, query: str, top_k: int) -> list[dict]: ...
    def upsert(self, chunks: list[dict]) -> None: ...

class LLM(Protocol):
    def invoke(self, prompt: str) -> str: ...

class RAGService:
    def __init__(
        self,
        vector_db: VectorDB,   # typed against Protocol — any impl works
        llm: LLM,
        top_k: int = 5,
    ):
        self._db = vector_db
        self._llm = llm
        self._top_k = top_k

    def query(self, question: str) -> str:
        chunks = self._db.search(question, self._top_k)
        context = "\n".join(c["text"] for c in chunks)
        return self._llm.invoke(f"Context: {context}\n\nQ: {question}")

# In tests — inject mocks (any object with search/upsert/invoke methods):
class MockDB:
    def search(self, query, top_k): return [{"text": "test chunk"}]
    def upsert(self, chunks): pass

class MockLLM:
    def invoke(self, prompt): return "mocked answer"

service = RAGService(vector_db=MockDB(), llm=MockLLM())
```

---

## 12. Interview Anchor

**"How do you use Python typing in production AI systems?"**

Say:
> "Three ways. First, function signatures — every public function has typed params and return type, same information as Java method signatures, enabling IDE support and mypy checking. Second, `TypedDict` for dicts that represent domain objects like CVProfile or RoleMapping — structured without needing a full class. Third, `Protocol` for dependency injection — instead of inheriting from a base class, I define a Protocol with the methods I need, and any class that has those methods satisfies it. This gives me Java-style interface contracts without requiring classes to explicitly declare which interface they implement. It's structural typing — the way Python was designed — with IDE-verified safety added on top."

---

## 13. Quick Reference

```python
# Basic types
x: str = "hello"
y: int = 42
z: float = 0.5
b: bool = True

# Nullable (Optional)
val: str | None = None              # Python 3.10+
val: Optional[str] = None           # Python 3.9 and below

# Collections
items: list[str]
mapping: dict[str, int]
pair: tuple[str, float]
unique: set[str]

# Union
data: str | dict | list             # Python 3.10+
data: Union[str, dict, list]        # older

# Callable (Java: Functional Interface)
fn: Callable[[str], str]            # takes str, returns str
fn: Callable[..., Any]              # any signature

# Literal (Java: Enum)
role: Literal["user", "admin"]

# TypedDict (Java: Record)
class Config(TypedDict):
    model: str
    temperature: float

# Protocol (Java: Interface — structural)
class Service(Protocol):
    def invoke(self, x: str) -> str: ...

# Generic (Java: <T>)
T = TypeVar("T")
def wrap(x: T) -> list[T]: return [x]
```
