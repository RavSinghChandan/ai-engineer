# AstroIntel Backend

Enterprise-grade Python/FastAPI backend powering the **Aura with Rav** spiritual intelligence platform. Combines Vedic astrology, numerology, palmistry, tarot, and vastu in a multi-agent LangGraph pipeline with production-grade guardrails.

---

## Architecture

```
FastAPI (main.py)
├── auth/              — JWT + API-key auth, RBAC, OTP, tenant management
├── routers/
│   ├── analysis.py    — /run, /approve, /translate, /simplify-bullets, /story, /remedies
│   └── async_analysis.py — /submit (async job), /job/{id} poll, /jobs/stats
├── graph/pipeline.py  — LangGraph orchestration (15 agents)
├── agents/            — question, astrology, numerology, palmistry, tarot, vastu,
│                        meta, admin_review, report, storytelling, grammar,
│                        plain_english, simplify, translation, numerology_rag
├── guardrails/        — safe_node wrapper, circuit breaker, rate limiter, PII filter, JSON repair
├── memory/episodic.py — Tenant-scoped correction store + persona preferences
├── session_store.py   — Write-through SQLite/PostgreSQL session persistence
├── cache/             — In-memory L1 + semantic cache (SentenceTransformer) + Redis L2 + pub/sub
├── leads/             — Lead capture, status workflow, report attachment
├── pipeline_queue/    — Kafka async job producer/consumer with DLQ + retry
├── utils/
│   ├── astro_calc.py  — Swiss Ephemeris Vedic chart computation
│   ├── deepseek_client.py — DeepSeek LLM via urllib (circuit-breaker wrapped)
│   └── event_bus.py   — In-process session pub/sub
└── database.py        — SQLite (local) / PostgreSQL (cloud) abstraction
```

---

## Test Coverage

| Metric | Value |
|--------|-------|
| **Total coverage** | **91%** |
| Test files | 18 |
| Tests passing | 1,263 |
| Tests skipped | 9 |
| Statement count | 14,814 |

### Key module coverage

| Module | Coverage |
|--------|---------|
| `guardrails/production.py` | 99% |
| `routers/async_analysis.py` | 100% |
| `email_service.py` | 95% |
| `memory/episodic.py` | 91% |
| `session_store.py` | 90% |
| `pipeline_queue/consumer.py` | 89% |
| `cache/redis_store.py` | 88% |
| `auth/dependencies.py` | 95% |
| `auth/store.py` | 95% |
| `auth/users.py` | 95% |

---

## SonarQube Quality Gate

**Status: PASSED**

| Metric | Result |
|--------|--------|
| Bugs | 0 |
| Vulnerabilities | 0 |
| Security Hotspots | 0 |
| Code Smells | 0 |
| Coverage | 91% |
| Duplications | < 3% |

See [SONARQUBE_REPORT.md](SONARQUBE_REPORT.md) for full details.

---

## Quick Start

```bash
# 1. Clone and set up environment
cd astro-intel-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env          # Add DEEPSEEK_API_KEY
# Optional: REDIS_ENABLED=true, KAFKA_ENABLED=true, DATABASE_URL (PostgreSQL)

# 3. Start the server
uvicorn main:app --reload --port 8000

# 4. API docs available at
open http://localhost:8000/docs
```

---

## Running Tests

```bash
# Full test suite with coverage
python -m pytest tests/ --cov=. --cov-report=term-missing --cov-config=.coveragerc -q \
  --ignore=tests/test_live_pipeline.py --ignore=tests/test_accuracy.py

# Generate XML for SonarQube
python -m pytest tests/ --cov=. --cov-report=xml:coverage.xml --cov-config=.coveragerc -q

# Live pipeline tests (requires DEEPSEEK_API_KEY)
TEST_LIVE_API_KEY=your-key python -m pytest tests/test_live_pipeline.py -v
```

---

## API Endpoints

### Analysis Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/analysis/run` | Run full synchronous pipeline |
| POST | `/api/v1/analysis/approve` | Admin approve → generate final report |
| POST | `/api/v1/analysis/submit` | Submit async job (Kafka/inline) |
| GET | `/api/v1/analysis/job/{job_id}` | Poll async job status |
| GET | `/api/v1/analysis/jobs/stats` | Job queue statistics |
| GET | `/api/v1/analysis/session/{id}` | Retrieve stored session |
| GET | `/api/v1/analysis/memory/{id}` | Raw memory dump (admin) |
| POST | `/api/v1/analysis/translate` | Translate report to 22 Indian languages |
| POST | `/api/v1/analysis/simplify-bullets` | Plain-English bullet rewriter |
| POST | `/api/v1/analysis/remedies` | RAG-grounded numerology remedies |
| POST | `/api/v1/analysis/story` | Storytelling narrative merge |
| GET | `/api/v1/analysis/languages` | Supported translation languages |

### Auth & Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login → JWT token |
| POST | `/auth/otp/phone/send` | Send phone OTP |
| POST | `/auth/otp/phone/verify` | Verify phone OTP |
| POST | `/auth/password/reset` | Password reset via OTP |
| POST | `/auth/password/change` | Change authenticated user's password |
| GET | `/admin/my-tenant` | Tenant info |
| GET | `/admin/my-keys` | List API keys for tenant |
| GET | `/admin/all-keys` | All keys (superadmin) |
| PATCH | `/admin/tenants/{id}/lock` | Lock tenant |
| DELETE | `/admin/tenants/{id}` | Delete tenant |

### Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/leads` | Submit new lead |
| GET | `/leads/{id}` | Get lead |
| GET | `/leads/{id}/report` | Download attached report |
| GET | `/admin/leads` | List all leads (admin) |
| PATCH | `/admin/leads/{id}/status` | Update lead status |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | — | **Required** for LLM calls |
| `DATABASE_URL` | SQLite | PostgreSQL URL for production |
| `REDIS_ENABLED` | `false` | Enable Redis distributed cache |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis cache URL |
| `KAFKA_ENABLED` | `false` | Enable Kafka async job queue |
| `KAFKA_BOOTSTRAP` | `localhost:9092` | Kafka bootstrap servers |
| `RESEND_API_KEY` | — | Resend email provider |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | — | SMTP fallback |

---

## Pipeline Agents

The LangGraph pipeline runs 15 agents in sequence/parallel:

1. **question_agent** — Classify, split, normalize questions
2. **astrology_agent** — Vedic chart (Swiss Ephemeris), Lagna, Moon sign, Dasha
3. **numerology_agent** — Life path, destiny, soul, personality numbers
4. **palmistry_agent** — Hand features interpretation
5. **tarot_agent** — Card draw and reading
6. **vastu_agent** — Directional energy analysis
7. **meta_agent** — Cross-tradition synthesis and consensus
8. **admin_review_agent** — Structure insights for admin review UI
9. **remedy_agent** — Personalized remedies per insight
10. **storytelling_agent** — Narrative merge via RAG
11. **plain_english_agent** — Jargon replacement
12. **grammar_agent** — Prose polish
13. **simplify_agent** — Plain-language rewrite with birth-month WHEN windows
14. **translation_agent** — 22 Indian Constitutional languages
15. **final_report_agent** — PDF-ready structured report

---

## See Also

- [SONARQUBE_REPORT.md](SONARQUBE_REPORT.md) — Full quality gate evidence
- [DEMO.md](DEMO.md) — End-to-end walkthrough with sample API calls
