# Python for AI Engineering — Phase 1
# Lesson 6: Comprehensions

---

## 1. Intuition (Java Anchor)

Java Stream API (Java 8+) gives you `.filter()`, `.map()`, `.collect()` — powerful but verbose.
Python comprehensions do the same in **one readable line** — no method chaining, no lambda, no `Collectors.toList()`.

| Java Stream | Python Comprehension |
|---|---|
| `list.stream().map(f).collect(toList())` | `[f(x) for x in list]` |
| `list.stream().filter(p).collect(toList())` | `[x for x in list if p(x)]` |
| `list.stream().map(f).filter(p).collect(toList())` | `[f(x) for x in list if p(x)]` |

---

## 2. List Comprehension

```python
# Java: list.stream().map(s -> s.upper()).collect(Collectors.toList())
# Python:
skills = ["python", "fastapi", "docker"]
upper  = [s.upper() for s in skills]
# ["PYTHON", "FASTAPI", "DOCKER"]

# With filter — Java: .filter(s -> s.startsWith("p"))
p_skills = [s for s in skills if s.startswith("p")]
# ["python"]

# Transform + filter together
long_upper = [s.upper() for s in skills if len(s) > 5]
# ["PYTHON", "FASTAPI", "DOCKER"]

# Numbers — Java: IntStream.range(0,10).map(x -> x*x).collect(...)
squares = [x ** 2 for x in range(10)]
# [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

# From dict values
scores = {"ravi": 85, "priya": 72, "amit": 91}
passing = [name for name, score in scores.items() if score >= 80]
# ["ravi", "amit"]
```

---

## 3. Dict Comprehension

```python
# Java: map.entrySet().stream().filter(...).collect(Collectors.toMap(...))
# Python — one line:

scores = {"ravi": 85, "priya": 72, "amit": 91, "neha": 65}

# Invert dict (value → key)
inverted = {v: k for k, v in scores.items()}
# {85: "ravi", 72: "priya", 91: "amit", 65: "neha"}

# Filter — only high scorers
high = {k: v for k, v in scores.items() if v >= 80}
# {"ravi": 85, "amit": 91}

# Transform values
normalized = {k: v / 100 for k, v in scores.items()}
# {"ravi": 0.85, "priya": 0.72, ...}

# Build from two lists (zip)
models = ["gpt-4o", "claude", "deepseek"]
costs  = [0.01, 0.008, 0.001]
price_map = {m: c for m, c in zip(models, costs)}
# {"gpt-4o": 0.01, "claude": 0.008, "deepseek": 0.001}

# AI engineering: build chunk ID → chunk text lookup
chunk_map = {chunk.id: chunk.text for chunk in retrieved_chunks}
```

---

## 4. Set Comprehension

```python
# Unique values from a collection — Java: stream().collect(Collectors.toSet())

cvs = [
    {"name": "Ravi",  "skills": ["Python", "FastAPI", "Docker"]},
    {"name": "Priya", "skills": ["Python", "Kubernetes", "Docker"]},
]

# All unique skills across all CVs
all_skills = {skill for cv in cvs for skill in cv["skills"]}
# {"Python", "FastAPI", "Docker", "Kubernetes"}

# Unique model names from a list that may have duplicates
used_models = {call["model"] for call in api_logs if call["status"] == "success"}
```

---

## 5. Nested Comprehensions (Flatten)

```python
# Flatten a list of lists — Java: stream().flatMap(Collection::stream).collect(toList())

matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flat   = [x for row in matrix for x in row]
# [1, 2, 3, 4, 5, 6, 7, 8, 9]

# Flatten skills from all CVs
all_cvs = [
    {"skills": ["Python", "FastAPI"]},
    {"skills": ["Docker", "Python"]},
]
all_skills_flat = [skill for cv in all_cvs for skill in cv["skills"]]
# ["Python", "FastAPI", "Docker", "Python"]

# Nested with filter
all_skills_long = [skill for cv in all_cvs for skill in cv["skills"] if len(skill) > 5]

# 2D comprehension — create a matrix
# Java: 2 nested for loops with new ArrayList per row
grid = [[row * col for col in range(5)] for row in range(5)]
# [[0,0,0,0,0], [0,1,2,3,4], [0,2,4,6,8], ...]
```

---

## 6. Filtering + Transformation Patterns (AI Engineering)

```python
# Pattern 1: Extract structured fields from LLM batch responses
responses = [
    {"status": "ok", "content": "Python is great", "tokens": 50},
    {"status": "error", "content": None, "tokens": 0},
    {"status": "ok", "content": "FastAPI is fast", "tokens": 40},
]

valid_content = [r["content"] for r in responses if r["status"] == "ok"]
# ["Python is great", "FastAPI is fast"]

# Pattern 2: Build prompt batch from user queries
queries = ["What is RAG?", "  ", "Explain embeddings", ""]
clean_prompts = [
    f"Answer concisely: {q.strip()}"
    for q in queries
    if q.strip()   # filter out blank/whitespace
]

# Pattern 3: Score filtering from role mapping results
mappings = [
    {"role": "Python Dev", "match": 85, "gaps": ["K8s"]},
    {"role": "Java Dev",   "match": 40, "gaps": ["Python", "FastAPI"]},
    {"role": "DevOps",     "match": 72, "gaps": ["Terraform"]},
]
strong_matches = [m["role"] for m in mappings if m["match"] >= 70]
# ["Python Dev", "DevOps"]

# Pattern 4: Chunk preprocessing pipeline
raw_chunks = get_retrieved_chunks(query)
processed  = [
    {"id": c.id, "text": c.text.strip(), "score": c.score}
    for c in raw_chunks
    if c.text.strip() and c.score > 0.5    # filter empty and low-score
]
```

---

## 7. When NOT to Use Comprehensions

```python
# Rule: if it needs more than one line of logic — use a for loop
# Comprehensions are for simple transform + filter, not complex logic

# BAD — too complex for comprehension:
result = [
    process(item) if item.score > 0.8
    else fallback(item) if item.score > 0.5
    else None
    for item in items
    if item is not None and hasattr(item, "score")
]

# GOOD — use a loop for complex logic:
result = []
for item in items:
    if item is None or not hasattr(item, "score"):
        continue
    if item.score > 0.8:
        result.append(process(item))
    elif item.score > 0.5:
        result.append(fallback(item))

# Senior rule: comprehensions are for readability — stop when they hurt readability
```

---

## 8. Interview Anchor

**"How do you process a batch of LLM responses in Python?"**

Say:
> "Comprehensions — clean and readable. If I have a list of response objects and need the text from only the successful ones, it's `[r.content for r in responses if r.status == 'ok']`. That's one line vs five lines of Java stream operations with Collectors. For more complex transformations — say, conditional branching per item — I switch to a for loop because readability matters more than conciseness. The senior judgment is knowing when comprehensions help vs when they obscure."

---

## 9. Quick Reference

```python
# List comprehension
[expr for x in iterable]
[expr for x in iterable if condition]

# Dict comprehension
{k_expr: v_expr for k, v in iterable.items()}
{k: v for k, v in d.items() if condition}

# Set comprehension
{expr for x in iterable}

# Nested (flatten)
[x for row in matrix for x in row]

# Java comparison
# [f(x) for x in list]           →  list.stream().map(f).collect(toList())
# [x for x in list if p(x)]      →  list.stream().filter(p).collect(toList())
# {k: v for k,v in d.items()}    →  map.entrySet().stream()...toMap()
```
