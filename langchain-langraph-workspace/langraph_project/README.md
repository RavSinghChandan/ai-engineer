# Banking AI Platform — LangGraph

Production-grade Banking AI System built with LangGraph, FastAPI, and LangChain.

## Quick Start

```bash
cp .env.example .env          # add your OPENAI_API_KEY
pip install -r requirements.txt
python run.py
# → http://localhost:8000/docs
```

## Graph Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for full node/edge diagrams (ASCII + Mermaid) for all graphs.

## Project Structure

```
app/
├── main.py                    # FastAPI app factory
├── config.py                  # Pydantic Settings (env-driven)
├── api/routes/
│   ├── health.py              # GET  /api/v1/health/
│   ├── transaction.py         # POST /api/v1/transactions/route
│   ├── loan.py                # POST /api/v1/loans/eligibility
│   └── account.py             # POST /api/v1/accounts/query
├── graphs/
│   ├── transaction_router.py  # Step 2 — conditional routing graph
│   ├── loan_eligibility.py    # Step 3 — stateful multi-gate workflow
│   └── account_agent.py       # Step 4 — ReAct tool-calling agent
├── tools/
│   └── account_tools.py       # @tool: get_account_details, get_transactions
└── schemas/
    ├── transaction.py
    ├── loan.py
    └── account.py
```

## Steps Completed

| Step | Feature | Status |
|---|---|---|
| 1 | Project Setup — FastAPI, config, health route | ✅ |
| 2 | Transaction Routing Graph — conditional edges | ✅ |
| 3 | Loan Eligibility — stateful multi-step workflow | ✅ |
| 4 | Account Agent — ReAct tool-calling loop | ✅ |
| 5 | RAG Compliance Assistant — FAISS + graded retrieval | ✅ |
| 6 | Conversational Memory — MemorySaver + long-term profile | ✅ |
| 7 | Multi-Agent Loan Committee — Planner + Executor + Validator | ✅ |
| 8 | Resilience (retry, circuit breaker) | 🔜 |
| 9 | Observability (LangSmith) | 🔜 |
| 10 | Security (JWT, RBAC, human-in-loop) | 🔜 |
| 11 | Autonomous Banking Agent | 🔜 |
