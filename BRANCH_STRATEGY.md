# AstroIntel 360° — Enterprise Branching Strategy

## Branch Model: Trunk-Based with Environment Gates

```
feature/*  ──→  develop  ──→  staging  ──→  main (production)
hotfix/*   ──────────────────────────────→  main
```

---

## Branch Definitions

| Branch | Purpose | Who pushes | Deploys to | Protected |
|--------|---------|-----------|------------|-----------|
| `main` | Production-ready code only | GitHub Actions (promote.yml) | AWS ECS prod cluster | Yes — no direct push |
| `staging` | Pre-production verification | PR from develop | AWS ECS staging cluster | Yes — PR required |
| `develop` | Integration of all features | PR from feature/* | No deploy — CI tests only | Yes — PR required |
| `feature/*` | Individual feature / fix | Developer | No deploy | No |
| `hotfix/*` | Emergency production fix | Developer | No deploy (manual promote) | No |

---

## The Flow — Step by Step

### Normal feature development

```bash
# 1. Cut a feature branch from develop (NEVER from main)
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# 2. Work, commit, push
git add <files>
git commit -m "feat: your change description"
git push origin feature/your-feature-name

# 3. Open a PR: feature/your-feature-name → develop
#    - CI (test.yml) must pass: pytest + ng build
#    - At least 1 reviewer approval required
#    - Merge with --no-ff (preserve history)

# 4. PR is merged into develop → CI runs again on develop push
```

### Moving to staging

```bash
# After enough features are merged into develop and you want to test in staging:
# Open a PR: develop → staging
#   - CI (test.yml) runs again as gate
#   - build-push.yml runs after merge: builds Docker images tagged :staging + :<sha>
#   - deploy.yml runs: deploys to astrointel-staging-cluster
#   - You manually verify staging at https://staging.aurawithrav.com
```

### Releasing to production

```bash
# NEVER push directly to main.
# Use promote.yml (manual workflow dispatch):
#   1. Go to GitHub → Actions → "Promote — staging → main"
#   2. Click "Run workflow"
#   3. Enter the 8-char SHA you verified on staging
#   4. Enter release notes (e.g. "Add Kafka async pipeline + Redis L2 cache")
#   5. A production approver must approve the GitHub Environment gate
#   6. Workflow: verifies staging ECS health → merges staging→main → build-push runs on main
#   7. build-push.yml: builds images tagged :latest + :<sha>, deploys to astrointel-cluster (prod)
```

### Hotfix (production is broken right now)

```bash
# Cut from main, fix, test locally, then use promote.yml
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix-name

# Fix it, commit
git commit -m "fix: critical description"
git push origin hotfix/critical-fix-name

# Open PR: hotfix/critical-fix-name → main
# After merge to main → build-push + deploy runs automatically
# Then backport to develop:
git checkout develop
git pull origin develop
git merge origin/main --no-ff -m "chore: backport hotfix to develop"
git push origin develop
```

---

## CI/CD Pipeline Map

```
Push to feature/*     → nothing (no workflow)
PR to develop         → test.yml (pytest + ng build) — MUST PASS to merge
Push to develop       → test.yml (on push: develop)
PR to staging         → test.yml — MUST PASS to merge
Push to staging       → build-push.yml (tests → build :staging images → deploy to staging ECS)
PR to main            → blocked — use promote.yml only
promote.yml runs      → merges staging→main → build-push.yml on main → deploy.yml to prod ECS
```

### Workflow files and what they do

| File | Triggers on | What it does |
|------|-------------|--------------|
| `test.yml` | PR to develop/staging/main + push to develop | pytest + ng build — pure CI gate |
| `build-push.yml` | Push to staging or main | Tests (inline gate) + Docker build + ECR push |
| `deploy.yml` | After build-push completes on staging/main | ECS rolling update (staging or prod based on branch) |
| `promote.yml` | Manual dispatch only | Verifies staging health → merges staging→main → triggers build chain |
| `bench-ci.yml` | PR/push to main (Bench project only) | Bench Resource Optimizer CI — separate project |

---

## Image Tagging Convention

| Branch | Tags applied |
|--------|-------------|
| `staging` | `:staging` + `:<8-char-sha>` |
| `main` | `:latest` + `:<8-char-sha>` |

Always deploy by SHA tag — never by `:staging` or `:latest` in production commands (those are mutable; SHA tags are immutable).

---

## Branch Protection Rules (configure in GitHub Settings)

### `main`
- Require PR — direct push disabled
- Required status checks: (none — only promote.yml merges here, already gated)
- Require linear history: enabled
- Restrict who can merge: only GitHub Actions bot (via promote.yml)

### `staging`
- Require PR from develop
- Required status checks: `Backend Tests (pytest)`, `Frontend Build (ng build)`
- Require 1 reviewer approval

### `develop`
- Require PR from feature/*
- Required status checks: `Backend Tests (pytest)`, `Frontend Build (ng build)`
- No approvals required (solo dev — relax this for team work)

---

## Commit Message Convention

```
type: short description (max 72 chars)

[optional body]
```

Types:
- `feat:` — new feature
- `fix:` — bug fix
- `perf:` — performance improvement
- `docs:` — documentation only
- `chore:` — maintenance (deps, CI, configs)
- `test:` — tests only
- `release:` — created by promote.yml for production merges

---

## Folder Structure (Monorepo)

```
ai-engineer/                         ← repo root
├── astro-intel/                     ← Angular frontend (AstroIntel 360°)
├── astro-intel-backend/             ← FastAPI backend (AstroIntel 360°)
├── bench-resource-optimizer/        ← Bench project (separate product)
├── langchain_project/               ← Interview demo project
├── senior-ai-engineer/              ← Study materials / interview prep
├── .github/workflows/               ← All CI/CD workflows
├── docker-compose.yml               ← Simple dev compose (SQLite, no Kafka/Redis)
│                                       Run from repo root: docker-compose up --build
├── BRANCH_STRATEGY.md               ← This file
├── PRODUCTION_DEPLOYMENT_GUIDE.md   ← AWS/ECS deployment guide
└── README.md                        ← Project overview

astro-intel-backend/docker-compose.yml
    ← Enterprise compose (Kafka + Redis + ZooKeeper + UIs)
    ← Run from astro-intel-backend/: docker-compose up --build
```

**Two docker-compose files — when to use which:**

| File | Use when |
|------|----------|
| Root `docker-compose.yml` | Local dev — simple stack, SQLite, no Kafka/Redis |
| `astro-intel-backend/docker-compose.yml` | Full enterprise stack — Kafka, Redis, Kafka-UI, Redis-Commander |

---

## GitHub Secrets Required

| Secret | Used by | Description |
|--------|---------|-------------|
| `AWS_ACCOUNT_ID` | build-push, deploy, promote | Your AWS account number |
| `AWS_DEPLOY_ROLE_ARN` | build-push, deploy, promote | IAM role ARN with OIDC trust for GitHub Actions |
| `BACKEND_URL` | test.yml (optional) | Override API URL at Angular build time |

All LLM keys, JWT secrets, and database passwords are set as ECS task definition environment variables — never stored as GitHub secrets.
