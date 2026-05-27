# Python for AI Engineering — Phase 1
# Lesson 4: Functions

---

## 1. Intuition (Java Anchor)

In Java, a method belongs to a class — always. You cannot have a free-standing function.
In Python, a function is a **first-class object** that lives independently. You can pass it, store it, return it, decorate it.

This is not a small difference — the entire LangChain/LangGraph ecosystem is built on passing functions as tools and chains.

---

## 2. Defining Functions

```python
# Java:
# public String greet(String name) { return "Hello " + name; }

# Python:
def greet(name):
    return f"Hello {name}"

# Return type is optional (add for clarity in production code):
def greet(name: str) -> str:
    return f"Hello {name}"

# Multiple return values — Java needs a wrapper class or array
# Python returns a tuple automatically:
def get_model_info(model: str) -> tuple[str, float]:
    return model, 0.2   # returns ("gpt-4o", 0.2) as tuple

model, temp = get_model_info("gpt-4o")   # unpack immediately
```

---

## 3. Keyword Arguments and Defaults (Java Has Neither)

```python
# Java: no keyword args, no default values — you need method overloading
# Python: both in one function

def call_llm(prompt: str, model: str = "gpt-4o", temperature: float = 0.2, max_tokens: int = 500):
    pass

# Call with positional args (like Java):
call_llm("What is RAG?")

# Call with keyword args — order doesn't matter:
call_llm("What is RAG?", temperature=0.7, model="gpt-4o-mini")

# Mix: positional first, then keyword:
call_llm("What is RAG?", "gpt-4o-mini", max_tokens=200)

# Java would need 4 overloaded methods or a Builder pattern for this flexibility
```

---

## 4. Keyword-Only Arguments (Force Explicit Naming)

```python
# Everything after * must be passed as keyword — prevents order mistakes
def build_prompt(template: str, *, user_query: str, context: str = "") -> str:
    return template.format(query=user_query, ctx=context)

# Must use keyword — cannot pass positionally:
build_prompt(TEMPLATE, user_query="What is RAG?", context="RAG retrieves...")
# build_prompt(TEMPLATE, "What is RAG?")  → TypeError
```

---

## 5. Closures (Java: Lambda Capturing Final Variables)

```python
# A closure is a function that captures variables from its enclosing scope
# Java: lambdas can only capture effectively-final variables
# Python: closures capture and can modify (with 'nonlocal') outer variables

def make_multiplier(factor: int):
    def multiply(x: int) -> int:
        return x * factor    # 'factor' is captured from outer scope
    return multiply          # returns the inner function as an object

double = make_multiplier(2)
triple = make_multiplier(3)
print(double(5))    # 10
print(triple(5))    # 15

# AI engineering: factory for model-specific callers
def make_llm_caller(model: str, temperature: float = 0.2):
    def call(prompt: str) -> str:
        return llm_api(prompt, model=model, temperature=temperature)
    return call

cheap_caller = make_llm_caller("gpt-4o-mini", temperature=0.0)
smart_caller = make_llm_caller("gpt-4o", temperature=0.3)
```

---

## 6. Scope — LEGB Rule (Java: Block Scope)

```python
# Java: variables are scoped to their {} block
# Python: LEGB — Local → Enclosing → Global → Built-in

x = "global"

def outer():
    x = "enclosing"

    def inner():
        x = "local"
        print(x)    # "local" — Local wins
    inner()
    print(x)        # "enclosing"

outer()
print(x)            # "global"

# Modifying enclosing scope — nonlocal keyword
def counter():
    count = 0
    def increment():
        nonlocal count    # tells Python: use enclosing scope's 'count'
        count += 1
        return count
    return increment

c = counter()
print(c())    # 1
print(c())    # 2
print(c())    # 3
```

---

## 7. Lambda (Java: Functional Interface / Lambda Expression)

```python
# Java: Comparator<String> byLength = (a, b) -> a.length() - b.length();
# Python: lambda — single expression only, no statements

double = lambda x: x * 2
add    = lambda x, y: x + y

# Real use: sort key, filter, map
models = [("gpt-4o", 0.01), ("gpt-4o-mini", 0.001), ("claude", 0.008)]
# Sort by cost (second element):
models.sort(key=lambda m: m[1])
# [("gpt-4o-mini", 0.001), ("claude", 0.008), ("gpt-4o", 0.01)]

# Filter — like Java stream().filter()
expensive = list(filter(lambda m: m[1] > 0.005, models))

# Map — like Java stream().map()
names = list(map(lambda m: m[0], models))

# In Python, list comprehensions are preferred over map/filter (more readable):
expensive = [m for m in models if m[1] > 0.005]   # better than filter+lambda
names     = [m[0] for m in models]                 # better than map+lambda
```

---

## 8. Docstrings (Java: Javadoc)

```python
# Java: /** @param prompt The input prompt @return LLM response */
# Python: triple-quoted string immediately after def

def call_llm(prompt: str, model: str = "gpt-4o") -> str:
    """
    Call the LLM with a prompt and return the response content.

    Args:
        prompt: The input text to send to the model.
        model: Model identifier. Defaults to gpt-4o.

    Returns:
        The model's response as a plain string.

    Raises:
        ValueError: If prompt is empty.
        APIError: If the LLM API call fails after retries.
    """
    if not prompt.strip():
        raise ValueError("Prompt cannot be empty")
    # ... implementation

# Access docstring at runtime:
print(call_llm.__doc__)

# FastAPI reads docstrings to generate OpenAPI documentation automatically
```

---

## 9. Functions as First-Class Objects (Java: Method References + Functional Interfaces)

```python
# Java: Function<String, String> fn = String::toUpperCase;
# Python: functions are objects — assign, pass, store, return directly

def search(query: str) -> list: ...
def rerank(results: list) -> list: ...
def summarize(text: str) -> str: ...

# Store in list
pipeline = [search, rerank, summarize]

# Execute pipeline
def run_pipeline(query: str, steps: list) -> str:
    result = query
    for step in steps:
        result = step(result)
    return result

# Pass as argument
def with_retry(fn, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception:
            if attempt == max_retries - 1:
                raise

# This is how LangChain tool lists work:
tools = [search_web, query_vector_db, call_calculator]
agent.invoke({"query": query, "tools": tools})
```

---

## 10. AI Engineering Patterns

```python
# Pattern 1: Tool registry — functions stored by name
TOOLS: dict[str, callable] = {
    "search": search_knowledge_base,
    "calculate": run_calculation,
    "lookup": lookup_employee,
}

def dispatch_tool(tool_name: str, args: dict):
    if tool_name not in TOOLS:
        raise ValueError(f"Unknown tool: {tool_name}")
    return TOOLS[tool_name](**args)

# Pattern 2: Pipeline factory with closures
def build_rag_pipeline(retriever, llm, top_k: int = 5):
    def run(query: str) -> str:
        chunks = retriever.search(query, top_k=top_k)
        context = "\n".join(c.text for c in chunks)
        return llm.invoke(f"Context: {context}\n\nQuestion: {query}")
    return run

pipeline = build_rag_pipeline(faiss_retriever, gpt4_client, top_k=10)
answer = pipeline("What skills does this candidate have?")

# Pattern 3: Keyword-only args for safety in LLM calls
def generate_plan(
    profile: dict,
    *,
    role: str,
    max_days: int = 30,
    model: str = "gpt-4o",
) -> dict:
    """Force callers to name role and max_days — prevents order mistakes."""
    pass
```

---

## 11. Interview Anchor

**"How do you design reusable LLM calling functions in Python?"**

Say:
> "I build factory functions with closures. A `make_llm_caller(model, temperature)` function returns a specialized callable — cheap_caller, smart_caller, streaming_caller. Each caller is a closure capturing its config. I then pass these callables into pipeline steps or agent tool registries. This is the same pattern as Java method references — but in Python functions are true objects, not functional interface wrappers. It makes the code dramatically cleaner for building multi-step AI pipelines."

---

## 12. Quick Reference

```python
# Basic function
def fn(a: int, b: str = "default") -> str: ...

# Keyword-only (force named args)
def fn(a, *, b, c="val"): ...

# Lambda (single expression)
key_fn = lambda x: x["score"]

# Closure (captures outer variable)
def make_fn(config):
    def fn(x): return x + config
    return fn

# First-class function usage
fns = [step1, step2, step3]
result = x
for fn in fns:
    result = fn(result)

# Docstring
def fn():
    """One-line summary. Then details."""
    pass
```
