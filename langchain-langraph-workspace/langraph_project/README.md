# Banking AI Platform — LangGraph

Production-grade Banking AI System built with LangGraph, FastAPI, and LangChain.

---

## How to Run

### 1. Clone & install dependencies

```bash
cd langchain-langraph-workspace/langraph_project
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your keys:

```env
OPENAI_API_KEY=sk-...          # required
LANGCHAIN_API_KEY=ls__...      # optional — enables LangSmith tracing
LANGCHAIN_PROJECT=banking-ai   # optional — LangSmith project name
```

### 3. Start the server

```bash
python run.py
# or
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Server starts at **http://127.0.0.1:8000**

### 4. Open Swagger UI

```
http://127.0.0.1:8000/docs
```

All 11 endpoints are documented with descriptions and pre-filled examples you can run directly from the browser.

---

## API Endpoints

### Health

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/v1/health/` | Liveness check — returns `{"status": "ok"}` |

**Test:**
```bash
curl http://127.0.0.1:8000/api/v1/health/
```

---

### Transactions — Step 2

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/transactions/route` | Route a transaction through the classification graph |

**Test — payment:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/transactions/route \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"TXN-001","amount":1500,"merchant":"Amazon","category":"retail","account_id":"ACC-1001"}'
```

**Test — fraud flag:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/transactions/route \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"TXN-002","amount":9500,"merchant":"Unknown Vendor","category":"cash_advance","account_id":"ACC-1001","is_flagged":true}'
```

---

### Loans — Step 3

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/loans/eligibility` | Run applicant through 6-node eligibility workflow |

**Test — approved (strong applicant):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/loans/eligibility \
  -H "Content-Type: application/json" \
  -d '{"applicant_id":"app-001","loan_type":"personal","requested_amount":20000,"annual_income":80000,"credit_score":750,"employment_years":6,"existing_debt":500}'
```

**Test — rejected (low credit score):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/loans/eligibility \
  -H "Content-Type: application/json" \
  -d '{"applicant_id":"app-002","loan_type":"home","requested_amount":300000,"annual_income":90000,"credit_score":620,"employment_years":5,"existing_debt":0}'
```

**Test — rejected (high DTI):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/loans/eligibility \
  -H "Content-Type: application/json" \
  -d '{"applicant_id":"app-003","loan_type":"personal","requested_amount":50000,"annual_income":40000,"credit_score":700,"employment_years":3,"existing_debt":25000}'
```

---

### Accounts — Step 4

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/accounts/query` | Natural-language query answered by ReAct agent |

Available test accounts: `ACC-1001` (Alice, active), `ACC-1002` (Bob, savings), `ACC-1003` (Carol, frozen)

**Test — balance:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/accounts/query \
  -H "Content-Type: application/json" \
  -d '{"account_id":"ACC-1001","query":"What is my current balance?"}'
```

**Test — transaction history:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/accounts/query \
  -H "Content-Type: application/json" \
  -d '{"account_id":"ACC-1001","query":"Show me my last 3 transactions"}'
```

**Test — full summary:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/accounts/query \
  -H "Content-Type: application/json" \
  -d '{"account_id":"ACC-1002","query":"What is my account status and recent activity?"}'
```

---

### Compliance RAG — Step 5

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/compliance/query` | Ask compliance questions answered via FAISS RAG |

Categories: `aml` · `kyc` · `pci_dss` · `gdpr`

**Test — AML SAR deadline:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/compliance/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the deadline for filing a Suspicious Activity Report?","category":"aml"}'
```

**Test — KYC documents:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/compliance/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What documents are required for individual customer KYC?","category":"kyc"}'
```

**Test — GDPR breach window:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/compliance/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How many hours do we have to report a data breach under GDPR?","category":"gdpr"}'
```

---

### Conversation — Step 6

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/conversation/chat` | Multi-turn stateful chat with MemorySaver checkpoints |
| DELETE | `/api/v1/conversation/chat/{session_id}` | Clear a session (logout / fresh start) |

**Test — Turn 1 (new session):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/conversation/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-001","message":"What are the KYC requirements for opening an account?","account_id":"ACC-1001"}'
```

**Test — Turn 2 (same session — LLM remembers Turn 1):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/conversation/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-001","message":"And what about AML rules?"}'
```

**Test — clear session:**
```bash
curl -X DELETE http://127.0.0.1:8000/api/v1/conversation/chat/sess-001
```

---

### Loan Committee — Step 7

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/committee/evaluate` | 3-agent committee: Planner → Executor → Validator |

Verdicts: `approved` · `rejected` · `escalated`

**Test — approved (strong applicant):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/committee/evaluate \
  -H "Content-Type: application/json" \
  -d '{"application_id":"APP-001","applicant_name":"Alice Johnson","loan_type":"personal","requested_amount":20000,"annual_income":80000,"credit_score":750,"employment_years":6,"existing_debt":500}'
```

**Test — rejected (low credit):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/committee/evaluate \
  -H "Content-Type: application/json" \
  -d '{"application_id":"APP-002","applicant_name":"Bob Smith","loan_type":"home","requested_amount":300000,"annual_income":90000,"credit_score":620,"employment_years":5,"existing_debt":0}'
```

**Test — escalated (large loan + high risk):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/committee/evaluate \
  -H "Content-Type: application/json" \
  -d '{"application_id":"APP-003","applicant_name":"Carol Lee","loan_type":"business","requested_amount":150000,"annual_income":60000,"credit_score":640,"employment_years":0.5,"existing_debt":20000}'
```

---

### Resilience — Step 8

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/v1/resilience/query` | Query through circuit breaker → retry → fallback chain → timeout |
| GET | `/api/v1/resilience/status` | Current state of all circuit breakers |
| POST | `/api/v1/resilience/circuit/{name}` | Manually trip or reset a circuit breaker |

**Test — normal query:**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/resilience/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the current interest rate for a 30-year fixed mortgage?","intent":"loan"}'
```

**Test — check circuit breaker status:**
```bash
curl http://127.0.0.1:8000/api/v1/resilience/status
```

**Test — trip circuit (simulate outage):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/resilience/circuit/openai \
  -H "Content-Type: application/json" \
  -d '{"action":"trip"}'
```

**Test — reset circuit (restore normal):**
```bash
curl -X POST http://127.0.0.1:8000/api/v1/resilience/circuit/openai \
  -H "Content-Type: application/json" \
  -d '{"action":"reset"}'
```

---

## Monitoring

| Tool | URL | Notes |
|------|-----|-------|
| Swagger UI | http://127.0.0.1:8000/docs | Interactive API explorer |
| ReDoc | http://127.0.0.1:8000/redoc | Read-only reference docs |
| LangSmith | https://smith.langchain.com | Set `LANGCHAIN_API_KEY` in `.env` |
| Arize Phoenix | http://localhost:6006 | Run `phoenix serve` then restart app |

**Start Arize Phoenix locally:**
```bash
pip install 'arize-phoenix>=4.0.0' openinference-instrumentation-langchain
python -m phoenix.server.main serve
# then restart: python run.py
```

---

## Project Structure

```
app/
├── main.py                         # FastAPI app factory + middleware + openapi tags
├── config.py                       # Pydantic Settings (env-driven)
├── core/
│   ├── logger.py                   # Structured stdout logger
│   └── monitoring.py               # Arize Phoenix 4.x + LangSmith setup
├── api/routes/
│   ├── health.py                   # GET  /api/v1/health/
│   ├── transaction.py              # POST /api/v1/transactions/route
│   ├── loan.py                     # POST /api/v1/loans/eligibility
│   ├── account.py                  # POST /api/v1/accounts/query
│   ├── compliance.py               # POST /api/v1/compliance/query
│   ├── conversation.py             # POST /api/v1/conversation/chat
│   ├── loan_committee.py           # POST /api/v1/committee/evaluate
│   └── resilience.py               # POST /api/v1/resilience/query + status + circuit
├── graphs/
│   ├── transaction_router.py       # Step 2 — conditional routing graph
│   ├── loan_eligibility.py         # Step 3 — stateful multi-gate workflow
│   ├── account_agent.py            # Step 4 — ReAct tool-calling agent
│   ├── compliance_rag.py           # Step 5 — FAISS RAG with grading
│   ├── conversation_agent.py       # Step 6 — MemorySaver conversational agent
│   ├── loan_committee.py           # Step 7 — 3-agent Planner/Executor/Validator
│   └── resilient_agent.py          # Step 8 — circuit breaker + retry + fallback
├── resilience/
│   ├── circuit_breaker.py          # CLOSED/OPEN/HALF_OPEN state machine
│   └── llm_factory.py              # Composable resilience layers
├── memory/
│   └── store.py                    # MemorySaver singleton + long-term profile store
├── tools/
│   └── account_tools.py            # @tool: get_account_details, get_transactions
└── schemas/
    ├── transaction.py
    ├── loan.py
    ├── account.py
    ├── compliance.py
    ├── conversation.py
    └── loan_committee.py
```

---

## Steps Completed

| Step | Feature | Status |
|------|---------|--------|
| 1 | Project Setup — FastAPI, config, health route | ✅ |
| 2 | Transaction Routing Graph — conditional edges | ✅ |
| 3 | Loan Eligibility — stateful multi-step workflow | ✅ |
| 4 | Account Agent — ReAct tool-calling loop | ✅ |
| 5 | RAG Compliance Assistant — FAISS + graded retrieval | ✅ |
| 6 | Conversational Memory — MemorySaver + long-term profile | ✅ |
| 7 | Multi-Agent Loan Committee — Planner + Executor + Validator | ✅ |
| 8 | Resilience — retry + circuit breaker + fallback + timeout | ✅ |
| 9 | Observability (LangSmith + Arize Phoenix) | 🔜 |
| 10 | Security (JWT, RBAC, human-in-loop) | 🔜 |
| 11 | Autonomous Banking Agent | 🔜 |

See [ARCHITECTURE.md](ARCHITECTURE.md) for full node/edge diagrams for all graphs.
