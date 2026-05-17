# AstroIntel 360° — Full-Stack AI Astrology Platform

**Built by Rav Singh Chandan · Senior AI Engineer**

An end-to-end multi-agent AI platform for personalised astrology readings. Users submit their birth data, a 9-agent LangGraph pipeline (numerology, astrology, palmistry, tarot, vastu, remedies, meta, review, report) produces a structured insight report, which admins review and publish. The system includes RBAC auth, semantic caching, multi-layer guardrails, RAG-based question classification, and a live metrics dashboard.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AstroIntel 360°                          │
│                                                                 │
│   ┌─────────────┐      ┌──────────────────┐    ┌────────────┐  │
│   │  Angular 17 │─────▶│  FastAPI Backend  │───▶│  OpenAI   │  │
│   │  Frontend   │      │  + LangGraph      │    │  LLM API  │  │
│   │  (Port 4200)│◀─────│  (Port 8080)      │    └────────────┘  │
│   └─────────────┘      └────────┬─────────┘                    │
│                                 │                               │
│                    ┌────────────▼──────────┐                   │
│                    │    SQLite (current)    │                   │
│                    │    → PostgreSQL (next) │                   │
│                    └───────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 17, standalone components, signals |
| Backend | FastAPI, Python 3.11, uvicorn |
| AI Pipeline | LangGraph multi-agent graph, LangChain, OpenAI GPT-4o |
| Relational DB | SQLite (WAL mode) → PostgreSQL (cloud) |
| Vector DB | RAG multi-query module → Pinecone/pgvector (cloud) |
| Auth | JWT + RBAC (user / admin / superadmin) |
| Email | Resend.com API |
| Cache | In-memory semantic cache with TTL |
| Guardrails | G1 rate limiter, G2 circuit breaker, G3 graceful degradation |

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+, Angular CLI 17+
- Python 3.11+
- A `.env` file in `astro-intel-backend/` (copy from `.env.example`)

### Backend
```bash
cd astro-intel-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
# API docs: http://localhost:8080/docs
```

### Frontend
```bash
cd astro-intel
npm install
ng serve
# App: http://localhost:4200
```

### Docker (Full Stack Local)
```bash
cd astro-intel-backend
docker-compose up --build
# Backend on :8080
```

---

## Cloud Deployment Strategy

> **DevOps Architect Decision · Rav Singh Chandan · 2026-05-17**

### Guiding Principles
1. **Immutable infrastructure** — every deploy ships a versioned Docker image, never SSH + git pull
2. **Secrets never in code** — `.env` files only locally; AWS Secrets Manager in cloud
3. **Zero-downtime deploys** — rolling updates via ECS, health checks gate every release
4. **Test before ship** — CI runs pytest + Angular build on every PR; no merge without green
5. **Separation of concerns** — frontend (static CDN), backend (container), DB (managed service) are independent units

---

### Target Cloud Architecture (AWS)

```
Developer → GitHub Push
               │
               ▼
    ┌──────────────────────┐
    │   GitHub Actions CI  │
    │  ① pytest (backend)  │
    │  ② ng build (front)  │
    │  ③ docker build+push │
    │     → AWS ECR        │
    └──────────┬───────────┘
               │ on main merge
               ▼
    ┌──────────────────────────────────────────────────┐
    │                    AWS Cloud                     │
    │                                                  │
    │  ┌──────────────┐      ┌────────────────────┐   │
    │  │  CloudFront  │      │  Application Load  │   │
    │  │  (HTTPS CDN) │      │  Balancer (ALB)    │   │
    │  └──────┬───────┘      └─────────┬──────────┘   │
    │         │                        │               │
    │  ┌──────▼───────┐      ┌─────────▼──────────┐   │
    │  │  S3 Bucket   │      │   ECS Fargate       │   │
    │  │  Angular     │      │   FastAPI (Docker)  │   │
    │  │  dist/       │      │   2 tasks min       │   │
    │  └──────────────┘      └─────────┬──────────┘   │
    │                                  │               │
    │                    ┌─────────────▼────────────┐  │
    │                    │  RDS PostgreSQL           │  │
    │                    │  + pgvector extension     │  │
    │                    │  (replaces SQLite + RAG)  │  │
    │                    └──────────────────────────┘  │
    │                                                  │
    │  AWS Secrets Manager → OpenAI key, JWT secret,  │
    │                         Resend key, DB password  │
    └──────────────────────────────────────────────────┘
```

---

### Implementation Phases

#### Phase 1 — Docker (Local Full Stack) ← Start here
- [ ] Fix backend `Dockerfile` — SQLite volume, env-driven DB path
- [ ] Create frontend `Dockerfile` — multi-stage: `ng build` → Nginx serve
- [ ] Update `docker-compose.yml` — add frontend service + named volumes
- [ ] Smoke test: `docker-compose up`, hit `localhost:4200` end-to-end

#### Phase 2 — Database Upgrade
- [ ] Swap SQLite → PostgreSQL in `database.py` via `DATABASE_URL` env var
- [ ] Add `psycopg2-binary` to `requirements.txt`
- [ ] Wire pgvector for RAG embeddings (replace in-memory store)
- [ ] Run migration, verify all API endpoints

#### Phase 3 — CI/CD Pipeline (GitHub Actions)
- [ ] `.github/workflows/test.yml` — on every PR: `pytest`, `ng build --prod`
- [ ] `.github/workflows/build-push.yml` — on merge to main: Docker build → push to ECR
- [ ] `.github/workflows/deploy.yml` — on ECR push: ECS rolling deploy

#### Phase 4 — Cloud Infrastructure
- [ ] Frontend: S3 bucket + CloudFront distribution + ACM HTTPS cert
- [ ] Backend: ECS Fargate cluster + task definition + ALB target group
- [ ] Database: RDS PostgreSQL (db.t3.micro to start), pgvector enabled
- [ ] Secrets: AWS Secrets Manager for all sensitive values

#### Phase 5 — Production Hardening
- [ ] Auto-scaling: ECS scales 2→10 tasks on CPU > 60%
- [ ] CloudWatch alarms: error rate, p95 latency, DB connections
- [ ] Environment promotion: `dev` → `staging` → `prod` via workflow dispatch
- [ ] Cost guardrail: AWS Budget alert at $50/month

---

### Key Architectural Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Frontend hosting | S3 + CloudFront | Cheapest, fastest, zero maintenance |
| Backend runtime | ECS Fargate | No EC2 to manage, scales to zero when idle |
| DB (relational) | RDS PostgreSQL | SQLite can't handle concurrent writes in containers |
| DB (vector) | pgvector on RDS | Same DB instance — no extra managed service cost |
| Image registry | AWS ECR | Native ECS integration, free tier generous |
| Secrets | AWS Secrets Manager | Rotatable, auditable, no `.env` files in cloud |
| CI/CD | GitHub Actions | Already on GitHub, free for public repos |
| HTTPS | ACM + CloudFront | Free TLS certificates, auto-renew |

---

### What's Built (All Phases Complete)

| Artifact | Status |
|---------|--------|
| `astro-intel/Dockerfile` | ✅ Multi-stage: ng build → Nginx |
| `astro-intel/nginx.conf` | ✅ SPA routing, gzip, static asset caching |
| `astro-intel-backend/Dockerfile` | ✅ Multi-stage Python, non-root user, volume mount |
| `docker-compose.yml` (root) | ✅ Full stack: frontend + backend + optional PostgreSQL |
| `astro-intel-backend/database.py` | ✅ SQLite + PostgreSQL dual-backend via DATABASE_URL |
| `.github/workflows/test.yml` | ✅ pytest + ng build on every PR |
| `.github/workflows/build-push.yml` | ✅ Docker build → ECR push on main merge |
| `.github/workflows/deploy.yml` | ✅ ECS rolling deploy, circuit-breaker rollback |
| `.github/workflows/promote.yml` | ✅ Manual dev → staging → prod promotion |
| `infra/01-ecr.sh` | ✅ ECR repository creation |
| `infra/02-s3-cloudfront.sh` | ✅ S3 bucket + CloudFront distribution |
| `infra/03-rds-postgres.sh` | ✅ RDS PostgreSQL + pgvector |
| `infra/04-secrets-manager.sh` | ✅ AWS Secrets Manager — all app secrets |
| `infra/05-ecs-fargate.sh` | ✅ ECS cluster + Fargate task definitions + services |
| `infra/06-autoscaling-alarms.sh` | ✅ CloudWatch alarms + auto-scaling (2–10 tasks) |

---

### Environment Variables Reference

```env
# Backend (.env)
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
JWT_SECRET=<random 32 bytes>
MASTER_API_KEY=<random 32 bytes>
PW_SALT=<random 32 bytes>
SUPERADMIN_PASSWORD=<strong password>
APP_ENV=development          # → production in cloud
DATABASE_URL=sqlite:///...   # → postgresql://... in cloud
SQLITE_DB_PATH=astrointel.db
ALLOWED_ORIGINS=http://localhost:4200
```

---

## Project Structure

```
ai-engineer/
├── astro-intel/                  # Angular 17 frontend
│   ├── src/app/pages/            # login, intake, review, report, metrics, admin-users, profile
│   ├── src/app/services/         # api.service, auth.service
│   ├── src/environments/         # environment.ts (apiUrl)
│   └── Dockerfile                # (to be created — Phase 1)
│
└── astro-intel-backend/          # FastAPI backend
    ├── agents/                   # 9 LangGraph agents
    ├── auth/                     # JWT, RBAC, store
    ├── leads/                    # Lead management
    ├── metrics/                  # Live KPI collector
    ├── guardrails/               # G1 rate limit, G2 circuit breaker, G3 degradation
    ├── rag/                      # Multi-query RAG module
    ├── graph/                    # LangGraph pipeline wiring
    ├── database.py               # SQLite persistence layer
    ├── main.py                   # FastAPI app entry point
    ├── Dockerfile                # Backend container
    ├── docker-compose.yml        # Local orchestration
    └── deploy-ec2.sh             # Legacy EC2 deploy (being replaced)
```

---

## Running Tests

```bash
# Backend
cd astro-intel-backend
pytest tests/ -v

# Frontend build check
cd astro-intel
ng build --configuration production
```

---

---

## Deployment Runbook

### Local Docker (Full Stack)
```bash
# SQLite mode (default)
docker-compose up --build

# PostgreSQL mode
docker-compose --profile postgres up --build
# Then set DATABASE_URL in docker-compose.yml environment section
```

### First-Time Cloud Setup (run once)
```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=<your-account-id>

bash infra/01-ecr.sh                    # Create ECR repos
bash infra/02-s3-cloudfront.sh          # Frontend CDN
bash infra/03-rds-postgres.sh           # Database
bash infra/04-secrets-manager.sh        # Secrets
bash infra/05-ecs-fargate.sh            # Compute
bash infra/06-autoscaling-alarms.sh     # Monitoring
```

### GitHub Secrets Required
| Secret | Value |
|--------|-------|
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN for GitHub OIDC |
| `OPENAI_API_KEY` | From OpenAI dashboard |

### Deploy Flow
```
git push → PR opened
  → test.yml runs (pytest + ng build)
  → PR approved + merged to main
  → build-push.yml runs (Docker build + ECR push)
  → deploy.yml runs (ECS rolling update)
  → promote.yml (manual: staging → prod)
```

### Rollback
In GitHub Actions → deploy.yml → Run workflow → enter previous image tag.
ECS circuit breaker auto-rolls back if health checks fail during deploy.

---

*This README is the single source of truth for architecture and deployment decisions. Last updated: 2026-05-17*
