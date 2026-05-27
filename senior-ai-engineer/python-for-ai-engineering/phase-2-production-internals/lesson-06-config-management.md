# Python for AI Engineering — Phase 2
# Lesson 6: Config Management

---

## 1. Intuition (Java Anchor)

Java: `application.properties` / `application.yml` + Spring `@Value("${key}")` + `@ConfigurationProperties`.
Python: `.env` files + `os.getenv()` + `pydantic-settings` `BaseSettings`.

| Java Spring | Python |
|---|---|
| `application.properties` | `.env` file |
| `@Value("${jwt.secret}")` | `os.getenv("JWT_SECRET")` |
| `@ConfigurationProperties` | Pydantic `BaseSettings` class |
| Spring Profiles (dev/prod) | `.env.dev`, `.env.prod` + `python-dotenv` |
| `Environment.getProperty()` | `os.environ["KEY"]` |
| `@NotNull` on config field | `BaseSettings` with no default → raises on missing |

The golden rule (same in Java and Python): **no secrets in code, everything from environment variables.**

---

## 2. `os.environ` and `os.getenv` (Java: `System.getenv`)

```python
import os

# Java: System.getenv("JWT_SECRET")
# Python:

# Option 1: os.environ["KEY"] — raises KeyError if missing (like Java required env)
jwt_secret = os.environ["JWT_SECRET"]         # fails immediately if not set

# Option 2: os.getenv("KEY") — returns None if missing (like Java Optional.empty())
jwt_secret = os.getenv("JWT_SECRET")          # None if not set

# Option 3: os.getenv("KEY", "default") — with fallback
log_level = os.getenv("LOG_LEVEL", "INFO")    # "INFO" if not set

# Reading all env vars (Java: System.getenv() returns Map<String, String>)
all_env = dict(os.environ)                    # dict of all env vars

# Setting env vars in code (testing only — not for production secrets)
os.environ["TEST_MODE"] = "true"
```

---

## 3. `python-dotenv` — Loading `.env` Files (Java: Spring `@PropertySource`)

```python
# .env file (never committed to git):
# JWT_SECRET=my-strong-secret-key-32chars
# DEEPSEEK_API_KEY=sk-abc123
# REDIS_URL=redis://localhost:6379
# LOG_LEVEL=INFO

from dotenv import load_dotenv

# Load .env file into os.environ (call once at app startup)
load_dotenv()                        # loads .env from current directory

# Explicit path:
load_dotenv("/path/to/.env.prod")

# Override=True: .env values override existing env vars
load_dotenv(override=True)

# After load_dotenv(), access normally via os.getenv():
import os
jwt_secret = os.getenv("JWT_SECRET")

# In FastAPI main.py — always at the top before any other imports:
from dotenv import load_dotenv
load_dotenv()    # must be before importing modules that read env vars
```

---

## 4. Pydantic `BaseSettings` — Typed Config (Java: `@ConfigurationProperties`)

```python
# Java @ConfigurationProperties:
# @ConfigurationProperties(prefix = "llm")
# public class LLMConfig { private String apiKey; private String model; }

# Python pydantic-settings — same idea, much cleaner:
# pip install pydantic-settings

from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    # Required — raises ValidationError at startup if not in env
    jwt_secret: str
    deepseek_api_key: str

    # Optional with defaults
    log_level: str = "INFO"
    jwt_expiry_seconds: int = 86400
    redis_url: str = "redis://localhost:6379"
    deepseek_model: str = "deepseek-chat"
    cors_origins: str = "http://localhost:4200"

    # Nested validation
    admin_password: str = Field(min_length=8)   # validates length

    class Config:
        env_file = ".env"           # auto-loads .env
        env_file_encoding = "utf-8"
        case_sensitive = False      # JWT_SECRET and jwt_secret both work

# Instantiate once — raises at startup if required vars missing:
settings = Settings()

# Access with type safety (IDE knows the types):
print(settings.jwt_secret)          # str — IDE autocompletes
print(settings.jwt_expiry_seconds)  # int — auto-cast from string env var
print(settings.log_level)           # str
```

---

## 5. Singleton Settings Pattern (Java: `@Bean` Singleton)

```python
# Java Spring: Settings bean is singleton by default
# Python: use module-level instance or functools.lru_cache

# Option 1: Module-level singleton (simplest)
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    jwt_secret: str
    deepseek_api_key: str
    log_level: str = "INFO"
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"

settings = Settings()    # created once when module is imported

# Use anywhere:
from config import settings
print(settings.jwt_secret)

# Option 2: Lazy singleton with lru_cache (Java: lazy @Bean)
from functools import lru_cache

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()    # created once, cached forever

# FastAPI dependency injection pattern:
from fastapi import Depends

@app.get("/health")
def health(settings: Settings = Depends(get_settings)):
    return {"model": settings.deepseek_model}
```

---

## 6. Environment-Specific Config (Java: Spring Profiles)

```python
# Java: application-dev.properties, application-prod.properties
#       activated by: spring.profiles.active=prod

# Python equivalent: multiple .env files + ENV var to select

# .env.dev   → development (uses local Redis, weak JWT secret)
# .env.prod  → production (uses cloud Redis, strong JWT secret)
# .env.ci    → CI/CD (mocked APIs, test secrets)

import os
from dotenv import load_dotenv

def load_config():
    env = os.getenv("APP_ENV", "dev")    # APP_ENV=prod in production
    env_file = f".env.{env}"
    load_dotenv(env_file)
    print(f"Loaded config: {env_file}")

# Or in BaseSettings — stack multiple files:
class Settings(BaseSettings):
    class Config:
        env_file = (".env", ".env.local")   # .env.local overrides .env
        # Pydantic reads left-to-right, later files override earlier

# Production deployment: env vars set directly in Docker/Kubernetes/Render
# — no .env file at all, OS environment is the source of truth
```

---

## 7. Secrets Management (Java: Spring Vault / AWS Secrets Manager)

```python
# Rule: secrets never live in code or .env files on production servers
# They come from:
# - Docker environment variables
# - Kubernetes Secrets
# - AWS Secrets Manager / GCP Secret Manager / Azure Key Vault
# - Railway / Render / Fly.io environment variable dashboard

# Reading from AWS Secrets Manager (same pattern as any vault):
import boto3
import json

def get_secret(secret_name: str) -> dict:
    client = boto3.client("secretsmanager", region_name="ap-south-1")
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response["SecretString"])

# Startup:
if os.getenv("APP_ENV") == "production":
    secrets = get_secret("bench-optimizer/production")
    os.environ["JWT_SECRET"] = secrets["jwt_secret"]
    os.environ["DEEPSEEK_API_KEY"] = secrets["deepseek_api_key"]

# Java equivalent: @Value injected from Spring Cloud Vault
# Python: explicit code — you see exactly where secrets come from

# Startup validation — refuse to start with missing or weak secrets:
INSECURE_DEFAULTS = {"changeme", "secret", "dev-secret"}

def validate_secrets():
    jwt = os.getenv("JWT_SECRET", "")
    if not jwt or jwt in INSECURE_DEFAULTS:
        raise RuntimeError("JWT_SECRET is missing or insecure. Set a strong secret.")
    if len(jwt) < 32:
        raise RuntimeError(f"JWT_SECRET too short: {len(jwt)} chars (min 32)")
```

---

## 8. Config in AI Engineering — Patterns

```python
# Pattern 1: LLM provider config with validation
from pydantic_settings import BaseSettings
from pydantic import Field, validator

class LLMSettings(BaseSettings):
    provider: str = "deepseek"
    api_key: str
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com"
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=500, gt=0, le=8192)

    @validator("provider")
    def provider_must_be_supported(cls, v):
        supported = {"openai", "anthropic", "deepseek"}
        if v not in supported:
            raise ValueError(f"Provider must be one of {supported}")
        return v

    class Config:
        env_file = ".env"

# Pattern 2: Feature flags from environment
class FeatureFlags(BaseSettings):
    enable_streaming: bool = True
    enable_semantic_cache: bool = True
    enable_kafka: bool = False          # off by default — optional infra
    enable_hallucination_guard: bool = True
    max_concurrent_llm_calls: int = 5

    class Config:
        env_file = ".env"

flags = FeatureFlags()
if flags.enable_kafka:
    kafka_producer.start()
```

---

## 9. Interview Anchor

**"How do you manage configuration and secrets in a Python AI service?"**

Say:
> "Same principles as Java Spring — externalize everything, validate at startup, fail fast on missing required values. In code I use Pydantic `BaseSettings` — it reads from env vars and `.env` files, auto-casts types (string env var → int field), and raises `ValidationError` at startup if required values are missing. For secrets — JWT secret, API keys — I add an explicit startup validator that rejects known-weak defaults and enforces minimum length. In production I never use `.env` files on the server — secrets come from the platform's environment variable dashboard or a vault like AWS Secrets Manager. This is the same as Spring Cloud Config + Spring Vault, but without the XML or annotations overhead."

---

## 10. Quick Reference

```python
# Read env var
os.environ["KEY"]            # raises KeyError if missing (Java: required)
os.getenv("KEY")             # None if missing
os.getenv("KEY", "default")  # with fallback

# Load .env file
from dotenv import load_dotenv
load_dotenv()                # loads .env into os.environ

# Typed config with Pydantic
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    required_key: str        # no default → raises if missing
    optional_key: str = "default"
    numeric: int = 42        # auto-cast from string env var

    class Config:
        env_file = ".env"

settings = Settings()        # validates at instantiation

# Singleton
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

# Java comparison
# os.getenv()            → System.getenv()
# load_dotenv()          → @PropertySource
# BaseSettings           → @ConfigurationProperties
# @lru_cache singleton   → @Bean (Spring singleton scope)
# validator              → @NotNull, @Min, @Max on config fields
```
