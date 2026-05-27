# Python for AI Engineering — Phase 1
# Lesson 10: Pythonic OOP

---

## 1. Intuition (Java Anchor)

You know Java OOP cold: classes, interfaces, inheritance, encapsulation, polymorphism.
Python OOP uses the same concepts but with:
- Less ceremony (no `public`, `private`, `interface` keywords)
- `self` instead of `this` (explicit, always the first parameter)
- `dataclasses` instead of boilerplate POJOs
- Duck typing instead of interface contracts
- `@property` instead of getter/setter methods
- Composition preferred over deep inheritance

---

## 2. Classes and `self` (Java: `this`)

```python
# Java:
# public class LLMClient {
#     private String model;
#     public LLMClient(String model) { this.model = model; }
#     public String getModel() { return this.model; }
# }

# Python:
class LLMClient:
    def __init__(self, model: str, temperature: float = 0.2):
        # 'self' is explicit — like Java 'this' but always written out
        self.model = model               # public by convention
        self.temperature = temperature
        self._token_count = 0            # _prefix = "please don't touch" (protected)
        self.__secret_key = "sk-..."     # __prefix = name-mangled (closest to private)

    def invoke(self, prompt: str) -> str:
        self._token_count += len(prompt.split())
        return self._call_api(prompt)

    def _call_api(self, prompt: str) -> str:    # _prefix = internal method
        pass

# Instantiation — no 'new' keyword in Python
client = LLMClient(model="gpt-4o", temperature=0.0)
# Java: LLMClient client = new LLMClient("gpt-4o", 0.0);
```

---

## 3. Inheritance (Java: extends)

```python
# Java: class GPT4Client extends LLMClient { ... }
# Python:

class BaseLLMClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def invoke(self, prompt: str) -> str:
        raise NotImplementedError("Subclasses must implement invoke()")

    def count_tokens(self, text: str) -> int:
        return len(text.split())   # rough estimate

class OpenAIClient(BaseLLMClient):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        super().__init__(api_key)    # like Java super() — call parent constructor
        self.model = model

    def invoke(self, prompt: str) -> str:   # override
        return openai.chat(prompt, model=self.model, key=self.api_key)

class AnthropicClient(BaseLLMClient):
    def invoke(self, prompt: str) -> str:
        return anthropic.message(prompt, key=self.api_key)

# Duck typing — Python doesn't need a common interface, just a common method name
def run_pipeline(llm_client, prompt: str) -> str:
    return llm_client.invoke(prompt)   # works with any object that has invoke()

run_pipeline(OpenAIClient("sk-..."), "What is RAG?")
run_pipeline(AnthropicClient("sk-ant-..."), "What is RAG?")
```

---

## 4. `@property` — Pythonic Getters/Setters (Java: getX/setX)

```python
# Java: private String model; public String getModel() {} public void setModel() {}
# Python: @property — access looks like a field, behaves like a method

class LLMConfig:
    def __init__(self, model: str, temperature: float):
        self._model = model
        self._temperature = temperature

    @property
    def model(self) -> str:
        return self._model          # accessed as config.model, not config.get_model()

    @model.setter
    def model(self, value: str):
        if not isinstance(value, str):
            raise ValueError("Model must be a string")
        self._model = value         # set as config.model = "gpt-4o-mini"

    @property
    def temperature(self) -> float:
        return self._temperature

    @temperature.setter
    def temperature(self, value: float):
        if not 0.0 <= value <= 2.0:
            raise ValueError("Temperature must be between 0 and 2")
        self._temperature = value

config = LLMConfig("gpt-4o", 0.2)
print(config.model)          # getter — looks like field access, not config.getModel()
config.model = "gpt-4o-mini" # setter — looks like assignment, validates internally
config.temperature = 5.0     # ValueError — validation in setter
```

---

## 5. `dataclasses` — Replace Boilerplate POJOs (Java: Records / Lombok)

```python
# Java POJO (verbose):
# public class CVProfile {
#     private String name; private String email; private List<String> skills;
#     public CVProfile(String name, ...) { ... }
#     public String getName() { ... }  // + getters, setters, equals, hashCode, toString
# }

# Java Record (Java 14+):
# public record CVProfile(String name, String email, List<String> skills) {}

# Python dataclass — same idea, adds __init__, __repr__, __eq__ automatically:
from dataclasses import dataclass, field
from typing import List

@dataclass
class CVProfile:
    name: str
    email: str
    skills: List[str] = field(default_factory=list)   # mutable default — use field()
    experience_years: int = 0
    education: str = ""

# Auto-generated: __init__, __repr__, __eq__
profile = CVProfile(name="Ravi", email="ravi@x.com", skills=["Python", "FastAPI"])
print(profile)
# CVProfile(name='Ravi', email='ravi@x.com', skills=['Python', 'FastAPI'], ...)

# Immutable dataclass (like Java record):
@dataclass(frozen=True)   # frozen=True → immutable, hashable
class ModelConfig:
    model: str
    temperature: float = 0.2
    max_tokens: int = 500

config = ModelConfig(model="gpt-4o")
config.model = "x"    # FrozenInstanceError — cannot mutate
```

---

## 6. Class Methods and Static Methods (Java: static)

```python
# Java: static method → belongs to class, not instance

class LLMClientFactory:
    _default_model = "gpt-4o"

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    @classmethod
    def from_env(cls) -> "LLMClientFactory":
        """Factory method using class — like Java static factory method."""
        return cls(
            model=os.getenv("LLM_MODEL", cls._default_model),
            api_key=os.getenv("OPENAI_API_KEY"),
        )

    @staticmethod
    def count_tokens(text: str) -> int:
        """Utility — no access to class or instance. Like Java static util method."""
        return len(text.split())

# Usage:
client = LLMClientFactory.from_env()          # classmethod — factory pattern
tokens = LLMClientFactory.count_tokens(text)  # staticmethod — util

# Java:
# LLMClientFactory.fromEnv() — static factory
# LLMClientFactory.countTokens(text) — static util
```

---

## 7. Composition Over Inheritance (Same Principle, Cleaner in Python)

```python
# Java: favor composition — same rule applies in Python
# Python makes it even easier — no interface boilerplate

class VectorRetriever:
    def search(self, query: str, top_k: int) -> list:
        return faiss_index.search(embed(query), top_k)

class LLMGenerator:
    def generate(self, context: str, query: str) -> str:
        return llm.invoke(f"Context: {context}\n\nQuestion: {query}")

class RAGPipeline:
    """Composed from retriever + generator — no inheritance."""
    def __init__(self, retriever: VectorRetriever, generator: LLMGenerator):
        self.retriever = retriever    # composition
        self.generator = generator

    def run(self, query: str) -> str:
        chunks = self.retriever.search(query, top_k=5)
        context = "\n".join(c.text for c in chunks)
        return self.generator.generate(context, query)

# Java: same pattern — constructor injection. Python: identical concept.
pipeline = RAGPipeline(
    retriever=VectorRetriever(),
    generator=LLMGenerator(),
)
```

---

## 8. `__repr__` and `__str__` (Java: toString)

```python
class RAGResult:
    def __init__(self, query: str, answer: str, score: float):
        self.query = query
        self.answer = answer
        self.score = score

    def __repr__(self) -> str:
        """Used in REPL, logs, debugging — like Java toString() for devs."""
        return f"RAGResult(query={self.query!r}, score={self.score:.2f})"

    def __str__(self) -> str:
        """Used in print() — like Java toString() for users."""
        return f"Q: {self.query}\nA: {self.answer} (confidence: {self.score:.0%})"

result = RAGResult("What is RAG?", "RAG retrieves...", 0.87)
print(repr(result))   # RAGResult(query='What is RAG?', score=0.87)
print(str(result))    # Q: What is RAG? ...
print(result)         # calls __str__ automatically
```

---

## 9. AI Engineering Patterns

```python
# Production-grade service class — same as Java @Service

from dataclasses import dataclass
from typing import Optional

@dataclass
class RetrievedChunk:
    id: str
    text: str
    score: float
    source: str = ""

class RAGService:
    """Service layer — matches Java @Service pattern."""

    def __init__(self, retriever, generator, max_chunks: int = 5):
        self._retriever = retriever    # injected — testable
        self._generator = generator
        self._max_chunks = max_chunks
        self._call_count = 0

    def query(self, user_query: str) -> str:
        self._call_count += 1
        chunks: list[RetrievedChunk] = self._retriever.search(
            user_query, top_k=self._max_chunks
        )
        if not chunks:
            return "I don't have relevant information to answer this question."
        context = self._build_context(chunks)
        return self._generator.generate(context, user_query)

    def _build_context(self, chunks: list[RetrievedChunk]) -> str:
        return "\n\n".join(f"[{c.source}]: {c.text}" for c in chunks)

    @property
    def call_count(self) -> int:
        return self._call_count
```

---

## 10. Interview Anchor

**"How do you structure Python classes in an AI service — compared to Java Spring services?"**

Say:
> "Very similarly in concept — service layer, constructor injection, single responsibility. The difference is Python's lower ceremony. Instead of Lombok `@Data` I use `@dataclass` for models. Instead of `@Autowired` constructor injection I take dependencies in `__init__` directly. Instead of `getModel()` I use `@property`. `@classmethod` replaces Java static factory methods. The biggest change is Python's duck typing — I don't need an interface for `LLMClient` to accept OpenAI or Anthropic interchangeably; as long as both have an `.invoke()` method, any function can use either. It's the same design principle — program to a contract — just enforced at runtime instead of compile time."

---

## 11. Quick Reference

```python
# Class
class Foo:
    def __init__(self, x: int):    # constructor — like Java constructor
        self.x = x                  # public
        self._x = x                 # protected convention
        self.__x = x                # name-mangled (closest to private)

    @property
    def value(self): return self.x  # getter — foo.value not foo.get_value()

    @value.setter
    def value(self, v): self.x = v  # setter — foo.value = 5

    @classmethod
    def from_config(cls, cfg): return cls(cfg["x"])   # factory

    @staticmethod
    def util(x): return x * 2      # no self/cls — like Java static

    def __repr__(self): return f"Foo({self.x})"    # Java: toString() for devs
    def __str__(self):  return str(self.x)          # Java: toString() for users

# Inheritance
class Bar(Foo):
    def __init__(self, x, y):
        super().__init__(x)         # Java: super(x)
        self.y = y

# Dataclass (POJO / Record replacement)
@dataclass
class Config:
    model: str
    temp: float = 0.2
    tags: list = field(default_factory=list)
```
