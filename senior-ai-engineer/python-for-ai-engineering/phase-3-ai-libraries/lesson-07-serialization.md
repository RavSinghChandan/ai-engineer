# Python for AI Engineering — Phase 3
# Lesson 7: Serialization — JSON Encoding, Object Conversion, Schema-Safe Serialization

---

## 1. Intuition (Java Anchor)

Java serialization stack: Jackson `ObjectMapper` for JSON, `Serializable` for binary, `@JsonProperty` / `@JsonIgnore` for control.
Python serialization stack: `json` module + Pydantic + custom encoders + `dataclasses`.

The key challenge in AI engineering: Python objects like `datetime`, `UUID`, numpy `float32`, Pydantic models, dataclasses — none of these serialize to JSON by default. You must handle the conversion explicitly.

| Java | Python |
|---|---|
| `objectMapper.writeValueAsString(obj)` | `json.dumps(obj)` (only works for basic types) |
| `@JsonProperty("user_id")` | `Field(alias="user_id")` in Pydantic |
| `@JsonIgnore` | `Field(exclude=True)` in Pydantic |
| `@JsonSerialize(using=MySerializer.class)` | Custom `JSONEncoder` subclass |
| `@JsonDeserialize` | Custom `model_validator` in Pydantic |
| `objectMapper.convertValue(obj, Map.class)` | `dataclasses.asdict(obj)` / `model.model_dump()` |
| `LocalDateTime.toString()` | `datetime.isoformat()` |

---

## 2. What `json.dumps` Can and Cannot Handle

```python
import json

# Works natively (Java: all primitives + String + List + Map):
json.dumps({"name": "Ravi", "score": 85, "active": True, "tags": ["Python"]})
# '{"name": "Ravi", "score": 85, "active": true, "tags": ["Python"]}'

# FAILS — raises TypeError:
from datetime import datetime
import uuid
import numpy as np
from decimal import Decimal

json.dumps({"created_at": datetime.now()})   # TypeError: Object not serializable
json.dumps({"id": uuid.uuid4()})             # TypeError
json.dumps({"embedding": np.array([0.1])})  # TypeError
json.dumps({"price": Decimal("9.99")})       # TypeError

# Python None → JSON null (Java: null)
# Python True/False → JSON true/false (Java: boolean)
# Python list → JSON array (Java: List → array)
# Python dict → JSON object (Java: Map → object)
```

---

## 3. Custom JSON Encoder (Java: Custom Jackson Serializer)

```python
import json
import uuid
from datetime import datetime
from decimal import Decimal
import numpy as np

class AIEncoder(json.JSONEncoder):
    """Custom encoder for types common in AI engineering."""
    def default(self, obj):
        # datetime → ISO 8601 string (Java: LocalDateTime.toString())
        if isinstance(obj, datetime):
            return obj.isoformat()

        # UUID → string (Java: UUID.toString())
        if isinstance(obj, uuid.UUID):
            return str(obj)

        # Decimal → float (Java: BigDecimal.doubleValue())
        if isinstance(obj, Decimal):
            return float(obj)

        # NumPy types → Python native
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()   # array → list

        # Pydantic model → dict
        if hasattr(obj, "model_dump"):
            return obj.model_dump()

        # Dataclass → dict
        import dataclasses
        if dataclasses.is_dataclass(obj):
            return dataclasses.asdict(obj)

        # Fall through to default error
        return super().default(obj)

# Usage:
data = {
    "user_id": uuid.uuid4(),
    "created_at": datetime.now(),
    "embedding": np.array([0.1, 0.2, 0.3]),
    "score": Decimal("0.85"),
}
json_str = json.dumps(data, cls=AIEncoder, indent=2)

# Module-level convenience function (use everywhere in the project):
def to_json(obj, indent: int | None = None) -> str:
    return json.dumps(obj, cls=AIEncoder, indent=indent)
```

---

## 4. Pydantic Serialization — Production Standard

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List
import uuid

class CVProfile(BaseModel):
    user_id: str = Field(alias="userId")       # serialize as "userId" not "user_id"
    name: str
    skills: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    api_key: str = Field(exclude=True)          # NEVER included in serialization

    model_config = {"populate_by_name": True}  # accept both userId and user_id

profile = CVProfile(userId="r1", name="Ravi", skills=["Python"], api_key="secret")

# Serialize — api_key excluded automatically:
profile.model_dump()
# {"user_id": "r1", "name": "Ravi", "skills": ["Python"], "created_at": datetime(...)}

profile.model_dump(by_alias=True)
# {"userId": "r1", "name": "Ravi", ...}

profile.model_dump_json()
# '{"userId":"r1","name":"Ravi","skills":["Python"],"created_at":"2026-05-27T..."}'
# datetime auto-converted to ISO string — Pydantic handles it

# Select only specific fields:
profile.model_dump(include={"name", "skills"})
# {"name": "Ravi", "skills": ["Python"]}

# Exclude None:
profile.model_dump(exclude_none=True)
```

---

## 5. `dataclasses.asdict` — Convert Dataclass to Dict (Java: `objectMapper.convertValue`)

```python
from dataclasses import dataclass, asdict, astuple, field
from typing import List

@dataclass
class RoleMapping:
    role: str
    match_percentage: int
    matched_skills: List[str] = field(default_factory=list)
    missing_skills: List[str] = field(default_factory=list)

mapping = RoleMapping("Python Dev", 85, ["Python", "FastAPI"], ["K8s"])

# Convert to dict (Java: objectMapper.convertValue(obj, Map.class)):
d = asdict(mapping)
# {"role": "Python Dev", "match_percentage": 85, "matched_skills": [...], ...}

# Convert to tuple:
t = astuple(mapping)
# ("Python Dev", 85, ["Python", "FastAPI"], ["K8s"])

# To JSON — must go through dict first (dataclasses don't serialize directly):
import json
json_str = json.dumps(asdict(mapping))

# Or use Pydantic instead of dataclass if you need rich serialization:
# @dataclass is simpler; use Pydantic when you need validation + serialization together
```

---

## 6. Schema-Safe Serialization — LLM Output Enforcement

```python
# Problem: LLM returns JSON but you can't trust the structure
# Solution: Pydantic validates and normalizes the structure

from pydantic import BaseModel, Field, model_validator
from typing import List, Optional
import json

class RoleMappingOutput(BaseModel):
    role: str
    match_percentage: int = Field(ge=0, le=100)
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    recommendation: str = ""
    readiness_level: str = "Unknown"

    @model_validator(mode="before")
    @classmethod
    def normalize_percentage(cls, data: dict) -> dict:
        # LLM might return "85%" or 85 — normalize to int
        if isinstance(data.get("match_percentage"), str):
            data["match_percentage"] = int(data["match_percentage"].rstrip("%"))
        return data

def safe_parse_llm_output(raw: str) -> RoleMappingOutput:
    """Parse LLM JSON output with full schema validation."""
    # Step 1: extract JSON (might be wrapped in markdown)
    import re
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    json_str = match.group(1) if match else raw.strip()

    # Step 2: parse JSON
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM returned invalid JSON: {e}") from e

    # Step 3: validate schema with Pydantic
    return RoleMappingOutput.model_validate(data)

# If LLM returns wrong structure → ValidationError → handled cleanly
# If LLM wraps JSON in markdown → unwrapped automatically
# If percentage is "85%" → normalized to 85 automatically
```

---

## 7. Serializing for Redis / Cache Storage

```python
import json
import redis

r = redis.Redis()

# Store complex object in Redis — must serialize to string:
profile = {"name": "Ravi", "skills": ["Python"], "score": 0.85}

# Simple case — dict of basic types:
r.set("profile:ravi", json.dumps(profile))
data = json.loads(r.get("profile:ravi"))

# Complex case — with datetime/numpy:
from datetime import datetime
import numpy as np

cache_entry = {
    "query": "What is RAG?",
    "response": "RAG retrieves...",
    "embedding": np.array([0.1, 0.2, 0.3]),
    "cached_at": datetime.utcnow(),
    "score": np.float32(0.95),
}

# Use custom encoder:
r.set("cache:query1", to_json(cache_entry))   # our AIEncoder function from above
data = json.loads(r.get("cache:query1"))
# Note: embedding comes back as list, datetime as string — reconstruct if needed

# Pydantic model to Redis:
from pydantic import BaseModel

class CacheEntry(BaseModel):
    query: str
    response: str
    score: float

entry = CacheEntry(query="What is RAG?", response="RAG retrieves...", score=0.95)
r.set("cache:q1", entry.model_dump_json())
restored = CacheEntry.model_validate_json(r.get("cache:q1"))
```

---

## 8. Safe API Response Serialization

```python
# FastAPI serializes Pydantic models automatically — but for manual responses:
from fastapi.responses import JSONResponse

# Problem: JSONResponse uses Python's json module — fails on datetime/numpy
@app.get("/profile/{user_id}")
async def get_profile(user_id: str):
    profile = await load_profile(user_id)   # may contain datetime fields
    return JSONResponse(content=profile)    # TypeError if profile has datetime

# Solution 1: Use Pydantic response model (best approach):
class ProfileResponse(BaseModel):
    name: str
    skills: list[str]
    created_at: datetime   # Pydantic auto-serializes to ISO string

@app.get("/profile/{user_id}", response_model=ProfileResponse)
async def get_profile(user_id: str) -> ProfileResponse:
    return ProfileResponse(**await load_profile(user_id))

# Solution 2: Convert with custom encoder before JSONResponse:
@app.get("/profile/{user_id}")
async def get_profile(user_id: str):
    profile = await load_profile(user_id)
    return JSONResponse(content=json.loads(to_json(profile)))  # encode then decode to clean dict
```

---

## 9. Interview Anchor

**"How do you handle serialization of complex Python objects in an AI API response?"**

Say:
> "Two layers. For the API layer I use Pydantic response models — FastAPI reads them, validates the response structure, and serializes datetime to ISO strings, handles aliases, and excludes sensitive fields like API keys automatically. For non-API serialization — Redis cache, logging, file storage — I use a custom `JSONEncoder` subclass that handles the types common in AI: numpy `float32`, numpy arrays (`.tolist()`), `datetime` (`.isoformat()`), `UUID` (`str()`), and Pydantic models (`model_dump()`). The critical principle is schema-safe serialization for LLM output: I parse the raw LLM response through a Pydantic model before returning it — this catches wrong structures immediately instead of letting bad data propagate through the pipeline."

---

## 10. Quick Reference

```python
import json
from pydantic import BaseModel
from dataclasses import asdict

# json.dumps — basic types only
json.dumps({"k": "v", "n": 1, "b": True})

# Custom encoder for complex types
class AIEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime): return obj.isoformat()
        if isinstance(obj, uuid.UUID): return str(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, np.floating): return float(obj)
        if hasattr(obj, "model_dump"): return obj.model_dump()
        return super().default(obj)

json.dumps(data, cls=AIEncoder)

# Pydantic serialization
model.model_dump()                   # → dict
model.model_dump(exclude_none=True)  # skip None
model.model_dump(by_alias=True)      # use field aliases
model.model_dump_json()              # → JSON string (handles datetime)
Model.model_validate(dict_data)      # dict → model
Model.model_validate_json(json_str)  # JSON string → model

# Dataclass
asdict(dataclass_obj)                # → dict
json.dumps(asdict(obj))              # → JSON

# Java comparison
# json.dumps()           → objectMapper.writeValueAsString()
# json.loads()           → objectMapper.readValue()
# Custom JSONEncoder     → Custom Jackson serializer
# model.model_dump()     → objectMapper.convertValue(obj, Map.class)
# Field(exclude=True)    → @JsonIgnore
# Field(alias="userId")  → @JsonProperty("userId")
# model_validator        → @JsonDeserialize with custom deserializer
```
