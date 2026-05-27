# Python for AI Engineering — Phase 1
# Lesson 9: Context Managers

---

## 1. Intuition (Java Anchor)

Java `try-with-resources` (Java 7+):
```java
try (FileReader fr = new FileReader("file.txt")) {
    // use fr
}   // fr.close() called automatically
```

Python `with` statement does the same thing — but is far more flexible and works for anything: files, DB connections, HTTP sessions, locks, timers, temp directories, LLM tracing contexts.

```python
with open("file.txt") as f:
    data = f.read()
# f.close() called automatically — even if exception thrown
```

The key difference: in Java, only `AutoCloseable` types work with `try-with-resources`.
In Python, **any object** with `__enter__` and `__exit__` works with `with`.

---

## 2. The Protocol: `__enter__` and `__exit__`

```python
# Python with-statement protocol:
# __enter__ → runs at start of 'with' block, its return value goes to 'as' variable
# __exit__  → runs at end of block, even if exception — like finally in Java

# Java try-with-resources implements AutoCloseable:
# public void close() throws Exception {}

# Python equivalent:
class DatabaseConnection:
    def __enter__(self):
        self.conn = create_connection()
        return self.conn           # this becomes the 'as conn' variable

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()          # always runs — like Java finally
        return False               # False = don't suppress exceptions (usual)
        # return True would suppress the exception — rarely correct

with DatabaseConnection() as conn:
    conn.execute("SELECT ...")
# conn.close() called here automatically
```

---

## 3. `contextlib.contextmanager` — Easier Way (No Java Equivalent)

```python
# Instead of writing a class, use a generator function with @contextmanager
# The yield is where the 'with' block executes

from contextlib import contextmanager
import time

@contextmanager
def timer(label: str):
    """Times the body of a with block."""
    start = time.perf_counter()
    try:
        yield                          # 'with' block runs here
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        print(f"{label}: {elapsed:.1f}ms")

# Usage:
with timer("LLM call"):
    response = call_llm(prompt)
# Output: LLM call: 1243.7ms

with timer("Embedding"):
    vectors = embed_texts(chunks)
# Output: Embedding: 87.3ms
```

---

## 4. File Handling (Java: try-with-resources on FileReader)

```python
# Java:
# try (BufferedReader br = new BufferedReader(new FileReader("file.txt"))) {
#     String line; while ((line = br.readLine()) != null) { ... }
# }

# Python:
with open("resume.txt", "r", encoding="utf-8") as f:
    content = f.read()          # read entire file

# Line by line (lazy — good for large files):
with open("large_log.txt") as f:
    for line in f:              # f is an iterator — lazy
        process(line)

# Write mode:
with open("output.json", "w") as f:
    json.dump(data, f, indent=2)

# Multiple files at once:
with open("input.txt") as src, open("output.txt", "w") as dst:
    dst.write(src.read().upper())
```

---

## 5. HTTP Sessions (Java: CloseableHttpClient)

```python
# Java: try (CloseableHttpClient client = HttpClients.createDefault()) { ... }
# Python with httpx:

import httpx

# Without context manager — connection pool never closed:
client = httpx.Client()
response = client.get(url)
# client.close() — you might forget this

# With context manager — always closes properly:
with httpx.Client(timeout=30.0) as client:
    response = client.get("https://api.openai.com/v1/models")
    data = response.json()
# client and all connections closed here

# Async HTTP (for FastAPI / async code):
import httpx

async def fetch_embeddings(texts: list[str]) -> list:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            json={"input": texts, "model": "text-embedding-3-small"},
            headers={"Authorization": f"Bearer {API_KEY}"},
        )
        return response.json()["data"]
```

---

## 6. Database Connections (Java: try-with-resources on Connection)

```python
# Java: try (Connection conn = dataSource.getConnection()) { ... }
# Python with aiosqlite (async):

import aiosqlite

async def get_user(user_id: str) -> dict | None:
    async with aiosqlite.connect("app.db") as db:          # __aenter__ opens connection
        async with db.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ) as cursor:                                        # cursor is also a context manager
            row = await cursor.fetchone()
    # db.close() and cursor.close() both called automatically
    return dict(row) if row else None

# Transaction as context manager:
async def save_progress(user_id: str, data: dict):
    async with aiosqlite.connect("app.db") as db:
        async with db:    # db as transaction context — auto commit or rollback
            await db.execute("INSERT INTO progress VALUES (?, ?)", (user_id, json.dumps(data)))
```

---

## 7. Locks (Java: synchronized / ReentrantLock)

```python
# Java: synchronized(lock) { ... }
#       lock.lock(); try { ... } finally { lock.unlock(); }

# Python threading:
import threading

_cache_lock = threading.Lock()
_cache: dict = {}

def get_or_compute(key: str) -> str:
    with _cache_lock:           # acquired on enter, released on exit (even on exception)
        if key in _cache:
            return _cache[key]
        result = expensive_compute(key)
        _cache[key] = result
        return result

# Async lock for coroutines:
import asyncio

_async_lock = asyncio.Lock()

async def safe_update(key: str, value: str):
    async with _async_lock:
        await db.set(key, value)
```

---

## 8. Temporary Resources

```python
import tempfile
from pathlib import Path

# Temp file — auto-deleted when block exits
with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
    tmp.write(uploaded_pdf_bytes)
    tmp.flush()
    text = extract_text_from_pdf(tmp.name)
# tmp file deleted here — Java: File.createTempFile() + finally { file.delete(); }

# Temp directory:
import tempfile
with tempfile.TemporaryDirectory() as tmpdir:
    # process files in tmpdir
    pass
# tmpdir and all contents deleted here
```

---

## 9. LLM Tracing Context (LangChain / AI-Specific)

```python
# LangChain uses context managers for callback tracing:
from langchain.callbacks import get_openai_callback

with get_openai_callback() as cb:
    response = llm.invoke("Summarize this CV")
    print(f"Tokens used: {cb.total_tokens}")
    print(f"Cost: ${cb.total_cost:.4f}")
# Callback context closed — tracking stops here

# Custom LLM call tracer:
@contextmanager
def llm_trace(operation: str):
    """Track token usage and latency for any LLM call."""
    tracker = {"tokens": 0, "cost": 0.0, "start": time.perf_counter()}
    try:
        yield tracker        # caller can update tracker during the block
    finally:
        elapsed = (time.perf_counter() - tracker["start"]) * 1000
        logger.info(f"LLM [{operation}]: {tracker['tokens']} tokens | ${tracker['cost']:.4f} | {elapsed:.0f}ms")

with llm_trace("parse_cv") as trace:
    response = call_llm(prompt)
    trace["tokens"] = count_tokens(response)
```

---

## 10. AI Engineering Patterns

```python
# Pattern 1: Reusable DB session context
@contextmanager
def get_db():
    """Yield a DB connection, ensure it's closed."""
    conn = create_connection(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

with get_db() as db:
    db.execute("INSERT INTO ...")

# Pattern 2: Timed LLM call for latency budget tracking
@contextmanager
def latency_budget(label: str, budget_ms: float = 2000):
    start = time.perf_counter()
    yield
    elapsed_ms = (time.perf_counter() - start) * 1000
    if elapsed_ms > budget_ms:
        logger.warning(f"{label} exceeded budget: {elapsed_ms:.0f}ms > {budget_ms}ms")

with latency_budget("retrieval", budget_ms=500):
    chunks = vector_db.search(query, top_k=10)

with latency_budget("generation", budget_ms=3000):
    response = llm.invoke(prompt)
```

---

## 11. Interview Anchor

**"How do you manage LLM API connections and resources safely in Python?"**

Say:
> "Context managers — the `with` statement. For HTTP sessions I use `with httpx.AsyncClient()` — it ensures the connection pool is properly closed even if the LLM call throws. For database ops I write a `@contextmanager` generator — `yield conn` in the try block, rollback in except, close in finally. For latency tracking I have a `with latency_budget('step', 500)` context that warns if a pipeline step exceeds its budget. This is equivalent to Java's `try-with-resources` pattern, but in Python you can apply it to anything by implementing `__enter__` and `__exit__` — not just `AutoCloseable` types."

---

## 12. Quick Reference

```python
# Class-based context manager
class CM:
    def __enter__(self): return resource
    def __exit__(self, exc_type, exc_val, exc_tb): cleanup(); return False

# Generator-based (simpler)
@contextmanager
def cm():
    setup()
    try:
        yield resource
    finally:
        cleanup()

# Usage
with cm() as res:
    use(res)

# Multiple in one line
with open("a") as a, open("b") as b:
    pass

# Async versions
async with aiohttp.ClientSession() as session: ...
async with asyncio.Lock() as lock: ...

# Java comparison
# with open()              → try-with-resources FileReader
# with db.connect()        → try-with-resources Connection
# with threading.Lock()    → synchronized block
# @contextmanager          → no Java equivalent — unique Python power
```
