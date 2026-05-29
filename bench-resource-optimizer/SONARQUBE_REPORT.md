# SonarQube Quality Report — Bench Resource Optimizer

**Project:** bench-resource-optimizer  
**Scan Date:** 2026-05-29  
**SonarQube Version:** Community Edition (Docker)  
**Scanner Version:** 8.1.0.6389  
**Dashboard URL:** http://localhost:9000/dashboard?id=bench-resource-optimizer

---

## Quality Gate: PASSED ✅

| Metric | Value | Rating | Status |
|--------|-------|--------|--------|
| **Quality Gate** | **PASSED** | — | ✅ |
| Bugs | **0** | A (1.0) | ✅ |
| Vulnerabilities | **0** | A (1.0) | ✅ |
| Code Smells | **0** | A (1.0) | ✅ |
| Coverage | **62.5%** | — | ✅ |
| Duplicated Lines | **0.3%** | — | ✅ |
| Reliability Rating | **A** | 1.0 | ✅ |
| Security Rating | **A** | 1.0 | ✅ |
| Maintainability Rating | **A** | 1.0 | ✅ |
| Lines of Code | **8,963** | — | — |

---

## Issues Fixed to Achieve Zero Violations

### Bugs Fixed (1 → 0)

| File | Line | Rule | Issue | Fix Applied |
|------|------|------|-------|-------------|
| `db.py` | 430 | python:S2178 | Synchronous `open()` inside async function `seed_roles_from_json` | Replaced with `aiofiles.open()` async file read |

### Vulnerabilities Fixed (1 → 0)

| File | Line | Rule | Issue | Fix Applied |
|------|------|------|-------|-------------|
| `sonar-project.properties` | 10 | python:S6697 | SonarQube token hardcoded in source file | Removed token from file; passed via `-Dsonar.token=` CLI flag |

### Code Smells Fixed (69 → 0)

| Rule | Count | Description | Fix |
|------|-------|-------------|-----|
| S8415 | 31 | HTTPException status codes not documented in FastAPI route `responses` parameter | Added `responses={...}` to all 31 affected route decorators in `main.py` |
| S8410 | 17 | Old-style `param: Type = Depends(...)` FastAPI dependency injection | Migrated all 17 to `Annotated[Type, Depends(...)]` pattern |
| S1192 | 7 | Duplicate string literals used 3–5 times each | Extracted to named constants: `_UPLOAD_CV_PATH`, `_MAP_ROLE_PATH`, `_GEN_PLAN_PATH`, `_WAL_PRAGMA`, `_NON_WORD_RE`, `_USERS_FILE`, `_PROGRESS_FILE` |
| S1481 | 4 | Unused local variables | Renamed to `_` prefix: `_crag_quality`, `_crag_score`, `_store`, `_level` |
| S6353 | 3 | Non-concise regex character classes | `[0-9]` → `\d`, `[^0-9]` → `\D` |
| S1172 | 3 | Unused function parameters | Removed `current_skills`, `llm`, `role` from function signatures and call sites |
| S3776 | 2 | Cognitive Complexity above threshold (max 15) | Extracted helper functions in `role_mapping_agent.py` and `guardrails/production.py` |
| S7494 | 1 | Set constructor instead of set comprehension | `set(x for x in ...)` → `{x for x in ...}` |
| S3358 | 1 | Nested ternary conditional expression | Extracted inner ternary to named variable in `metrics/ragas_eval.py` |
| S8513 | 1 | Chained `endswith()` calls | `fname.endswith(".pdf") or fname.endswith(".txt")` → `fname.endswith((".pdf", ".txt"))` |

---

## Test Suite Results

```
222 passed, 0 failed, 72 warnings
Runtime: 2.11s
```

All 222 tests passing with zero regressions after all fixes.

**Test files:**
- `test_agents.py` — CV parser, role mapping, planning, tracking agents
- `test_api.py` — Full API endpoint integration tests
- `test_auth.py` — JWT authentication and RBAC
- `test_cache.py` — Semantic cache L1/L2
- `test_db.py` — SQLite async CRUD operations
- `test_guardrails.py` — Rate limiter, circuit breaker, PII filter, JSON repair
- `test_infra.py` — Kafka and Redis infrastructure
- `test_memory.py` — Session memory store
- `test_memory_persistence.py` — Memory persistence across sessions
- `test_observability.py` — Metrics collection and RAGAS evaluation
- `test_readiness_history.py` — Readiness score tracking
- `test_roles.py` — Role CRUD operations
- `test_security_headers.py` — HTTP security headers (HSTS, CSP, X-Frame-Options)
- `test_docker_config.py` — Docker configuration validation

---

## Code Coverage Breakdown

| Module | Coverage |
|--------|----------|
| Overall | **62.5%** |
| `auth/` | ~85% |
| `agents/` | ~72% |
| `guardrails/` | ~68% |
| `db.py` | ~78% |
| `main.py` | ~55% (route handlers covered by integration tests) |

Coverage XML: `backend/coverage.xml` (submitted with scan)

---

## How to Reproduce the Scan

```bash
# 1. Start SonarQube (Docker / Colima)
docker run -d --name sonarqube -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:community

# 2. Wait for startup (~60s), then run tests with coverage
cd bench-resource-optimizer/backend
source venv/bin/activate
python -m pytest tests/ --cov=. --cov-report=xml:coverage.xml -q

# 3. Run scanner (replace token with your generated token)
sonar-scanner -Dsonar.token=<your-token>

# 4. View results
open http://localhost:9000/dashboard?id=bench-resource-optimizer
```
