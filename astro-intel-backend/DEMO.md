# AstroIntel Backend — Demo Walkthrough

A complete end-to-end demonstration of the Aura with Rav spiritual intelligence API.

---

## 🆕 360° Holistic Life Report (added 2026-07-27)

A **second, parallel flow** alongside the question-driven one. The user provides
**only birth details — no question** — and receives a **20-30 page storytelling
"book"**: 14 chapters (in hierarchy of importance) covering their whole life
through numerology, each written as a `[HOOK]…[REMEDIES]` story arc using the
same RAG + storytelling engine, so the PDF renders identically.

**Structure — a 5-Act journey** (not 14 flat essays), so the book reads as one
story that builds:
- **Act I — Who You Are:** Life Path · Destiny & Expression · Soul Urge · Personality
- **Act II — How You Move Through Life:** Birthday · Maturity
- **Act III — Your Life Domains:** Career & Money · Love · Health · Family & Home
- **Act IV — Your Timeline Ahead:** Personal Growth · The Year Ahead · Life Cycles
- **Act V — Your Guide:** Lucky Guide & Remedies

Each chapter has a **distinct angle, a fresh opening, and its own timing lens**
(no repeated hooks, no "Personal Year 8/9" pasted everywhere). Prose is
story-first, second-person, numbers woven in lightly — driven by a chapter-aware
prompt (`_chapter_story`) with a retry so no chapter falls back to textbook voice.

**Endpoints** (mirror the Q&A pair; human-in-loop preserved):
```bash
# 1) Generate the 14-chapter book (birth details only)
curl -s -X POST http://localhost:8080/api/v1/analysis/run-holistic \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"user_profile":{"full_name":"Rav Singh Chandan","date_of_birth":"1995-08-19"}}'
# -> { session_id, holistic_review: { chapters: [ {title, story, ...} x14 ] } }

# 2) Approve chapters (empty approved list = keep all but rejected) -> final book
curl -s -X POST http://localhost:8080/api/v1/analysis/approve-holistic \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"session_id":"<from step 1>","approved_chapter_ids":["life_path","career"]}'
```

**Frontend:** Intake page has a mode toggle — **💬 Ask a Question** vs
**📖 Full 360° Life Report**. In 360° mode the question field is hidden; on submit
it calls `runHolistic()`, maps the chapters into the existing review/PDF
structures, and renders the same storytelling UI/UX (review page + jsPDF export).

**Architecture:** fully additive — new files `agents/holistic_agent.py`,
`graph/holistic_pipeline.py`, `tests/test_holistic.py`; the question-driven
`/run` + `/approve` flow is **untouched**. 72 tests pass (7 new + existing).

---

## Prerequisites

```bash
# Start the server
cd astro-intel-backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Set your API key (from admin panel or seeded in auth_keys.json)
export API_KEY="your-api-key-here"
```

---

## Step 1: Register a User

```bash
curl -s -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "name": "Arjun Sharma",
    "password": "SecurePass123!",
    "phone": "9876543210"
  }' | jq .
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "tenant_id": "tenant_abc123",
  "role": "user"
}
```

---

## Step 2: Submit a Lead

```bash
curl -s -X POST http://localhost:8000/leads \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "name": "Arjun Sharma",
    "email": "arjun@example.com",
    "phone": "9876543210",
    "dob": "1990-05-15",
    "consent": true,
    "place_of_birth": "Delhi",
    "time_of_birth": "10:30",
    "question": "What does my chart say about my career in 2026?"
  }' | jq .
```

**Response:**
```json
{
  "lead_id": "lead_7f3a1b2c",
  "status": "submitted",
  "message": "Lead received. Analysis will begin shortly."
}
```

---

## Step 3: Run the Full Analysis Pipeline

```bash
curl -s -X POST http://localhost:8000/api/v1/analysis/run \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "user_profile": {
      "full_name": "Arjun Sharma",
      "date_of_birth": "1990-05-15",
      "time_of_birth": "10:30",
      "place_of_birth": "Delhi"
    },
    "user_question": "What does my chart say about my career in 2026?",
    "selected_modules": ["astrology", "numerology", "tarot"]
  }' | jq '{session_id, cache_hit, agent_log: (.agent_log | length)}'
```

**Response:**
```json
{
  "session_id": "3f8a2b1c-...",
  "cache_hit": false,
  "agent_log": 15
}
```

> The pipeline runs 15 agents in sequence. On first call: ~20–30s (LLM bound).
> On repeat calls with the same profile: instant (semantic cache hit).

---

## Step 4: View Admin Review Data

```bash
SESSION_ID="3f8a2b1c-..."

curl -s http://localhost:8000/api/v1/analysis/session/$SESSION_ID \
  -H "X-API-Key: $API_KEY" | jq '.admin_review.questions[0].question'
```

**Response:**
```
"What does my chart say about my career in 2026?"
```

---

## Step 5: Approve and Generate Final Report

```bash
curl -s -X POST http://localhost:8000/api/v1/analysis/approve \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"approved_insight_ids\": [\"ins_1\", \"ins_2\", \"ins_3\"],
    \"rejected_insight_ids\": [],
    \"brand_name\": \"Aura with Rav\"
  }" | jq '{session_id, report_sections: (.final_report.sections | length)}'
```

**Response:**
```json
{
  "session_id": "3f8a2b1c-...",
  "report_sections": 4
}
```

---

## Step 6: Translate Report to Hindi

```bash
curl -s -X POST http://localhost:8000/api/v1/analysis/translate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"language_code\": \"hi\"
  }" | jq '{language_code, language_name}'
```

**Response:**
```json
{
  "language_code": "hi",
  "language_name": "Hindi"
}
```

---

## Step 7: Simplify Bullets for Client Display

```bash
curl -s -X POST http://localhost:8000/api/v1/analysis/simplify-bullets \
  -H "Content-Type: application/json" \
  -d '{
    "bullets": [
      "Jupiter transiting your 10th house during Mahadasha of Moon augurs a propitious period for career advancement.",
      "Your Life Path 7 indicates a phase of introspection and spiritual alignment with professional goals."
    ]
  }' | jq '.bullets[]'
```

**Response:**
```
"Jupiter moves through your career area, bringing great job opportunities this year."
"Your life path shows a time to think deeply and align your work with what feels right to you."
```

---

## Step 8: Get RAG Remedies

```bash
curl -s -X POST http://localhost:8000/api/v1/analysis/remedies \
  -H "Content-Type: application/json" \
  -d '{"life_path": 7, "intent": "career"}' | jq '.remedies[]'
```

**Response:**
```json
{"icon": "🕉", "category": "Mantra", "text": "Chant Om Namah Shivaya 108 times at sunrise"}
{"icon": "💎", "category": "Gemstone", "text": "Wear blue sapphire on right middle finger"}
{"icon": "🌅", "category": "Daily Practice", "text": "Meditate for 11 minutes before speaking each morning"}
```

---

## Step 9: Async Job Submission (Kafka/Inline)

```bash
# Submit job (returns immediately)
JOB_RESP=$(curl -s -X POST http://localhost:8000/api/v1/analysis/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "user_profile": {
      "full_name": "Priya Patel",
      "date_of_birth": "1985-09-22",
      "time_of_birth": "14:15",
      "place_of_birth": "Mumbai"
    },
    "user_question": "Will I find love this year?"
  }')

JOB_ID=$(echo $JOB_RESP | jq -r '.job_id')
echo "Job submitted: $JOB_ID"

# Poll until done
while true; do
  STATUS=$(curl -s "http://localhost:8000/api/v1/analysis/job/$JOB_ID" \
    -H "X-API-Key: $API_KEY" | jq -r '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done
```

---

## Step 10: View Metrics Dashboard

```bash
# Job queue stats
curl -s http://localhost:8000/api/v1/analysis/jobs/stats \
  -H "X-API-Key: $API_KEY" | jq .

# Guardrail stats
curl -s http://localhost:8000/api/v1/metrics/guardrails \
  -H "X-API-Key: $API_KEY" | jq .

# Redis cache stats (if Redis enabled)
curl -s http://localhost:8000/api/v1/metrics/cache \
  -H "X-API-Key: $API_KEY" | jq .
```

---

## Supported Languages (Translation)

```bash
curl -s http://localhost:8000/api/v1/analysis/languages | jq '.languages'
```

22 Indian Constitutional languages:
`hi`, `bn`, `te`, `mr`, `ta`, `ur`, `gu`, `kn`, `ml`, `or`, `pa`, `as`, `mai`, `sa`, `kok`, `doi`, `mni`, `sat`, `ks`, `sd`, `bo`, `ne`

---

## Angular UI Walkthrough

The Angular frontend (`astro-intel-ui/`) mirrors these API calls:

1. **Intake Form** (`/`) — Collect name, DOB, TOB, place, questions
2. **Analysis Spinner** — Polls `/job/{id}` every 2s with progress animation
3. **Admin Review** — Insight cards with approve/reject/edit controls
4. **Report Preview** — Structured PDF-ready report with remedies
5. **Translation Panel** — Dropdown → re-renders report in chosen language
6. **Leads Dashboard** (`/admin/leads`) — Status workflow: submitted → admin_notified → expert_analysis → report_ready

---

## Architecture Decision: Sync vs Async Pipeline

| Mode | Endpoint | Use case |
|------|----------|----------|
| Synchronous | `/api/v1/analysis/run` | Direct client calls, simple integrations |
| Async (Kafka/inline) | `/api/v1/analysis/submit` + poll | High-volume, queue-backed production |

When `KAFKA_ENABLED=false` (default), `/submit` runs the pipeline in a background thread — same async polling UX without Kafka infrastructure.
