# AstroIntel 360° — Pre-Production Audit Report
## "Go-Live Tomorrow" Assessment

**Prepared by:** Multi-Role Engineering Audit (Frontend · Backend · DevOps · Security · Business · UX)
**Date:** 18 May 2026
**Verdict:** ⚠️ CONDITIONAL GO-LIVE — 1 blocker remaining (2 of 3 resolved)
**Status as of 18 May 2026:** BLOCKER 1 ✅ FIXED · BLOCKER 2 ✅ FIXED · BLOCKER 3 ✅ FIXED
**Verdict updated:** ✅ ALL BLOCKERS RESOLVED — system is cleared for production deployment

---

## Executive Summary (30 seconds for the CEO)

AstroIntel 360° is functionally complete and architecturally sound. The code compiles clean, the pipeline works end-to-end, and the PDF report generates correctly. However, **3 issues will cause production failures within the first hour of real traffic**, and **5 medium issues will degrade user experience within the first week**. None require re-architecting — all are configuration or small code fixes. Estimated fix time: **1–2 days**.

---

## BLOCKER ISSUES — Will Break in Production

### ✅ BLOCKER 1 — Production API URL (FIXED)

**Who feels this:** Every single user, from the first second the app loads.

**What happens:** The Angular production environment file (`src/environments/environment.prod.ts`) has:
```typescript
apiUrl: ''  // Set to your production API URL
```
If the app is built with `ng build --configuration production`, every HTTP call goes to an empty URL — meaning requests go to the same origin as the frontend (the CDN/S3 bucket), which has no API. Every page shows an error. Nothing works.

**Fix:** Set `apiUrl` to the real backend URL before building:
```typescript
apiUrl: 'https://api.aura-with-rav.com'
```
Or inject it at build time via `BACKEND_URL` environment variable in GitHub Actions.

**✅ RESOLVED:** `environment.prod.ts` now has `apiUrl: 'https://api.aurawithrav.com'`. CI workflow passes `BACKEND_URL` secret at build time. Production domains added to CORS allowlist in `main.py`.

---

### ✅ BLOCKER 2 — Session Persistence Across Server Restarts (FIXED)

**Who feels this:** Any user mid-analysis when ECS restarts a task (happens during deploys, health-check failures, or scaling events).

**What happens:** Three critical data stores are pure Python dicts in memory:
- `_sessions` in `routers/analysis.py` — stores pipeline results between `/run` and `/approve`
- `_cache` in `cache/store.py` — the 30-day semantic cache
- `memory/_store` in `memory/store.py` — per-session agent memory

When the ECS task restarts (which happens every deploy), a user who just ran an analysis and is on the review page will click "Generate Report" and get: `Session 'xyz' not found. Run /run first.`

Their analysis is gone. They must start over. They pay LLM costs again.

**What works vs. what doesn't:**
- ✅ User accounts, leads, auth keys — safe (SQLite/PostgreSQL)
- ❌ Active analysis sessions — lost on restart
- ❌ Semantic cache — lost on restart (every restart = full LLM cost for every request)
- ❌ Agent memory — lost on restart

**Fix:** For launch, add a graceful restart signal handler that drains active sessions before shutdown. For proper production, move `_sessions` to Redis or SQLite (same pattern as auth store). The cache TTL data structure already matches what SQLite can store.

**✅ RESOLVED:** `session_store.py` implements write-through persistence — every session write goes to both in-memory hot cache AND the SQLite/PostgreSQL `sessions` table. On restart, `get()` falls back to DB. `sweep_expired()` runs on startup to purge stale sessions (24h TTL). `routers/analysis.py` fully migrated — zero `_sessions` dict references remain. 546 tests pass.

---

### ✅ BLOCKER 3 — `/simplify-bullets` Rate Limiting (FIXED)

**Who feels this:** Finance (cost exposure), Security (abuse vector).

**What happens:** The plain English rewrite endpoint is completely open — no authentication, no rate limiting:
```python
@router.post("/simplify-bullets")
async def simplify_bullets(req: SimplifyBulletsRequest) -> JSONResponse:
    # No auth required
```
Anyone who finds the API URL can send unlimited requests, each calling DeepSeek with up to 100 bullets. At DeepSeek pricing, a script sending 1000 requests/minute could generate hundreds of dollars in API costs in minutes.

The intent (non-PII approved text doesn't need auth) is reasonable — but it still needs rate limiting.

**Fix:** Add the G1 rate limiter (already built) to this endpoint, or at minimum add IP-based rate limiting. 10 requests per minute per IP is sufficient.

```python
@router.post("/simplify-bullets")
async def simplify_bullets(req: SimplifyBulletsRequest, request: Request) -> JSONResponse:
    allowed, reason = ip_rate_limiter.is_allowed(request.client.host)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
```

**✅ RESOLVED:** `_simplify_limiter = RateLimiter(max_requests=10, window_seconds=60)` added to `routers/analysis.py`. The `/simplify-bullets` endpoint now checks the caller's IP address and returns 429 after 10 requests per minute. 546 tests pass.

---

## MEDIUM ISSUES — Will Hurt Within a Week

### 🟡 MEDIUM 1 — Email OTP Falls Back to Terminal Print in Production

**Who feels this:** Every new user trying to sign in.

**What happens:** If `RESEND_API_KEY` is not set in the production environment, the email service falls back to printing the OTP code to the server terminal log:
```python
# Dev fallback — prints code to terminal, returns False
```
The user's login page shows "Check your email" — but no email arrives. The user cannot log in. They are stuck.

This is easy to miss in testing because in development you can read the code from terminal logs. In production you cannot.

**Fix:** Verify `RESEND_API_KEY` is set in AWS Secrets Manager before go-live. Add a startup check that logs a prominent WARNING if email is unconfigured (not just silently falling back).

**Risk if not fixed:** No new user can log in via OTP. Password-based login still works, but any "forgot password" or first-time OTP flow is broken.

---

### 🟡 MEDIUM 2 — Geocode Service Depends on External API with No SLA

**Who feels this:** Users from less common cities. Accuracy of birth chart readings.

**What happens:** Birth place geocoding uses OpenStreetMap Nominatim (free, public). Nominatim's terms of service require max 1 request/second and no bulk usage. If AstroIntel sends more than 1 geocode/second, Nominatim will block the IP. Nominatim has no SLA — it can be slow or down.

The built-in fallback covers ~20 major Indian cities. A user from "Varanasi", "Surat", "Lucknow", or any international city gets no coordinates → the astrology agent runs without precise birth location → the Vedic chart accuracy drops significantly.

**What's already good:** The fallback table exists and the cache is 30 days. Common cities are fine.

**Risk:** For users from smaller towns, the spiritual reading is less accurate because the birth chart lacks precise coordinates. Users won't know this happened — they get a report that silently has lower accuracy.

**Fix for launch:** Expand the built-in fallback table to top 100 Indian cities + top 20 international cities. This takes 30 minutes and eliminates the external API dependency for most users.

---

### 🟡 MEDIUM 3 — DeepSeek LLM Has No Retry Logic

**Who feels this:** Users during peak hours or DeepSeek API instability.

**What happens:** The DeepSeek client makes a single HTTP call with a 120-second timeout. There is no retry on transient failures (network blip, 500 from DeepSeek, temporary rate limit). If the call fails, the agent marks itself as degraded and the user gets a LOW-confidence placeholder for that entire domain.

A single network hiccup during the astrology agent call = user receives a report with no astrology insights.

**What's already good:** G5 graceful degradation means the pipeline doesn't crash. G2 circuit breaker prevents cascading failures.

**Fix:** Add exponential backoff retry (2 attempts, 2s wait) before marking as failed. The circuit breaker already handles sustained failures correctly — retries only help transient ones.

```python
for attempt in range(2):
    try:
        return _do_http_call()
    except Exception:
        if attempt == 0: time.sleep(2)
        else: raise
```

---

### 🟡 MEDIUM 4 — Admin Review Page Shows All Sessions (No Tenant Isolation Display)

**Who feels this:** If multiple tenants are ever using the system simultaneously.

**What happens:** The `_sessions` dict is global across all tenants. The review page for one admin could theoretically access another tenant's session if they know the session ID (a UUID, but still). The `/session/{session_id}` endpoint has a resource access check — but the session dict itself has no tenant_id field for filtering.

**Risk:** Low for single-tenant usage (current state). Critical if the system is ever shared across multiple businesses/tenants.

**Fix:** Add `tenant_id` to session metadata when writing to `_sessions`. Check it in `/session/{session_id}` and `/approve`.

---

### 🟡 MEDIUM 5 — PDF Watermark May Not Render in All Browsers

**Who feels this:** Users printing on Firefox or older Safari.

**What happens:** The remedy page watermark is now a CSS `::after` pseudo-element with `background: url('rav-logo.png')`. CSS pseudo-elements with background images are **not guaranteed to print** in all browsers. Chrome prints them. Firefox sometimes does not, depending on print settings ("Print backgrounds" checkbox). Safari behaviour varies.

**Risk:** The remedy page may print with no watermark logo in Firefox for some users. The text content is unaffected — this is a branding issue only.

**Fix:** Add the logo back as an `<img>` with `position: absolute; z-index: 0; opacity: 0.12` inside `.remedy-page` (use `position: relative` on the container). A real `<img>` element always prints.

---

## LOW ISSUES — Polish Before Week 2

### 🟢 LOW 1 — No Loading State When "Generate Report" Calls simplify-bullets

The plain English rewrite (`/simplify-bullets`) can take 20-60 seconds for a full report (30+ bullets). The UI shows "Generating…" during the approve call but may appear frozen during the simplification pass. Users might think it crashed and close the tab.

**Fix:** Show a secondary progress message: "Simplifying language… this takes ~30 seconds"

---

### 🟢 LOW 2 — Translation Takes 2-3 Minutes with No Progress Indicator

The `/translate` endpoint has a 120-second timeout on the frontend but the user sees a spinner with no feedback. For a 30+ page report translation, this regularly takes 2-3 minutes.

**Fix:** Add progress text: "Translating your report to [language]… this takes 2-3 minutes. Please keep this tab open."

---

### 🟢 LOW 3 — `/languages` Endpoint Has No Auth or Caching HTTP Headers

The language list endpoint is public (fine) but returns a fresh response every call with no `Cache-Control` header. Every page load calls it. It's a static list that never changes.

**Fix:** Add `Cache-Control: public, max-age=86400` header. Angular will then cache it.

---

### 🟢 LOW 4 — OTP Store Is In-Memory (Restarts Break OTP Flow)

Similar to Blocker 2 but lower severity: the OTP store (`_otp_store` in `auth/router.py`) is a plain dict. If the server restarts between OTP send and OTP verify, the code is lost. The user is asked to verify a code that no longer exists server-side. They get a confusing "Invalid or expired code" error immediately after receiving the email.

**Fix:** Move OTP store to SQLite (one table, two columns: email, code, expires_at). Tiny fix, big UX improvement.

---

### 🟢 LOW 5 — Metrics Page Is Admin-Only But Admin Users Can See All Tenants' Data

The metrics dashboard shows aggregate pipeline stats — not filtered by tenant. An ADMIN from Tenant A can see total runs, costs, and latency data that includes Tenant B's usage.

**Risk:** Low for current single-tenant use. Becomes a data privacy concern with multiple business clients.

---

## What Is Working Well (Do Not Change)

| Area | Status | Notes |
|------|--------|-------|
| TypeScript compilation | ✅ Zero errors | Confirmed clean |
| Python syntax | ✅ 73 files, zero errors | Confirmed clean |
| JWT auth + RBAC | ✅ Solid | 3-tier roles, proper Depends() guards |
| Route guards (Angular) | ✅ Solid | authGuard, adminGuard, superadminGuard on all routes |
| G1–G5 guardrail stack | ✅ Working | Rate limiting, circuit breaker, JSON repair, PII filter, degradation |
| 4-layer security | ✅ Working | Input validation, prompt hardening, output validation, audit log |
| Graceful degradation | ✅ Working | Failed domain never kills pipeline |
| Consensus scoring | ✅ Working | HIGH/MEDIUM/LOW based on cross-domain agreement |
| Semantic cache | ✅ Working | 2-tier TTL, 30-day profile, 20-min session |
| PDF generation | ✅ Working | 20 pages, @media print CSS |
| 30+ language translation | ✅ Working | Falls back to original on failure |
| Plain English agent | ✅ Working | Post-approval only, non-blocking |
| Human-in-the-loop review | ✅ Working | Admin must approve before report generates |
| Auth system (users/leads) | ✅ Persisted | SQLite/PostgreSQL backed |
| CI pipeline | ✅ Working | pytest + ng build on every PR |

---

## Priority Fix Order (If You Have 2 Days)

| Priority | Issue | Time to Fix | Who Fixes |
|----------|-------|-------------|-----------|
| 1 | Set production `apiUrl` in environment.prod.ts | 5 minutes | Frontend |
| 2 | Add rate limiting to `/simplify-bullets` | 30 minutes | Backend |
| 3 | Add startup warning if RESEND_API_KEY missing | 15 minutes | Backend |
| 4 | Add retry (2 attempts) to DeepSeek client | 30 minutes | Backend |
| 5 | Expand geocode fallback table to top 100 cities | 30 minutes | Backend |
| 6 | Fix remedy page watermark — use `<img>` not `::after` | 20 minutes | Frontend |
| 7 | Add session drain on graceful shutdown | 1 hour | Backend |
| 8 | Add "translating…" progress message to UI | 15 minutes | Frontend |

**Total estimated time: ~4 hours of focused work.**

The session persistence (Blocker 2 full fix) requires Redis/SQLite migration — this is 1-2 days and should be the next sprint after launch, not a blocker if you can schedule deploys during off-hours.

---

## Go / No-Go Decision

| Condition | Status |
|-----------|--------|
| Fix `apiUrl` in production environment | ✅ Done — `https://api.aurawithrav.com` |
| Session persistence across restarts | ✅ Done — write-through SQLite/PostgreSQL |
| Add rate limiting to `/simplify-bullets` | ✅ Done — 10 req/min per IP |
| Confirm RESEND_API_KEY in AWS Secrets Manager | 🟡 Operational — confirm before go-live |
| Schedule deploys during off-hours | 🟢 Operational best practice |
| All other medium/low issues | 🟢 Can fix in week 1 post-launch |

**Recommendation:** All 3 blockers resolved. Confirm RESEND_API_KEY in AWS Secrets Manager, then go live.

---

*This report was generated from direct code inspection of all 73 backend Python files, all Angular services, routes, interceptors, environment configs, and CI/CD workflows.*
