# SonarQube Quality Report — Bench Resource Optimizer

**Project:** bench-resource-optimizer  
**Scan Date:** 2026-05-29  
**SonarQube Version:** Community Edition  
**Dashboard URL:** http://localhost:9000/dashboard?id=bench-resource-optimizer

---

## Quality Gate: PASSED ✅

| Metric | Value | Rating | Status |
|--------|-------|--------|--------|
| **Quality Gate** | **PASSED** | — | ✅ |
| Bugs | **0** | A (1.0) | ✅ |
| Vulnerabilities | **0** | A (1.0) | ✅ |
| Code Smells | **0** | A (1.0) | ✅ |
| Violations | **0** | — | ✅ |
| Security Hotspots | **0** | — | ✅ |
| Coverage | **94.7%** | — | ✅ |
| Duplicated Lines | **0.2%** | — | ✅ |
| Reliability Rating | **A** | 1.0 | ✅ |
| Security Rating | **A** | 1.0 | ✅ |
| Maintainability Rating | **A** | 1.0 | ✅ |
| Lines of Code | **10,986** | — | — |

---

## Test Suite Results

```
502 passed, 0 failed, 105 warnings
Runtime: ~20s
Coverage: 94.7%
```

---

## Security Hotspots Fixed (3 → 0)

### Hotspot 1 — ReDoS Vulnerability (MEDIUM)
| | |
|--|--|
| **File** | `utils/guardrails.py:68` |
| **Rule** | python:S5852 |
| **Category** | Denial of Service |
| **Issue** | `re.sub(r"\s*\`\`\`$", ...)` — `\s*` on user-controlled input allows a malicious string to cause polynomial regex backtracking, making the API unresponsive |
| **Fix** | Replaced entire regex fence-stripping with plain Python string operations (`startswith` / `endswith`) — no regex engine involvement, zero backtracking risk |

### Hotspot 2 — HTTP in CORS Origins (LOW)
| | |
|--|--|
| **File** | `main.py:183` |
| **Rule** | python:S5332 |
| **Category** | Insecure data transmission |
| **Issue** | Default CORS origins used `http://localhost` — allows credentials to be sent over unencrypted HTTP connections |
| **Fix** | Changed default CORS origins to `https://localhost:4200,https://localhost:4202,https://127.0.0.1:4202` |

### Hotspot 3 — Sensitive File Inclusion in Docker (MEDIUM)
| | |
|--|--|
| **File** | `Dockerfile:20` |
| **Rule** | docker:S6470 |
| **Category** | Permission / sensitive data |
| **Issue** | `COPY . .` recursively copies the entire project directory including `.env` files, private keys, local config, or test credentials into the production Docker image |
| **Fix** | Replaced with explicit per-directory copies (`COPY main.py .`, `COPY agents/ agents/`, etc.) so only production code enters the image |

---

## Code Smells Fixed (69 → 0) — Historical

| Rule | Count | Description | Fix Applied |
|------|-------|-------------|-------------|
| S8415 | 31 | HTTPException status codes not documented | Added `responses={...}` to all 31 route decorators |
| S8410 | 17 | Old-style FastAPI `Depends()` injection | Migrated all to `Annotated[Type, Depends(...)]` |
| S1192 | 7 | Duplicate string literals | Extracted to named constants |
| S1481 | 4 | Unused local variables | Renamed to `_` prefix |
| S6353 | 3 | Non-concise regex character classes | `[0-9]` → `\d` |
| S1172 | 3 | Unused function parameters | Removed from signatures |
| S3776 | 2 | Cognitive Complexity > 15 | Extracted helper functions |
| S7494 | 1 | Set constructor vs comprehension | `set(x for x in ...)` → `{x for x in ...}` |
| S3358 | 1 | Nested ternary | Extracted to named variable |
| S8513 | 1 | Chained `endswith()` | `.endswith((".pdf", ".txt"))` |

---

## Coverage Breakdown

| Module | Coverage |
|--------|----------|
| **Overall** | **94.7%** |
| `agents/` | 91–93% |
| `guardrails/` | 96–100% |
| `rag/` | 93–96% |
| `cache/` | 94% |
| `memory/` | 96% |
| `metrics/` | 93–97% |
| `middleware/` | 97–100% |
| `infra/` | 94–100% |
| `utils/` | 90–100% |
| `auth/` | 98% |
| `db.py` | 99% |
| `main.py` | 87% |
| `prompts/` | 100% |
| `storage.py` | 100% |

---

## How to Reproduce the Scan

```bash
# 1. Start SonarQube
docker run -d --name sonarqube -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:community

# 2. Run tests with coverage
cd bench-resource-optimizer/backend
source venv/bin/activate
python -m pytest tests/ --cov=. --cov-report=xml:coverage.xml -q

# 3. Run scanner
sonar-scanner -Dsonar.token=<your-generated-token>

# 4. View dashboard
open http://localhost:9000/dashboard?id=bench-resource-optimizer
```
