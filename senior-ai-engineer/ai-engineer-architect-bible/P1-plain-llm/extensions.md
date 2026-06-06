# P1 — Extensions
### When something new comes to this pattern, add it here. This file is your living changelog.

← [Back to README](./README.md)

---

## How to use this file

When you learn something new that applies to Plain LLM:
1. Pick the right section below (or add a new one)
2. Add your entry with: what it is, when to use it, 3–5 lines of code
3. Update `flow.md` if it changes the architecture diagram
4. Update `cheatsheet.md` if it produces a new interview question

---

## SECTION A — New LLM Providers

Add entries here when you add a new provider.

### ✅ OpenAI (gpt-4o) — current default
```python
from openai import AsyncOpenAI
client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
response = await client.chat.completions.create(model="gpt-4o", ...)
answer = response.choices[0].message.content
```

### ➕ Anthropic (Claude) — add when needed
```python
from anthropic import AsyncAnthropic
client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
response = await client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{"role": "user", "content": message}],
    system=system_prompt,   # ← note: system is a separate param in Anthropic SDK
)
answer = response.content[0].text
```

### ➕ Google Gemini — add when needed
```python
import google.generativeai as genai
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.0-flash")
response = await model.generate_content_async(prompt)
answer = response.text
```

---

## SECTION B — New Prompt Techniques

Add entries here when you learn a new prompting strategy.

### ✅ Basic system + user — current default
System prompt defines role, user prompt = the message.

### ➕ Few-shot prompting
Add 2–3 examples before the real question. Dramatically improves consistency.
```python
messages = [
    {"role": "system",    "content": "You classify bug severity."},
    {"role": "user",      "content": "TypeError: NoneType is not iterable"},
    {"role": "assistant", "content": "SEVERITY: HIGH\nREASON: Null pointer, likely crash"},
    {"role": "user",      "content": "Button text not aligned correctly"},
    {"role": "assistant", "content": "SEVERITY: LOW\nREASON: UI cosmetic, no functional impact"},
    {"role": "user",      "content": req.message},   # ← real input
]
```

### ➕ Chain-of-thought
Force the model to reason before answering. Improves accuracy on complex tasks.
```python
system_prompt = """
You are a data analyst.
When given a question, THINK THROUGH IT STEP BY STEP before giving your answer.
Format: 
Thinking: [your reasoning]
Answer: [final answer]
"""
```

### ➕ Persona injection
```python
system_prompt = f"""
You are a senior {user.role} with 10 years experience in {user.domain}.
Speak as if advising a junior colleague. Be direct, not verbose.
"""
```

---

## SECTION C — New Output Formats

### ✅ Plain text — current default

### ✅ Structured output (Pydantic) — in code.py Section 7

### ➕ Streaming (token by token)
Use when UX needs real-time output (chatbot UI, long-form generation).
```python
async def stream_chat(message: str, llm: AsyncOpenAI):
    stream = await llm.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": message}],
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta   # yield each token as it arrives
```
See P5 for the full streaming pattern with SSE.

### ➕ Batch processing
Use when you have many items to process (no user waiting for response).
```python
import asyncio
results = await asyncio.gather(*[
    call_llm(item) for item in items
])
```
Add a semaphore to avoid hitting rate limits:
```python
sem = asyncio.Semaphore(10)  # max 10 concurrent calls
async with sem:
    result = await call_llm(item)
```

---

## SECTION D — New Infrastructure Add-ons

### ➕ Redis rate limiting (slot in code.py Section 6)
```python
import redis.asyncio as redis

async def is_rate_limited(user_id: str, limit: int = 100) -> bool:
    key = f"ratelimit:{user_id}"
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, 3600)   # 1 hour window
    return count > limit
```

### ➕ Cost tracking per request
```python
COST_PER_1K = {"gpt-4o": 0.005, "gpt-4o-mini": 0.0001}

def calculate_cost(tokens: int, model: str) -> float:
    return (tokens / 1000) * COST_PER_1K.get(model, 0)
```

### ➕ Prompt caching (OpenAI)
For system prompts > 1024 tokens that don't change, OpenAI caches automatically.
Mark stable parts as the prefix of your system prompt for max cache hits.

---

## SECTION E — Future patterns that grow out of P1

When these come up, they get their own folder. This is how P1 evolves:

| What you add to P1 | It becomes |
|---|---|
| + Vector search for context | → P2 (RAG) |
| + Tool/function calls | → P3 (Agent) |
| + Conversation history storage | → P4 (Memory) |
| + Real-time streaming + job queue | → P5 (Streaming+Async) |

P1 is always at the core. Every other pattern wraps around it.

---

← [Back to README](./README.md) | [→ Cheatsheet](./cheatsheet.md)
