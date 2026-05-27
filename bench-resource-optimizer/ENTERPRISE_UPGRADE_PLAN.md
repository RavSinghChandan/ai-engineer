# Bench Resource Optimizer — Enterprise Upgrade Plan
## From MVP to Production-Grade

**Date:** 2026-05-26  
**Baseline:** 153 backend tests passing · 29 API endpoints · 8 DB tables · G1–G5 guardrails live  
**Rule:** One branch per phase. Tests pass before merge. Nothing breaks what already works.

---

## Current State (Do Not Break)

| Layer | What Exists | Status |
|-------|-------------|--------|
| FastAPI 29 endpoints | upload-cv, map-role, generate-plan, progress, memory, metrics, guardrails, admin | ✅ |
| Async SQLite WAL | 8 tables, ACID, concurrent-safe | ✅ |
| 4 LLM Agents | cv_parser, role_mapper, planner, tracker | ✅ |
| Hybrid RAG | FAISS + BM25 + RRF + HyDE + CRAG + reranker | ✅ |
| G1–G5 Guardrails | rate limit, circuit breaker, JSON repair, PII filter, degradation | ✅ |
| Semantic Cache | L1 exact + L2 cosine | ✅ |
| Session Memory | episodic + long-term facts + TTL | ✅ |
| Observability | metrics collector, RAGAS eval, LLM-as-judge | ✅ |
| Test Suite | 153 pytest functions across 10 test files | ✅ |
| Angular Frontend | 8 components, 8 routes, SSE streaming UI | ✅ |

---

## What Is Missing — Prioritised Gap List

### CRITICAL (blocks production deployment)
| # | Gap | Why Critical |
|---|-----|-------------|
| C1 | No JWT authentication | Anyone can access any user's data |
| C2 | No CI/CD pipeline | Can't verify tests pass on every commit |
| C3 | No Docker | Can't deploy anywhere reliably |
| C4 | No environment config in frontend | API URL hardcoded — can't deploy to staging/prod |
| C5 | No error boundaries in frontend | LLM failure = blank white screen |
| C6 | No secrets manager | API key in plain .env committed to repo |

### HIGH (production quality)
| # | Gap | Impact |
|---|-----|--------|
| H1 | No API versioning (/api/v1/) | Breaking changes destroy existing clients |
| H2 | No Alembic DB migrations | Can't evolve schema safely in production |
| H3 | Missing `response_model=` on endpoints | No validated output schema — bugs escape silently |
| H4 | No frontend unit tests (0 spec files) | Regressions undetected |
| H5 | No audit log (who changed what) | Compliance gap |
| H6 | No correlation IDs end-to-end | Can't trace a request across backend logs |

### MEDIUM (enterprise polish)
| # | Gap | Impact |
|---|-----|--------|
| M1 | No responsive/mobile layout | Broken on phones/tablets |
| M2 | No CSS theme tokens | Impossible to maintain at scale |
| M3 | No loading skeletons | UX degrades on slow LLM responses |
| M4 | No real-time dashboard polling | Metrics dashboard needs manual refresh |
| M5 | No health banner in frontend | User has no idea backend is down |
| M6 | No GDPR export endpoint | Compliance gap |
| M7 | No role CRUD wired to admin UI | Admin component exists but not connected |

---

## Branch Strategy

```
main              ← production-only, protected
  └── staging     ← pre-prod integration test
        └── develop ← integration (all feature branches merge here)
              ├── feature/phase-1-ci-cd
              ├── feature/phase-2-auth
              ├── feature/phase-3-docker
              ├── feature/phase-4-api-hardening
              ├── feature/phase-5-frontend-tests
              └── feature/phase-6-enterprise-polish
```

**Rule:**  
1. Cut feature branch from `develop`  
2. Implement + write tests  
3. Verify all 153 existing tests still pass + new tests pass  
4. Merge to `develop`  
5. After all phases: `develop → staging` (smoke test) → `staging → main` (release)

---

## Phase Plan — Sequential, Non-Breaking

---

### PHASE 1 — CI/CD Pipeline
**Branch:** `feature/phase-1-ci-cd`  
**Goal:** Every push runs all 153 tests automatically. Build breaks visibly if anything regresses.  
**Why first:** The safety net that makes all future phases safe. Can't move fast without it.

**Deliverables:**
```
.github/
  workflows/
    ci.yml          ← pytest on every PR to develop/staging/main
    build.yml       ← ng build check on every PR
    deploy.yml      ← deploy to GitHub Pages on merge to main (frontend)
```

**ci.yml steps:**
1. Checkout code
2. Set up Python 3.11
3. Install backend deps from requirements.txt
4. Create `.env.ci` (mock keys, no real API calls)
5. Run `pytest backend/tests/ -v --tb=short`
6. Report coverage with `pytest-cov`
7. Fail PR if any test fails

**build.yml steps:**
1. Checkout code
2. Set up Node 20
3. `npm ci` in frontend/
4. `ng build --configuration=production`
5. Fail PR if build fails

**Test additions (Phase 1):**
- Add `pytest-cov` to requirements
- Add coverage badge threshold: 70% minimum
- Confirm all 153 tests pass in CI environment (mock LLM + FAISS)

**Definition of Done:**  
✅ Green badge on GitHub repo  
✅ PR to develop triggers both workflows  
✅ All 153 tests pass in CI  
✅ `ng build` passes in CI

---

### PHASE 2 — JWT Authentication
**Branch:** `feature/phase-2-auth`  
**Goal:** Every protected endpoint requires a valid JWT. Frontend stores token and attaches it to requests.  
**Why second:** Auth is the #1 security gap. All other hardening builds on top of it.

**Backend deliverables:**
```
backend/
  auth/
    __init__.py
    jwt_handler.py    ← create/verify JWT (HS256, configurable secret)
    dependencies.py   ← FastAPI Depends: get_current_user()
    models.py         ← LoginRequest, TokenResponse, UserClaims
  main.py             ← wire auth to protected endpoints
```

**New endpoints:**
- `POST /auth/login` — accepts `{user_id, password}` → returns `{access_token, expires_in}`
- `POST /auth/refresh` — refresh token rotation
- `GET /auth/me` — return current user claims from token

**Protected endpoints** (add `Depends(get_current_user)`):
- `POST /upload-cv` ✓
- `POST /map-role` ✓
- `POST /generate-plan` ✓
- `POST /generate-plan/stream` ✓
- `POST /update-progress` ✓
- `GET /progress/{user_id}` ✓
- `GET /memory/{user_id}` ✓
- `POST /admin/*` ✓ (admin role required)

**Public endpoints** (no auth):
- `GET /health/*`
- `GET /metrics`
- `GET /roles`
- `POST /auth/login`

**Frontend deliverables:**
```
frontend/src/app/
  services/
    auth.service.ts         ← login(), logout(), getToken(), isLoggedIn()
  guards/
    auth.guard.ts           ← CanActivate: redirect to /login if no token
  interceptors/
    auth.interceptor.ts     ← attach Bearer token to every HttpRequest
  components/
    login/
      login.component.ts    ← login form (user_id + password)
  app.routes.ts             ← add canActivate: [AuthGuard] to protected routes
```

**Test additions (Phase 2):**
- `tests/test_auth.py` — 20+ tests:
  - POST /auth/login → 200 + token
  - POST /auth/login bad password → 401
  - Protected endpoint without token → 401
  - Protected endpoint with valid token → 200
  - Token expiry → 403
  - Admin endpoint with non-admin token → 403

**Definition of Done:**  
✅ All 153 existing tests pass  
✅ 20+ new auth tests pass  
✅ Frontend login page works  
✅ Token persists in localStorage  
✅ Protected routes redirect to /login when unauthenticated  
✅ Auth interceptor attaches Bearer header to all API calls

---

### PHASE 3 — Docker + Environment Config
**Branch:** `feature/phase-3-docker`  
**Goal:** `docker compose up` starts the full stack (backend + frontend + SQLite volume).  
**Why third:** After auth works, containerise so staging/prod deployments are repeatable.

**Backend deliverables:**
```
backend/
  Dockerfile          ← multi-stage: builder + slim runtime
  .dockerignore       ← exclude venv, __pycache__, .env, bench.db
```

**Frontend deliverables:**
```
frontend/
  Dockerfile          ← multi-stage: node build + nginx serve
  nginx.conf          ← SPA routing (try_files $uri /index.html)
  src/environments/
    environment.ts        ← { apiUrl: '/api', production: false }
    environment.prod.ts   ← { apiUrl: 'https://api.yourdomain.com', production: true }
```

**Root deliverables:**
```
docker-compose.yml      ← backend + frontend + named volume for SQLite
docker-compose.prod.yml ← production overrides (no volume mounts, env from secrets)
.env.example            ← template with all required keys (no real values)
```

**docker-compose.yml services:**
```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    volumes: [bench-data:/app/data]
  frontend:
    build: ./frontend
    ports: ["4200:80"]
    depends_on: [backend]
volumes:
  bench-data:
```

**Update api.service.ts:**  
Replace hardcoded `/api` with `environment.apiUrl` from Angular environments.

**Test additions (Phase 3):**
- Smoke test: `docker compose up --build` succeeds
- `GET /health/ready` returns 200 from within container
- `ng build --configuration=production` uses `environment.prod.ts`

**Definition of Done:**  
✅ `docker compose up` starts full stack  
✅ App accessible at localhost:4200 via Docker  
✅ Backend accessible at localhost:8000 via Docker  
✅ SQLite data persists across container restarts (named volume)  
✅ All 153 + 20 tests still pass in CI  
✅ Frontend uses environment.ts for API URL

---

### PHASE 4 — API Hardening
**Branch:** `feature/phase-4-api-hardening`  
**Goal:** Every endpoint has validated request/response models, versioned URLs, and correlation ID logging.  
**Why fourth:** With auth + Docker done, harden the API surface before adding more features.

**Deliverables:**

**4a — API versioning:**
- Move all routes under `/api/v1/` prefix
- Old routes return 301 redirect to `/api/v1/` (backward compat for 30 days)
- Update frontend `api.service.ts` to use `/api/v1/` prefix

**4b — Response models on all 29 endpoints:**
- Add `response_model=ResponseClass` to every endpoint decorator
- Create missing Pydantic response models in `backend/models/` (new directory)
- FastAPI auto-validates all outgoing responses

**4c — Correlation ID end-to-end:**
- `middleware/logging_mw.py`: generate `X-Request-ID` UUID on every request
- Log `request_id` in every log line
- Return `X-Request-ID` in every response header
- Frontend `auth.interceptor.ts`: read `X-Request-ID` from response, log to console

**4d — Alembic DB migrations:**
```
backend/
  alembic/
    env.py
    versions/
      0001_initial_schema.py   ← all 8 current tables
  alembic.ini
```
- `init_db()` stays for dev/test (speed)
- Production uses `alembic upgrade head`

**4e — Input validation hardening:**
- Add field-level validators to existing Pydantic request models
- `user_id`: `min_length=3, max_length=64, regex=^[a-zA-Z0-9_-]+$`
- `role`: must be in known roles list (validated against DB)
- File upload: enforce `content_type == application/pdf`, max 5MB

**Test additions (Phase 4):**
- `tests/test_validation.py` — 25+ tests:
  - Invalid user_id format → 422
  - File too large → 413
  - Wrong content type → 415
  - Response model validates correctly for all 29 endpoints
  - Correlation ID appears in response headers

**Definition of Done:**  
✅ All URLs under `/api/v1/`  
✅ All 29 endpoints have `response_model=`  
✅ X-Request-ID in every response  
✅ Alembic `upgrade head` creates all 8 tables  
✅ 25+ new validation tests pass  
✅ 153 + 20 existing tests still pass

---

### PHASE 5 — Frontend Unit Tests
**Branch:** `feature/phase-5-frontend-tests`  
**Goal:** Every Angular component/service has a Jasmine spec file. 80%+ coverage.  
**Why fifth:** After the backend is solid, build frontend safety net before polish.

**Test files to create:**
```
frontend/src/app/
  services/
    api.service.spec.ts       ← mock HttpClient, test all 20+ methods
    auth.service.spec.ts      ← login/logout/token storage
    state.service.spec.ts     ← shared state mutations
  components/
    upload-cv/upload-cv.component.spec.ts      ← file drag, upload call
    role-mapping/role-mapping.component.spec.ts ← role select, RAG display
    dashboard/dashboard.component.spec.ts       ← task check, progress save
    metrics/metrics.component.spec.ts           ← KPI render, guardrail cards
    memory/memory.component.spec.ts             ← session timeline render
    admin/admin.component.spec.ts               ← file upload wiring
    login/login.component.spec.ts               ← form submit, error display
  guards/
    auth.guard.spec.ts        ← redirect when unauthenticated
  interceptors/
    auth.interceptor.spec.ts  ← Bearer token attached to requests
```

**Coverage targets:**
- Services: 90%+
- Guards/Interceptors: 100%
- Components: 75%+

**Run command:**
```bash
ng test --watch=false --code-coverage
```

**Test additions (Phase 5):**
- 80+ Jasmine test cases
- Coverage report: `coverage/bench-frontend/index.html`

**Definition of Done:**  
✅ `ng test` runs 80+ specs, all green  
✅ Coverage ≥ 80% on services, guards, interceptors  
✅ CI workflow (`build.yml`) runs `ng test` on every PR  
✅ All 153 + 45 backend tests still pass

---

### PHASE 6 — Enterprise Polish
**Branch:** `feature/phase-6-enterprise-polish`  
**Goal:** Responsive UI, CSS theme tokens, error boundaries, health banner, audit log, GDPR export.  
**Why last:** Foundation is solid — now make it look and behave enterprise-grade.

**6a — CSS Theme Tokens:**
```css
/* frontend/src/styles.css */
:root {
  --color-primary: #6366f1;
  --color-bg-page: #f8fafc;
  --color-bg-card: #ffffff;
  --color-text-primary: #111827;
  --color-text-muted: #6b7280;
  --color-border: rgba(0,0,0,0.08);
  --color-accent: #6366f1;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.06);
}
```
- Replace all hardcoded hex/rgba in component styles with CSS vars

**6b — Error Boundaries:**
```typescript
// frontend/src/app/services/error-handler.service.ts
// Implements Angular ErrorHandler
// Shows toast notification on HTTP error
// Logs to console with request_id
// Shows "Something went wrong" fallback card (not blank screen)
```

**6c — Global Error Interceptor:**
```typescript
// frontend/src/app/interceptors/error.interceptor.ts
// Catches 4xx/5xx → passes to ErrorHandlerService
// 401 → redirect to /login
// 503 → show "Backend is starting" banner
// 429 → show "Too many requests, slow down" message
```

**6d — Health Banner:**
- On app init, call `GET /health/ready`
- If not 200: show yellow banner "Backend is starting up…"
- Poll every 10s until healthy
- Banner disappears when healthy

**6e — Responsive Design:**
- MetricsComponent: KPI cards wrap to 2-col on tablet, 1-col on mobile
- DashboardComponent: task table scrolls horizontally on mobile
- All components: `max-width` + `padding` responsive breakpoints

**6f — Loading Skeletons:**
- Replace "Loading…" text with animated skeleton cards
- Applies to: MetricsComponent, MemoryComponent, DashboardComponent
- Skeleton CSS: pulse animation on gray placeholder divs

**6g — Audit Log (backend):**
```
backend/
  audit/
    __init__.py
    log.py        ← log_event(actor, action, resource, detail)
```
- New `audit_log` SQLite table: `id, ts, actor, action, resource, detail`
- Wire to: role CRUD (create/update/delete), admin doc upload, login
- `GET /admin/audit-log` endpoint (admin JWT required)

**6h — GDPR Export:**
- `GET /admin/users/{user_id}/export` → JSON dump of all user data
  - profile, progress, memory sessions, readiness history
- `DELETE /admin/users/{user_id}` → hard delete across all 8 tables

**6i — Real-time Dashboard Polling:**
- MetricsComponent: poll `GET /metrics` every 15s (already exists in some form)
- Show "Last updated: 3s ago" timestamp
- Pause polling when tab is hidden (`document.visibilityState`)

**Test additions (Phase 6):**
- `tests/test_audit.py` — 15+ tests for audit log
- `tests/test_gdpr.py` — 10+ tests for export + delete
- Angular specs: error handler, health banner, skeleton display

**Definition of Done:**  
✅ CSS vars used everywhere in frontend  
✅ No blank screen on 503 — friendly error card shown  
✅ 401 → redirects to /login  
✅ Health banner shown when backend is down  
✅ All components look correct on 375px mobile  
✅ Audit log records role changes + login events  
✅ GDPR export returns all user data as JSON  
✅ All 153 + 70+ backend tests pass  
✅ 80+ frontend specs pass

---

## Testing Rules (All Phases)

1. **Before starting a phase:** run `pytest backend/tests/ -v` — must be green
2. **During a phase:** write test first (TDD where possible), then implement
3. **Before merging a phase:** run full test suite — 0 failures allowed
4. **Test naming convention:**
   - `test_positive_*` — happy path
   - `test_negative_*` — expected failure (400, 401, 404, 422, 429, 503)
   - `test_edge_*` — boundary/concurrent cases
5. **No mocking of auth in integration tests** — use real test tokens

---

## Merge Order (Sequential)

```
Phase 1 (CI/CD)        → feature/phase-1-ci-cd   → develop   ← START HERE
Phase 2 (Auth)         → feature/phase-2-auth     → develop   ← after Phase 1
Phase 3 (Docker)       → feature/phase-3-docker   → develop   ← after Phase 2
Phase 4 (API hardening)→ feature/phase-4-api-hardening → develop ← after Phase 3
Phase 5 (FE tests)     → feature/phase-5-frontend-tests → develop ← after Phase 4
Phase 6 (Polish)       → feature/phase-6-enterprise-polish → develop ← after Phase 5

develop → staging     ← smoke test all 6 phases together
staging → main        ← production release
```

---

## Success Metrics at End

| Metric | Now | Target |
|--------|-----|--------|
| Backend tests | 153 | 250+ |
| Frontend tests | 0 | 80+ |
| CI/CD | None | GitHub Actions (test + build + deploy) |
| Auth | None | JWT on all protected routes |
| Docker | None | `docker compose up` works |
| API versioning | None | /api/v1/ on all endpoints |
| Response models | Partial | 100% of 29 endpoints |
| Audit log | None | All admin actions logged |
| GDPR | None | Export + delete implemented |
| Error UX | Blank screen | Friendly error cards + toast |
| Mobile UX | Broken | Responsive all components |

---

## What Does NOT Change

- The 4 LLM agents (cv_parser, role_mapper, planner, tracker)
- The hybrid RAG system (FAISS + BM25 + RRF + HyDE + CRAG)
- G1–G5 guardrails and their persistence
- The 8 SQLite tables (only Alembic migrations wrap them)
- The semantic cache (L1 + L2)
- The session memory system
- The SSE streaming endpoint
- The RAGAS evaluation system
- All 153 existing backend tests
