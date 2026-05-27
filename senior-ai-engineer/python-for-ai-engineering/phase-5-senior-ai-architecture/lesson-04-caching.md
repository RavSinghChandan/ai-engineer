# Python for AI Engineering — Phase 5
# Lesson 4: Caching — In-Memory, Redis, Semantic Cache

---

## 1. Intuition (Java Anchor)

Java: `@Cacheable` / `@CacheEvict` from Spring Cache, Guava `LoadingCache`, Redis via Spring Data Redis.
Python: `functools.lru_cache` for in-process, Redis via `redis-py` for distributed, custom semantic cache for LLM responses.

Caching is critical in AI services: an LLM call costs $0.003–$0.03 and takes 1–5 seconds. If the same query is asked 100 times, you pay once and serve 99 times from cache.

| Java Pattern | Python Equivalent |
|---|---|
| `@Cacheable("cvs")` | `@lru_cache` / Redis GET |
| `@CacheEvict("cvs")` | `cache.pop(key)` / Redis DEL |
| `@CachePut` | Redis SET with TTL |
| Guava `LoadingCache` | `cachetools.TTLCache` |
| `CacheManager` bean | Redis client singleton |
| Spring Data Redis `RedisTemplate` | `redis.asyncio.Redis` |
| `StringRedisSerializer` | `json.dumps()` / `json.loads()` |
| Cache key: `@Cacheable(key="#userId")` | `f"profile:{user_id}"` |

---

## 2. In-Process Cache — `lru_cache` and `TTLCache`

```python
from functools import lru_cache
import time

# lru_cache: memoize function results — no expiry (Java: Guava Cache.forever())
@lru_cache(maxsize=256)
def get_role_definition(role_id: str) -> dict:
    """Cache role definitions — they rarely change."""
    return load_role_from_file(role_id)

# TTLCache: cache with expiry — pip install cachetools
from cachetools import TTLCache
import asyncio

# Module-level cache (Java: @Bean CacheManager with TTL):
_embedding_cache: TTLCache = TTLCache(maxsize=1000, ttl=3600)   # 1 hour TTL
_cache_lock = asyncio.Lock()

async def get_embedding_cached(text: str) -> list[float]:
    """Cache expensive embedding calls."""
    key = hash(text)   # simple hash key

    if key in _embedding_cache:
        return _embedding_cache[key]

    async with _cache_lock:   # prevent duplicate computation (stampede)
        if key in _embedding_cache:   # double-check after acquiring lock
            return _embedding_cache[key]

        embedding = await compute_embedding(text)
        _embedding_cache[key] = embedding
        return embedding

# Limitations of in-process cache:
# - Lost on restart
# - Not shared between multiple server instances
# - Grows unbounded if not sized carefully
# Use Redis for distributed / durable caching
```

---

## 3. Redis Cache — Distributed (Java: Spring Data Redis)

```python
# pip install redis
import redis.asyncio as aioredis
import json
from typing import Any

class RedisCache:
    """
    Async Redis cache wrapper.
    Java: RedisTemplate<String, String> injected by Spring.
    """
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def get(self, key: str) -> Any | None:
        value = await self._redis.get(key)
        if value is None:
            return None
        return json.loads(value)

    async def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> None:
        await self._redis.setex(key, ttl_seconds, json.dumps(value))

    async def delete(self, key: str) -> None:
        await self._redis.delete(key)

    async def exists(self, key: str) -> bool:
        return bool(await self._redis.exists(key))

    async def get_or_compute(
        self,
        key: str,
        compute_fn,      # async callable
        ttl_seconds: int = 3600,
    ) -> Any:
        """Cache-aside pattern — Java: @Cacheable equivalent."""
        cached = await self.get(key)
        if cached is not None:
            return cached
        result = await compute_fn()
        await self.set(key, result, ttl_seconds)
        return result

# Key naming conventions:
# "profile:{user_id}"           → user profiles
# "embedding:{text_hash}"       → embedding vectors
# "llm:{prompt_hash}"           → LLM responses
# "role:{role_id}"              → role definitions
# "session:{session_id}"        → JWT sessions

# Usage:
cache = RedisCache()

async def get_profile_cached(user_id: str) -> dict:
    return await cache.get_or_compute(
        key=f"profile:{user_id}",
        compute_fn=lambda: load_profile_from_db(user_id),
        ttl_seconds=300,   # 5 minutes
    )
```

---

## 4. LLM Response Cache

```python
import hashlib
import json

def prompt_hash(messages: list[dict], model: str, temperature: float) -> str:
    """
    Stable hash for LLM call parameters — same inputs → same cache key.
    Java: Objects.hash(messages, model, temperature) but stable across restarts.
    """
    canonical = json.dumps({
        "messages": messages,
        "model": model,
        "temperature": temperature,
    }, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]

class CachingLLMService:
    """
    LLM service with Redis response cache.
    Cache hit: ~1ms, $0. Cache miss: 1–5s, $0.003–$0.03.
    """
    def __init__(self, llm_client, cache: RedisCache, cache_ttl: int = 3600):
        self._client = llm_client
        self._cache = cache
        self._ttl = cache_ttl

    async def complete(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.0,   # only cache deterministic calls (temp=0)
        use_cache: bool = True,
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        # Only cache deterministic responses:
        if use_cache and temperature == 0.0:
            cache_key = f"llm:{prompt_hash(messages, self._client.model, temperature)}"
            cached = await self._cache.get(cache_key)
            if cached:
                return cached["content"]

        response = await self._client.chat.completions.create(
            model=self._client.model,
            messages=messages,
            temperature=temperature,
        )
        content = response.choices[0].message.content

        if use_cache and temperature == 0.0:
            await self._cache.set(cache_key, {"content": content}, self._ttl)

        return content
```

---

## 5. Semantic Cache — Cache by Similarity

```python
# Problem: exact cache hits miss similar queries.
# "Python developer 5 years" and "5yr Python engineer" should get the same cached answer.
# Solution: embed the query, search the cache by vector similarity.
# Java: no standard equivalent — custom implementation.

import numpy as np
from dataclasses import dataclass

@dataclass
class SemanticCacheEntry:
    query: str
    response: str
    embedding: list[float]

class SemanticCache:
    """
    Cache that returns stored responses for semantically similar queries.
    Hit threshold: cosine similarity ≥ 0.95.
    """
    def __init__(self, similarity_threshold: float = 0.95):
        self._entries: list[SemanticCacheEntry] = []
        self._threshold = similarity_threshold

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        va = np.array(a)
        vb = np.array(b)
        return float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb)))

    async def get(self, query: str) -> str | None:
        query_embedding = await compute_embedding(query)
        for entry in self._entries:
            sim = self._cosine_similarity(query_embedding, entry.embedding)
            if sim >= self._threshold:
                return entry.response
        return None

    async def set(self, query: str, response: str) -> None:
        embedding = await compute_embedding(query)
        self._entries.append(SemanticCacheEntry(query, response, embedding))

    async def get_or_compute(self, query: str, compute_fn) -> str:
        cached = await self.get(query)
        if cached:
            return cached
        result = await compute_fn()
        await self.set(query, result)
        return result
```

---

## 6. Cache Patterns in Embedding Pipelines

```python
# Don't re-embed text that hasn't changed.
# Cache embeddings by content hash — if the text changes, the hash changes.

import hashlib

def content_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()

async def get_embedding_with_cache(text: str, cache: RedisCache) -> list[float]:
    key = f"embedding:{content_hash(text)}"
    cached = await cache.get(key)
    if cached:
        return cached

    response = await async_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    embedding = response.data[0].embedding
    await cache.set(key, embedding, ttl_seconds=86400 * 7)   # 7 days
    return embedding

# Batch cache check — only embed uncached texts:
async def batch_embed_with_cache(
    texts: list[str],
    cache: RedisCache,
) -> list[list[float]]:
    results = [None] * len(texts)
    uncached_indices = []

    # Check cache for each text:
    for i, text in enumerate(texts):
        key = f"embedding:{content_hash(text)}"
        cached = await cache.get(key)
        if cached:
            results[i] = cached
        else:
            uncached_indices.append(i)

    if not uncached_indices:
        return results   # 100% cache hit

    # Embed only uncached texts:
    uncached_texts = [texts[i] for i in uncached_indices]
    new_embeddings = embed_batch(uncached_texts)

    # Store new embeddings in cache and fill results:
    for idx, embedding in zip(uncached_indices, new_embeddings):
        key = f"embedding:{content_hash(texts[idx])}"
        await cache.set(key, embedding, ttl_seconds=86400 * 7)
        results[idx] = embedding

    return results
```

---

## 7. Interview Anchor

**"How do you implement caching in a Python AI service?"**

Say:
> "Three tiers. In-process `lru_cache` for static data that never changes — role definitions, model metadata — it's zero-latency and zero-infra. Redis for distributed LLM response caching — I hash the prompt, model, and temperature into a 16-char cache key and store the response with a 1-hour TTL. This cuts both cost and latency dramatically: cache hit is 1ms and free, cache miss is 2–5 seconds and costs money. I only cache deterministic calls — `temperature=0.0` — because caching a creative response would return stale creative output. For embedding pipelines, I cache by content hash so re-uploading the same CV doesn't trigger a re-embed — embeddings are stored with a 7-day TTL. The advanced pattern is a semantic cache: embed the incoming query, compute cosine similarity against cached entries, and return a cached answer if similarity ≥ 0.95. This catches paraphrases like 'Python developer 5 years' and '5yr Python engineer' as the same query."

---

## 8. Quick Reference

```python
# In-process lru_cache
from functools import lru_cache
@lru_cache(maxsize=256)
def get_role(role_id: str) -> dict: ...

# TTL cache (cachetools)
from cachetools import TTLCache
cache = TTLCache(maxsize=1000, ttl=3600)
cache[key] = value; value = cache[key]

# Redis async
import redis.asyncio as aioredis
r = aioredis.from_url("redis://localhost:6379", decode_responses=True)
await r.setex(key, ttl, json.dumps(value))  # SET with TTL
value = json.loads(await r.get(key) or "null")
await r.delete(key)

# Cache-aside pattern
async def get_or_compute(key, fn, ttl):
    if cached := await cache.get(key): return cached
    result = await fn()
    await cache.set(key, result, ttl)
    return result

# LLM cache key
key = f"llm:{hashlib.sha256(json.dumps(messages).encode()).hexdigest()[:16]}"

# Embedding cache key
key = f"embedding:{hashlib.md5(text.encode()).hexdigest()}"

# Semantic cache
sim = np.dot(a, b) / (norm(a) * norm(b))  # cosine similarity
if sim >= 0.95: return cached_response

# Java comparison
# @Cacheable             → get_or_compute(key, fn, ttl)
# @CacheEvict            → await r.delete(key)
# @CachePut              → await r.setex(key, ttl, value)
# Guava LoadingCache     → TTLCache(maxsize, ttl)
# @lru_cache             → Guava Cache with no expiry
# RedisTemplate          → aioredis.from_url(...)
# cache key "#userId"    → f"profile:{user_id}"
```
