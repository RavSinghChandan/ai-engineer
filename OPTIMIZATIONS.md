# AI Engineer Workspace — Optimizations Log

> Session: 2026-06-10  
> Scope: 4 projects — Bench Resource Optimizer, RunbookAI, Astro Intel, Portfolio App  
> All changes tested locally. No production deployment. Git-committed per project.

---

## Bench Resource Optimizer

**Commits:** `557b7da`

### Feature 1 — Plan Export (`GET /export-plan/{user_id}`)

**Problem:** Managers needed to share employee training progress outside the app. No export existed.

**Solution:** Two export formats via query param `?format=`:

| Format | Output | Use case |
|--------|--------|----------|
| `csv` (default) | `text/csv` attachment | Open in Excel / Google Sheets |
| `json` | JSON summary | Dashboard widgets, email digests |

CSV columns: `day, task_id, task_title, skill, hours, status, resource`  
JSON includes: `skills_breakdown` per technology with `progress_pct` per skill.

**Files added:**
- `backend/utils/export.py` — `plan_to_csv()`, `plan_to_summary()`
- `backend/tests/test_export.py` — 15 unit tests, all passing

**Endpoint:** `GET /export-plan/{user_id}?format=csv|json` (requires JWT)

---

### Feature 2 — Readiness Velocity Prediction (`GET /predict-readiness/{user_id}`)

**Problem:** Managers only had a current score (0–100%). No forward-looking view of when an employee would be deployable.

**Solution:** `predict_completion()` algorithm:
1. Fetches `readiness_history` table (up to 30 data points)
2. Computes `score_gain_per_day` from oldest → newest history entry
3. Extrapolates linearly to 100%
4. Returns predicted completion date + confidence band

| Data points | Confidence | Fallback |
|-------------|------------|---------|
| 5+          | HIGH       | — |
| 3–4         | MEDIUM     | — |
| < 2         | LOW        | Industry avg (2 tasks/day) |
| No progress | LOW        | Industry avg + "stalled" status |

**Files added:**
- `backend/utils/export.py` — `predict_completion()`
- `backend/tests/test_export.py` — 6 prediction unit tests

**Endpoint:** `GET /predict-readiness/{user_id}` (requires JWT)

**Sample response:**
```json
{
  "user_id": "user_abc",
  "role": "AI/ML Engineer",
  "current_readiness_score": 42.8,
  "prediction": {
    "status": "in_progress",
    "predicted_days_remaining": 4,
    "predicted_completion_date": "2026-06-14",
    "confidence": "HIGH",
    "score_velocity_per_day": 14.2,
    "basis": "historical_velocity"
  }
}
```

---

## RunbookAI

**Commits:** `b6e5842`

### Feature — Metrics Observability (`GET /metrics`)

**Problem:** RunbookAI had zero production observability. No way to know query volume, latency, or which incident categories were most common.

**Solution:** Thread-safe `MetricsCollector` singleton records every query call. `GET /metrics` exposes a live snapshot.

**What it tracks:**
- Total query count (rolling 500-query window)
- Latency P50 / P95 / P99 / min / max / avg (milliseconds)
- Category distribution: `kubernetes`, `database`, `network`, etc.
- Severity distribution: `P1`, `P2`, `P3`
- Confidence distribution: `HIGH`, `MEDIUM`, `LOW`, `NONE`
- Error rate %
- Rate-limit hit count
- Last 5 queries (metadata only, no incident text)

**Files added:**
- `utils/metrics.py` — `MetricsCollector` class + module-level `collector` singleton
- `routers/metrics_router.py` — `GET /metrics`, `POST /metrics/reset`
- `tests/test_metrics.py` — 12 tests, all passing

**Files modified:**
- `routers/query_router.py` — wraps `query_incident` with `time.monotonic()` timing; records result to `metrics_collector`
- `main.py` — registers `metrics_router`

**Endpoint:** `GET /metrics` (no auth required; add JWT guard for public deployments)

**Sample response:**
```json
{
  "total_queries": 48,
  "latency": { "p50_ms": 310, "p95_ms": 820, "p99_ms": 1200 },
  "categories": { "kubernetes": 22, "database": 14, "network": 8, "other": 4 },
  "confidence": { "HIGH": 35, "MEDIUM": 10, "LOW": 2, "NONE": 1 },
  "error_rate_pct": 2.08,
  "rate_limit_hits": 3
}
```

---

## Astro Intel Backend

**Commits:** `6d9cc08`

### Feature — Per-Agent Performance Breakdown (`GET /api/v1/metrics/agents/performance`)

**Problem:** The existing `GET /api/v1/metrics` dashboard only showed average latency per agent. Slow outliers were invisible — averages hide tail latency.

**Solution:** New `per_agent_performance()` method on `MetricsCollector` that computes full latency distribution per agent from the rolling run window.

**What it returns per agent:**
- `p50_ms`, `p95_ms`, `p99_ms` — tail latency for SLA analysis
- `avg_ms`, `min_ms`, `max_ms` — range
- `run_count` — sample size
- `error_count` — from existing `_agent_error_counts`

Plus a `_summary` block identifying the slowest agent by P95 for quick triage.

**Files modified:**
- `metrics/collector.py` — added `per_agent_performance()` method; fixed off-by-one bug in `total_agents_tracked` count
- `routers/metrics.py` — added `GET /api/v1/metrics/agents/performance` (auth: ADMIN+)

**Files added:**
- `tests/test_agent_performance.py` — 9 tests, all passing

**Endpoint:** `GET /api/v1/metrics/agents/performance` (requires ADMIN or SUPERADMIN)

**Sample response:**
```json
{
  "astrology_agent": { "p50_ms": 120, "p95_ms": 450, "p99_ms": 900, "run_count": 42 },
  "meta_agent":      { "p50_ms": 80,  "p95_ms": 200, "p99_ms": 380, "run_count": 42 },
  "_summary": {
    "slowest_agent_p95": "astrology_agent",
    "slowest_p95_ms": 450,
    "total_agents_tracked": 8,
    "total_runs_in_window": 42
  }
}
```

---

## Portfolio App

**Commits:** `5050c07`

### Feature — Tag-Based Project Filtering

**Problem:** With 5 projects listed, visitors couldn't filter by technology. Someone looking for "LangGraph" or "Kafka" work had to read every card.

**Solution:** Angular signal-based filter bar above the project grid. Zero backend dependency — pure client-side filtering.

**Implementation:**
- `activeTagFilter` signal (`string | null`) — currently selected tag, `null` = show all
- `filterTags` getter — builds unique tag list from all projects lazily (no hardcoding needed when new projects are added)
- `filteredProjects` getter — returns `projects.filter(p => p.tags.some(t => t.label === activeTag))`
- `setTagFilter(tag)` — toggles: click the same tag again → clears filter
- `clearTagFilter()` — explicit "All" button

**UI elements:**
- Filter bar with "All" chip + one chip per unique technology tag
- Active chip styled with solid purple background
- Result count badge ("3 projects") when a filter is active
- `@for` loop now iterates `filteredProjects` instead of `projects`

**Files modified:**
- `src/app/app.ts` — signals + filter logic (40 lines)
- `src/app/app.html` — filter bar template (28 lines, before project loop)
- `src/app/app.scss` — `.tag-filter-bar`, `.tag-chip`, `.tag-chip--active` styles (50 lines)

---

## Test Summary

| Project | New Tests | All Passing |
|---------|-----------|-------------|
| Bench Resource Optimizer | 15 | ✅ |
| RunbookAI | 12 | ✅ |
| Astro Intel Backend | 9 | ✅ |
| Portfolio App | — (Angular, no unit tests added) | — |
| **Total** | **36** | ✅ |

---

## Git Log

```
5050c07 feat(portfolio): add tag-based project filtering
6d9cc08 feat(astro-intel): add per-agent P50/P95/P99 performance endpoint
b6e5842 feat(runbook-ai): add metrics observability endpoint + query telemetry
557b7da feat(bench): add plan export (CSV/JSON) + readiness velocity prediction
```
