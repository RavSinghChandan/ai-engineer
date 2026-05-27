# Python for AI Engineering — Phase 3
# Lesson 4: Pydantic

---

## 1. Intuition (Java Anchor)

Java: Bean Validation (`@NotNull`, `@Min`, `@Max`, `@Pattern`) + Jackson (`@JsonProperty`, `@JsonIgnore`) + Lombok (`@Data`, `@Builder`).
Pydantic replaces ALL THREE in one library.

| Java | Pydantic |
|---|---|
| Lombok `@Data` (fields + getters + equals) | `BaseModel` |
| `@NotNull`, `@Min`, `@Max` | Field validators, type hints |
| Jackson `ObjectMapper.readValue(json, Cls)` | `Model.model_validate(dict)` |
| Jackson `objectMapper.writeValueAsString(obj)` | `model.model_dump_json()` |
| `@JsonProperty("user_id")` | `Field(alias="user_id")` |
| `@Builder` | keyword args in `__init__` (auto-generated) |
| `@Valid` on method param | `BaseModel` subclass as FastAPI param |

FastAPI uses Pydantic for **every request body, response model, and config** — you cannot use FastAPI professionally without knowing Pydantic.

---

## 2. BaseModel — Core (Java: Lombok `@Data` + Bean Validation)

```python
from pydantic import BaseModel, Field
from typing import Optional, List

# Java Lombok + Bean Validation:
# @Data
# public class CVProfile {
#     @NotBlank private String name;
#     @Email    private String email;
#     @Min(0)   private int experienceYears;
# }

# Python Pydantic — everything in one class:
class CVProfile(BaseModel):
    name: str                          # required, must be str
    email: str                         # required
    experience_years: int              # required, auto-cast from string
    skills: List[str] = []             # optional, defaults to empty list
    education: Optional[str] = None    # optional, None by default

# Creating an instance:
profile = CVProfile(
    name="Ravi Singh",
    email="ravi@example.com",
    experience_years=5,
    skills=["Python", "FastAPI"],
)

# Auto-generated __repr__:
print(profile)
# CVProfile(name='Ravi Singh', email='ravi@example.com', experience_years=5, ...)

# Attribute access:
print(profile.name)               # "Ravi Singh"
print(profile.experience_years)   # 5

# Immutable by default in Pydantic v2 (like Java record):
profile.name = "New Name"   # works in v2 (mutable by default), use model_config for frozen
```

---

## 3. Validation — Field Constraints (Java: `@Min`, `@Max`, `@Size`, `@Pattern`)

```python
from pydantic import BaseModel, Field, field_validator, EmailStr
from typing import List

class CVProfile(BaseModel):
    name: str        = Field(min_length=2, max_length=100)    # Java: @Size(min=2,max=100)
    email: str       = Field(pattern=r"^[\w.-]+@[\w.-]+\.\w+$")  # Java: @Pattern
    experience_years: int = Field(ge=0, le=50)                # Java: @Min(0) @Max(50)
    match_score: float    = Field(ge=0.0, le=100.0)
    skills: List[str]     = Field(default=[], max_length=50)  # max 50 skills

    # Custom validator — Java: custom @Constraint annotation
    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank")
        return v.strip()   # transform + validate in one step

    @field_validator("skills")
    @classmethod
    def skills_must_be_non_empty_strings(cls, skills: list) -> list:
        return [s.strip() for s in skills if s.strip()]   # clean + filter

# Validation happens at instantiation — raises ValidationError if invalid:
try:
    bad = CVProfile(name="", email="not-an-email", experience_years=-1, match_score=150)
except ValidationError as e:
    print(e)
# Multiple validation errors reported together — like Spring @Valid
```

---

## 4. Parsing from Dict / JSON (Java: Jackson `ObjectMapper.readValue`)

```python
from pydantic import BaseModel

class RoleMapping(BaseModel):
    role: str
    match_percentage: int
    matched_skills: list[str]
    missing_skills: list[str]
    recommendation: str

# From dict (Java: objectMapper.convertValue(map, RoleMapping.class)):
data = {
    "role": "Senior Python Developer",
    "match_percentage": 85,
    "matched_skills": ["Python", "FastAPI"],
    "missing_skills": ["Kubernetes"],
    "recommendation": "Strong candidate",
}
mapping = RoleMapping.model_validate(data)    # Pydantic v2
# mapping = RoleMapping(**data)               # also works

# From JSON string (Java: objectMapper.readValue(jsonStr, RoleMapping.class)):
json_str = '{"role": "Python Dev", "match_percentage": 85, ...}'
mapping = RoleMapping.model_validate_json(json_str)

# From LLM response — most common AI engineering pattern:
llm_response = llm.invoke(prompt)    # returns JSON string
mapping = RoleMapping.model_validate_json(llm_response.content)
```

---

## 5. Serialization to Dict / JSON (Java: Jackson `objectMapper.writeValueAsString`)

```python
# To dict (Java: objectMapper.convertValue(obj, Map.class)):
data_dict = mapping.model_dump()
# {"role": "Senior Python Developer", "match_percentage": 85, ...}

# Exclude None fields (Java: @JsonInclude(NON_NULL)):
data_dict = mapping.model_dump(exclude_none=True)

# Include only specific fields:
data_dict = mapping.model_dump(include={"role", "match_percentage"})

# To JSON string (Java: objectMapper.writeValueAsString(obj)):
json_str = mapping.model_dump_json()
json_str = mapping.model_dump_json(indent=2)   # pretty print

# Use in FastAPI response — Pydantic models serialize automatically:
@app.get("/mapping/{user_id}", response_model=RoleMapping)
async def get_mapping(user_id: str) -> RoleMapping:
    return mapping   # FastAPI calls .model_dump() automatically
```

---

## 6. Nested Models (Java: Nested POJOs / Jackson nested objects)

```python
from pydantic import BaseModel
from typing import List, Optional

class Project(BaseModel):
    name: str
    tech_stack: List[str] = []
    duration_months: Optional[int] = None

class CVProfile(BaseModel):
    name: str
    email: str
    experience_years: int
    skills: List[str] = []
    projects: List[Project] = []    # nested model list

# Parse nested data from LLM output:
data = {
    "name": "Ravi",
    "email": "ravi@x.com",
    "experience_years": 5,
    "skills": ["Python"],
    "projects": [
        {"name": "Bench Optimizer", "tech_stack": ["Python", "FastAPI"], "duration_months": 6},
        {"name": "AstroIntel", "tech_stack": ["Angular", "Python"]},
    ]
}
profile = CVProfile.model_validate(data)
print(profile.projects[0].name)    # "Bench Optimizer"
print(profile.projects[0].tech_stack)   # ["Python", "FastAPI"]
```

---

## 7. FastAPI Integration — Request + Response Models

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1)
    password: str = Field(min_length=6)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

# FastAPI reads type hints — validates request body automatically:
@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest) -> TokenResponse:
    # req.user_id and req.password are already validated
    # If invalid — FastAPI returns 422 automatically (like @Valid + @ExceptionHandler)
    token = create_jwt(req.user_id)
    return TokenResponse(access_token=token, expires_in=86400)

# response_model=TokenResponse:
# - filters out fields not in TokenResponse (like @JsonIgnore)
# - validates the response before sending
# Java: @RequestBody @Valid LoginRequest req → same concept
```

---

## 8. Model Configuration (Java: Jackson `@JsonProperty`, `@JsonIgnore`)

```python
from pydantic import BaseModel, Field
from pydantic import model_validator

class UserConfig(BaseModel):
    model_config = {"populate_by_name": True}   # allow both alias and field name

    user_id: str = Field(alias="userId")         # Java: @JsonProperty("userId")
    api_key: str = Field(exclude=True)           # Java: @JsonIgnore — never serialized
    role: str = "user"

    # Cross-field validation (Java: class-level @AssertTrue):
    @model_validator(mode="after")
    def admin_needs_key(self) -> "UserConfig":
        if self.role == "admin" and not self.api_key:
            raise ValueError("Admin users must have an API key")
        return self

# Immutable model (Java: record — no setters):
class ImmutableConfig(BaseModel):
    model_config = {"frozen": True}   # like Java record
    model: str
    temperature: float = 0.2

cfg = ImmutableConfig(model="gpt-4o")
cfg.model = "claude"   # raises ValidationError — immutable
```

---

## 9. Schema Generation (Java: Swagger/OpenAPI annotations)

```python
# Pydantic generates JSON Schema automatically — FastAPI uses this for Swagger UI
# Java: @Schema(description="..."), @ApiModel, @ApiModelProperty

class CVProfile(BaseModel):
    """CV profile extracted from uploaded resume."""  # shows in Swagger

    name: str = Field(description="Full name of the candidate")
    email: str = Field(description="Contact email address")
    experience_years: int = Field(ge=0, description="Years of professional experience")
    skills: list[str] = Field(default=[], description="List of technical skills")

# Generate JSON Schema:
print(CVProfile.model_json_schema())
# {
#   "title": "CVProfile",
#   "description": "CV profile extracted from uploaded resume.",
#   "properties": {
#     "name": {"type": "string", "description": "Full name of the candidate"},
#     ...
#   }
# }

# FastAPI exposes this at /docs (Swagger UI) automatically
# Java: Springdoc OpenAPI reads @Schema annotations — Pydantic is cleaner
```

---

## 10. AI Engineering Patterns

```python
# Pattern 1: Enforce LLM JSON output shape
class RoleMappingOutput(BaseModel):
    """Schema enforced on LLM output — if LLM returns wrong shape, we know immediately."""
    role: str
    match_percentage: int = Field(ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
    recommendation: str
    readiness_level: str = Field(pattern=r"^(Low|Medium|High|Expert)$")

def parse_llm_output(raw: str) -> RoleMappingOutput:
    try:
        return RoleMappingOutput.model_validate_json(raw)
    except ValidationError as e:
        raise ValueError(f"LLM returned invalid structure: {e}") from e

# Pattern 2: Pydantic for config validation at startup
class AppConfig(BaseModel):
    jwt_secret: str = Field(min_length=32)
    deepseek_api_key: str = Field(min_length=10)
    redis_url: str = "redis://localhost:6379"
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|ERROR)$")

# If any required field is missing or invalid — fails at startup, not at runtime
config = AppConfig(
    jwt_secret=os.environ["JWT_SECRET"],
    deepseek_api_key=os.environ["DEEPSEEK_API_KEY"],
)
```

---

## 11. Interview Anchor

**"How does Pydantic replace multiple Java libraries in your AI service?"**

Say:
> "Three Java libraries in one. Lombok `@Data` — Pydantic `BaseModel` auto-generates `__init__`, `__repr__`, `__eq__`. Bean Validation `@NotNull/@Min/@Max` — Pydantic `Field(ge=0, le=100)` and `@field_validator`. Jackson `ObjectMapper` — `model_validate(dict)` for parsing and `model_dump_json()` for serialization. FastAPI reads Pydantic models to generate Swagger docs and validate request bodies automatically — like Spring's `@Valid` + Springdoc combined. The key advantage: one class definition gives you validation, serialization, schema, and IDE type safety — in Java you'd have four separate annotations and two separate libraries."

---

## 12. Quick Reference

```python
from pydantic import BaseModel, Field, field_validator

# Define
class Model(BaseModel):
    required_str: str
    optional_int: int = 0
    constrained: float = Field(ge=0.0, le=1.0)
    aliased: str = Field(alias="camelCase")

# Validate input (Java: objectMapper.readValue / @Valid)
obj = Model.model_validate(dict_data)
obj = Model.model_validate_json(json_string)
obj = Model(**kwargs)

# Serialize (Java: objectMapper.writeValueAsString)
obj.model_dump()                      # → dict
obj.model_dump(exclude_none=True)     # skip None fields
obj.model_dump_json()                 # → JSON string
obj.model_dump_json(indent=2)         # pretty

# Validate
try:
    Model(required_str="")
except ValidationError as e:
    print(e.errors())                 # list of error dicts

# Custom validator
@field_validator("field_name")
@classmethod
def validate_fn(cls, v): ...

# Cross-field validator
@model_validator(mode="after")
def cross_validate(self): ...

# Immutable
model_config = {"frozen": True}

# Java comparison
# BaseModel           → @Data (Lombok)
# Field(ge=0,le=100)  → @Min(0) @Max(100)
# model_validate()    → objectMapper.readValue()
# model_dump_json()   → objectMapper.writeValueAsString()
# field_validator     → custom @Constraint
# response_model=     → @Valid on @ResponseBody
```
