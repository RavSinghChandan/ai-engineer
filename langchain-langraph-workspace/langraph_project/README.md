# Banking AI Platform — LangGraph

A production-grade Banking AI System built with LangGraph, FastAPI, and LangChain.
Covers 11 real-world AI features: transaction routing, loan eligibility, account agents,
compliance RAG, conversational memory, multi-agent committees, resilience, observability,
JWT security, human-in-the-loop, and an autonomous orchestrator.

---

## Table of Contents

1. [What You Need Before Starting](#1-what-you-need-before-starting)
2. [Installation — Step by Step](#2-installation--step-by-step)
3. [Start the Server](#3-start-the-server)
4. [How to Test in Postman](#4-how-to-test-in-postman)
5. [API Reference — Every Endpoint](#5-api-reference--every-endpoint)
   - [Health Check](#health-check)
   - [Authentication — Get Your Token First](#authentication--get-your-token-first)
   - [RBAC Demo — Role Permissions](#rbac-demo--role-permissions)
   - [Transactions — Step 2](#transactions--step-2)
   - [Loans — Step 3](#loans--step-3)
   - [Accounts — Step 4](#accounts--step-4)
   - [Compliance RAG — Step 5](#compliance-rag--step-5)
   - [Conversation — Step 6](#conversation--step-6)
   - [Loan Committee — Step 7](#loan-committee--step-7)
   - [Resilience — Step 8](#resilience--step-8)
   - [Human-in-the-Loop — Step 10](#human-in-the-loop--step-10)
   - [Autonomous Agent — Step 11](#autonomous-agent--step-11)
6. [Complete Test Flows (Sequences)](#6-complete-test-flows-sequences)
7. [Project Structure](#7-project-structure)
8. [Monitoring Tools](#8-monitoring-tools)
9. [All Steps at a Glance](#9-all-steps-at-a-glance)

---

## 1. What You Need Before Starting

You need three things installed on your computer before running this project.

### Python 3.9 or higher

Check if you have it:
```bash
python --version
```
If you see `Python 3.9.x` or higher, you are good.
If not, download from [python.org](https://www.python.org/downloads/).

### pip (Python package installer)

This comes with Python. Check it:
```bash
pip --version
```

### An OpenAI API Key

This project uses OpenAI's GPT models for AI responses.

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in or create a free account
3. Click your name (top-right) → **API Keys** → **Create new secret key**
4. Copy the key — it looks like `sk-proj-...` or `sk-...`
5. Keep it safe — you will paste it into the `.env` file in Step 2

> **Cost note:** Running the examples in this README costs approximately $0.01–$0.05 total (a few cents). The models used are `gpt-4o-mini` and `gpt-3.5-turbo`.

---

## 2. Installation — Step by Step

Open a terminal (on Mac: press `Cmd+Space`, type `Terminal`, press Enter).

**Step 1 — Go to the project folder:**
```bash
cd /Users/chandankumar/Desktop/workspace/ai-engineer/langchain-langraph-workspace/langraph_project
```

**Step 2 — (Recommended) Create a virtual environment so packages don't mix with your system:**
```bash
python -m venv venv
source venv/bin/activate        # Mac / Linux
# venv\Scripts\activate         # Windows
```
You will see `(venv)` appear at the start of your terminal prompt. That means it worked.

**Step 3 — Install all dependencies:**
```bash
pip install -r requirements.txt
```
This takes 2–4 minutes. You will see packages downloading. Wait for it to finish.

**Step 4 — Create your environment file:**
```bash
cp .env.example .env
```
If `.env.example` does not exist, create a new file called `.env` in the project folder.

**Step 5 — Open `.env` and add your OpenAI key:**

Open the `.env` file in any text editor (Notepad, TextEdit, VS Code) and set:

```env
OPENAI_API_KEY=sk-your-actual-key-here

# Optional — enables LangSmith tracing (leave blank if you don't have one)
LANGCHAIN_API_KEY=
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=banking-ai-platform

# These have defaults — you don't need to change them
JWT_SECRET_KEY=banking-ai-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=30
```

Replace `sk-your-actual-key-here` with your real OpenAI API key. Save the file.

---

## 3. Start the Server

```bash
python run.py
```

Or alternatively:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

You should see output like this — the server is ready when you see the last line:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**The server is now running at:** `http://127.0.0.1:8000`

**Open the interactive API docs in your browser:**
```
http://127.0.0.1:8000/docs
```
You will see a Swagger UI with all endpoints. You can test every API directly from your browser — no Postman needed.

---

## 4. How to Test in Postman

Postman is a free app that lets you call APIs visually, without writing code.

### Install Postman
Download from [postman.com/downloads](https://www.postman.com/downloads/). Install and open it.

### Setting Up a Request (applies to every endpoint)

1. Open Postman → click **New** → **HTTP Request**
2. Set the **method** (GET or POST) in the dropdown on the left
3. Paste the **URL** in the address bar (e.g. `http://127.0.0.1:8000/api/v1/health/`)
4. For POST requests: click the **Body** tab → select **raw** → select **JSON** from the dropdown
5. Paste the JSON body shown in the examples below
6. Click **Send**

### Adding Authentication (Bearer Token) in Postman

Most endpoints require a JWT token. Here is how to add it:

1. First, get a token by calling `POST /api/v1/auth/token` (see Authentication section below)
2. Copy the `access_token` value from the response
3. In your next request, click the **Authorization** tab
4. Set **Auth Type** to `Bearer Token`
5. Paste the token into the **Token** field
6. Click **Send**

### Tip: Save Tokens as Postman Variables

1. After getting a token, click the **Tests** tab in Postman
2. Add this code: `pm.environment.set("token", pm.response.json().access_token);`
3. Now in other requests, set Authorization → Bearer Token → `{{token}}`

---

## 5. API Reference — Every Endpoint

### Health Check

Confirms the server is running. No authentication needed.

| Method | URL |
|--------|-----|
| GET | `http://127.0.0.1:8000/api/v1/health/` |

**Postman:** Method = GET, paste the URL, click Send.

**Expected response:**
```json
{"status": "healthy", "service": "Banking AI Platform"}
```

---

### Authentication — Get Your Token First

> **Important:** The Security, HITL, and some endpoints require a Bearer token. Always get a token first and include it in those requests.

**Demo accounts (built-in, no database needed):**

| Username | Password | Role | What they can do |
|----------|----------|------|-----------------|
| `admin` | `admin123` | admin | Everything |
| `officer` | `officer123` | officer | Submit & decide loan reviews, officer endpoints |
| `customer` | `customer123` | customer | Submit loan reviews, customer endpoints |

#### Get a Token

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/auth/token` |

**Important:** This endpoint uses **form data**, not JSON.

**In Postman:**
1. Method = POST
2. URL = `http://127.0.0.1:8000/api/v1/auth/token`
3. Click **Body** tab → select **x-www-form-urlencoded** (NOT raw/JSON)
4. Add two rows:
   - Key: `username` → Value: `admin`
   - Key: `password` → Value: `admin123`
5. Click Send

**Expected response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "role": "admin",
  "username": "admin"
}
```

Copy the `access_token` value. You will use it in the Authorization tab for protected endpoints.

---

#### Get Your Profile (Who Am I?)

| Method | URL | Auth Required |
|--------|-----|---------------|
| GET | `http://127.0.0.1:8000/api/v1/auth/me` | Yes — any role |

**In Postman:**
1. Method = GET, URL as above
2. Authorization tab → Bearer Token → paste your token
3. Click Send

**Expected response:**
```json
{
  "username": "admin",
  "role": "admin",
  "name": "Admin User"
}
```

---

### RBAC Demo — Role Permissions

These endpoints show how the role-based access control works.

#### Admin-Only Endpoint

| Method | URL | Auth Required |
|--------|-----|---------------|
| GET | `http://127.0.0.1:8000/api/v1/auth/admin-only` | Yes — admin role only |

Test with admin token → returns welcome message.
Test with officer or customer token → returns `403 Forbidden`.

**Expected response (admin token):**
```json
{
  "message": "Welcome, Admin User! You have full admin access.",
  "role": "admin"
}
```

#### Officer-or-Above Endpoint

| Method | URL | Auth Required |
|--------|-----|---------------|
| GET | `http://127.0.0.1:8000/api/v1/auth/officer-or-above` | Yes — officer or admin |

Test with officer token → works.
Test with customer token → returns `403 Forbidden`.

---

### Transactions — Step 2

Routes a banking transaction through the AI classification graph.
The graph decides: is this a payment, loan-related, fraud, compliance issue, or needs human review?

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/transactions/route` |

**In Postman:** Method = POST, Body → raw → JSON

**Test 1 — Normal retail payment:**
```json
{
  "transaction_id": "TXN-001",
  "amount": 1500,
  "merchant": "Amazon",
  "category": "retail",
  "account_id": "ACC-1001"
}
```
Expected: `"route": "payment"`, `"priority": "LOW"` or `"MEDIUM"`

**Test 2 — Fraud flag (large cash advance):**
```json
{
  "transaction_id": "TXN-002",
  "amount": 9500,
  "merchant": "Unknown Vendor",
  "category": "cash_advance",
  "account_id": "ACC-1001",
  "is_flagged": true
}
```
Expected: `"route": "fraud_review"`, `"requires_human_review": true`

**Test 3 — High-value payment (needs priority escalation):**
```json
{
  "transaction_id": "TXN-003",
  "amount": 85000,
  "merchant": "Property Dealer",
  "category": "transfer",
  "account_id": "ACC-1001"
}
```
Expected: `"priority": "HIGH"`

---

### Loans — Step 3

Runs an applicant through a 6-node eligibility pipeline:
validate → credit check → DTI check → income check → risk scoring → final decision.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/loans/eligibility` |

**Test 1 — Approved (strong profile):**
```json
{
  "applicant_id": "app-001",
  "loan_type": "personal",
  "requested_amount": 20000,
  "annual_income": 80000,
  "credit_score": 750,
  "employment_years": 6,
  "existing_debt": 500
}
```
Expected: `"decision": "APPROVED"`, risk_score around 70–85

**Test 2 — Rejected (low credit score):**
```json
{
  "applicant_id": "app-002",
  "loan_type": "home",
  "requested_amount": 300000,
  "annual_income": 90000,
  "credit_score": 580,
  "employment_years": 5,
  "existing_debt": 0
}
```
Expected: `"decision": "REJECTED"`, `"rejection_reason"` mentioning credit score

**Test 3 — Rejected (too much existing debt):**
```json
{
  "applicant_id": "app-003",
  "loan_type": "personal",
  "requested_amount": 50000,
  "annual_income": 40000,
  "credit_score": 700,
  "employment_years": 3,
  "existing_debt": 25000
}
```
Expected: `"decision": "REJECTED"`, reason mentioning debt-to-income ratio

**Test 4 — Pending Review (borderline):**
```json
{
  "applicant_id": "app-004",
  "loan_type": "personal",
  "requested_amount": 5000,
  "annual_income": 100000,
  "credit_score": 600,
  "employment_years": 0,
  "existing_debt": 40000
}
```
Expected: `"decision": "PENDING_REVIEW"`

---

### Accounts — Step 4

A ReAct AI agent that calls real tools to answer natural-language questions
about bank accounts. The AI decides which tools to call automatically.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/accounts/query` |

**Built-in test accounts:**

| Account ID | Name | Type | Status | Balance |
|------------|------|------|--------|---------|
| `ACC-1001` | Alice Johnson | checking | active | $45,230.50 |
| `ACC-1002` | Bob Williams | savings | active | $12,500.00 |
| `ACC-1003` | Carol Davis | checking | frozen | $8,750.25 |

**Test 1 — Check balance:**
```json
{
  "account_id": "ACC-1001",
  "query": "What is my current balance?"
}
```

**Test 2 — Recent transactions:**
```json
{
  "account_id": "ACC-1001",
  "query": "Show me my last 3 transactions"
}
```

**Test 3 — Full account summary:**
```json
{
  "account_id": "ACC-1002",
  "query": "What is my account status and recent activity?"
}
```

**Test 4 — Frozen account:**
```json
{
  "account_id": "ACC-1003",
  "query": "Why is my account not working?"
}
```
Expected: The AI will retrieve the account and report the `frozen` status.

---

### Compliance RAG — Step 5

AI answers banking compliance questions by retrieving relevant policy documents
and generating grounded, cited answers. Will never make up regulations.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/compliance/query` |

**Available categories:** `aml` · `kyc` · `pci_dss` · `gdpr`

**Test 1 — AML suspicious activity report:**
```json
{
  "query": "What is the deadline for filing a Suspicious Activity Report?",
  "category": "aml"
}
```

**Test 2 — KYC document requirements:**
```json
{
  "query": "What documents are required for individual customer KYC?",
  "category": "kyc"
}
```

**Test 3 — GDPR breach reporting window:**
```json
{
  "query": "How many hours do we have to report a data breach under GDPR?",
  "category": "gdpr"
}
```

**Test 4 — PCI DSS card data storage:**
```json
{
  "query": "Are we allowed to store full credit card numbers?",
  "category": "pci_dss"
}
```

---

### Conversation — Step 6

A stateful multi-turn chatbot. Use the same `session_id` across multiple calls
and the AI remembers everything said earlier in the session.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/conversation/chat` |
| DELETE | `http://127.0.0.1:8000/api/v1/conversation/chat/{session_id}` |

**Test the memory — do these in order with the same session_id:**

**Turn 1 (start a new session):**
```json
{
  "session_id": "sess-test-001",
  "message": "My annual income is 90000 rupees and my credit score is 730.",
  "account_id": "ACC-1001"
}
```

**Turn 2 (same session — AI remembers Turn 1):**
```json
{
  "session_id": "sess-test-001",
  "message": "Am I eligible for a home loan of 50 lakhs?"
}
```
Expected: The AI uses the income and credit score from Turn 1 — you don't need to repeat it.

**Turn 3 (continue the same session):**
```json
{
  "session_id": "sess-test-001",
  "message": "What documents would I need for that loan?"
}
```

**Clear the session (start fresh):**

| Method | URL |
|--------|-----|
| DELETE | `http://127.0.0.1:8000/api/v1/conversation/chat/sess-test-001` |

---

### Loan Committee — Step 7

A 3-agent AI system: Planner designs the evaluation strategy, Executor runs financial
analysis, Validator checks the work and returns a final verdict.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/committee/evaluate` |

**Possible verdicts:** `approved` · `rejected` · `escalated`

**Test 1 — Approved (excellent profile):**
```json
{
  "application_id": "APP-001",
  "applicant_name": "Alice Johnson",
  "loan_type": "personal",
  "requested_amount": 20000,
  "annual_income": 80000,
  "credit_score": 750,
  "employment_years": 6,
  "existing_debt": 500
}
```

**Test 2 — Rejected (poor credit):**
```json
{
  "application_id": "APP-002",
  "applicant_name": "Bob Smith",
  "loan_type": "home",
  "requested_amount": 300000,
  "annual_income": 90000,
  "credit_score": 580,
  "employment_years": 5,
  "existing_debt": 0
}
```

**Test 3 — Escalated (large business loan, risky profile):**
```json
{
  "application_id": "APP-003",
  "applicant_name": "Carol Lee",
  "loan_type": "business",
  "requested_amount": 150000,
  "annual_income": 60000,
  "credit_score": 640,
  "employment_years": 0.5,
  "existing_debt": 20000
}
```
Expected: `"verdict": "escalated"` — too risky for automatic approval

---

### Resilience — Step 8

Demonstrates circuit breaker, retry with exponential backoff, fallback chain,
and timeout protection — all composable layers.

| Method | URL | Description |
|--------|-----|-------------|
| POST | `http://127.0.0.1:8000/api/v1/resilience/query` | Query through all resilience layers |
| GET | `http://127.0.0.1:8000/api/v1/resilience/status` | Current circuit breaker states |
| POST | `http://127.0.0.1:8000/api/v1/resilience/circuit/{name}` | Manually trip or reset a circuit |

**Test 1 — Normal query:**
```json
{
  "query": "What is the current interest rate for a 30-year fixed mortgage?",
  "intent": "loan"
}
```

**Test 2 — Check all circuit breakers:**

Method = GET, URL = `http://127.0.0.1:8000/api/v1/resilience/status`
No body needed. Shows which circuits are CLOSED (normal) or OPEN (tripped).

**Test 3 — Trip the circuit (simulate OpenAI outage):**
```json
URL: http://127.0.0.1:8000/api/v1/resilience/circuit/openai
Body:
{
  "action": "trip"
}
```
Now call Test 1 again → system uses the fallback response instead of OpenAI.

**Test 4 — Reset the circuit (restore to normal):**
```json
URL: http://127.0.0.1:8000/api/v1/resilience/circuit/openai
Body:
{
  "action": "reset"
}
```

---

### Human-in-the-Loop — Step 10

A two-step flow where an AI assesses loan risk, then **pauses and waits**
for a human officer to approve or reject before finalizing.

> **Authentication required for both endpoints.**
> - Submit: any role (customer, officer, admin)
> - Decide: officer or admin only

#### Step A — Submit Loan for Human Review

| Method | URL | Auth Required |
|--------|-----|---------------|
| POST | `http://127.0.0.1:8000/api/v1/security/hitl/submit` | Yes — any role |

Get a customer token first:
- Call `POST /api/v1/auth/token` with username=`customer`, password=`customer123`
- Copy the token and use it as Bearer Token

**Body — High risk loan (>$500k triggers HIGH risk tier):**
```json
{
  "application_id": "APP-2024-001",
  "loan_amount": 750000,
  "applicant_name": "Alice Johnson"
}
```

**Expected response:**
```json
{
  "application_id": "APP-2024-001",
  "status": "PENDING_HUMAN_REVIEW",
  "risk_level": "HIGH"
}
```
The graph has **paused**. It is waiting for an officer decision.

**Body — Medium risk loan ($100k–$500k):**
```json
{
  "application_id": "APP-2024-002",
  "loan_amount": 250000,
  "applicant_name": "Bob Smith"
}
```

---

#### Step B — Officer Makes the Decision

| Method | URL | Auth Required |
|--------|-----|---------------|
| POST | `http://127.0.0.1:8000/api/v1/security/hitl/{application_id}/decide` | Yes — officer or admin |

Get an officer token first:
- Call `POST /api/v1/auth/token` with username=`officer`, password=`officer123`
- Copy the token and use it as Bearer Token

URL for the application submitted above:
```
http://127.0.0.1:8000/api/v1/security/hitl/APP-2024-001/decide
```

**Body — Approve:**
```json
{
  "decision": "approved",
  "notes": "All documents verified, strong collateral provided"
}
```

**Body — Reject:**
```json
{
  "decision": "rejected",
  "notes": "Insufficient collateral for the requested amount"
}
```

**Expected response:**
```json
{
  "application_id": "APP-2024-001",
  "final_status": "APPROVED",
  "human_decision": "approved",
  "human_approver": "officer",
  "officer_notes": "All documents verified, strong collateral provided",
  "risk_level": "HIGH"
}
```
The graph has **resumed** and completed.

> **Test the role guard:** Try calling the `/decide` endpoint with a customer token — you should get `403 Forbidden`.

---

### Autonomous Agent — Step 11

One endpoint that handles **any banking query**. The agent automatically classifies
intent, picks the right specialist sub-system, runs it, and returns a unified response.

| Method | URL |
|--------|-----|
| POST | `http://127.0.0.1:8000/api/v1/autonomous/query` |

**Test 1 — Loan eligibility (auto-routed to loan workflow):**
```json
{
  "query": "Am I eligible for a home loan?",
  "session_id": "auto-001",
  "context": {
    "loan_type": "home",
    "requested_amount": 400000,
    "annual_income": 120000,
    "credit_score": 740,
    "employment_years": 7,
    "existing_debt": 5000
  }
}
```
Expected: `"workflow_used": "loan"`

**Test 2 — Account balance (auto-routed to account workflow):**
```json
{
  "query": "What is my account balance and show recent transactions?",
  "session_id": "auto-002",
  "account_id": "ACC-001"
}
```
Expected: `"workflow_used": "account"`

**Test 3 — KYC compliance question (auto-routed to compliance/RAG):**
```json
{
  "query": "What are the KYC documentation requirements for business accounts?",
  "session_id": "auto-003"
}
```
Expected: `"workflow_used": "compliance"`

**Test 4 — Fraud detection (auto-routed to transaction workflow):**
```json
{
  "query": "This transaction looks suspicious, can you check it for fraud?",
  "session_id": "auto-004",
  "context": {
    "transaction_type": "fraud_check",
    "amount": 75000
  }
}
```
Expected: `"workflow_used": "transaction"`

**Test 5 — General question (no specific workflow matched):**
```json
{
  "query": "What savings account options do you offer?",
  "session_id": "auto-005"
}
```
Expected: `"workflow_used": "conversation"` or `"general"`

**Check the `execution_steps` field** in the response — it shows every step the agent took as a full audit trail.

---

## 6. Complete Test Flows (Sequences)

### Flow A: Full Authentication + RBAC Test

Run these in order:

1. `POST /api/v1/auth/token` with customer credentials → save `access_token` as **customer_token**
2. `POST /api/v1/auth/token` with officer credentials → save `access_token` as **officer_token**
3. `GET /api/v1/auth/me` with customer_token → see customer profile
4. `GET /api/v1/auth/admin-only` with customer_token → expect **403 Forbidden**
5. `GET /api/v1/auth/officer-or-above` with customer_token → expect **403 Forbidden**
6. `GET /api/v1/auth/officer-or-above` with officer_token → expect **200 OK**

---

### Flow B: Complete Human-in-the-Loop Loan Approval

1. Get customer token: `POST /auth/token` (username: customer, password: customer123)
2. Get officer token: `POST /auth/token` (username: officer, password: officer123)
3. Submit loan: `POST /security/hitl/submit` with customer token
   ```json
   {"application_id": "FLOW-001", "loan_amount": 600000, "applicant_name": "Test User"}
   ```
4. Note: status should be `PENDING_HUMAN_REVIEW`
5. Try to decide with customer token: `POST /security/hitl/FLOW-001/decide` → expect **403 Forbidden**
6. Decide with officer token: `POST /security/hitl/FLOW-001/decide`
   ```json
   {"decision": "approved", "notes": "Approved after review"}
   ```
7. Final status should be `APPROVED` with officer name in `human_approver`

---

### Flow C: Multi-Turn Conversation Memory Test

1. Start session: `POST /conversation/chat`
   ```json
   {"session_id": "memory-test", "message": "My salary is 120000 per year and I have a credit score of 780."}
   ```
2. Continue (AI must remember the salary and score): `POST /conversation/chat`
   ```json
   {"session_id": "memory-test", "message": "Can I afford a car loan of 25000?"}
   ```
3. Keep going: `POST /conversation/chat`
   ```json
   {"session_id": "memory-test", "message": "What interest rate would I likely get?"}
   ```
4. Start fresh: `DELETE /conversation/chat/memory-test`
5. Confirm memory is gone: `POST /conversation/chat`
   ```json
   {"session_id": "memory-test", "message": "What was my salary again?"}
   ```
   Expected: AI does not know the salary anymore.

---

### Flow D: Resilience Circuit Breaker Demo

1. Normal query works: `POST /resilience/query` → success response
2. Check status: `GET /resilience/status` → all circuits CLOSED
3. Trip the OpenAI circuit: `POST /resilience/circuit/openai` with `{"action": "trip"}`
4. Query again: `POST /resilience/query` → now uses **fallback response** (not OpenAI)
5. Check status: `GET /resilience/status` → openai circuit is OPEN
6. Reset: `POST /resilience/circuit/openai` with `{"action": "reset"}`
7. Query once more → back to normal OpenAI response

---

## 7. Project Structure

```
langraph_project/
├── run.py                              # Entry point — run this to start the server
├── requirements.txt                    # All Python packages
├── .env                                # Your API keys (create from .env.example)
│
├── app/
│   ├── main.py                         # FastAPI app, middleware, route registration
│   ├── config.py                       # Settings loaded from .env
│   │
│   ├── api/routes/                     # All API endpoints
│   │   ├── health.py                   # GET  /api/v1/health/
│   │   ├── auth.py                     # POST /api/v1/auth/token, GET /auth/me
│   │   ├── transaction.py              # POST /api/v1/transactions/route
│   │   ├── loan.py                     # POST /api/v1/loans/eligibility
│   │   ├── account.py                  # POST /api/v1/accounts/query
│   │   ├── compliance.py               # POST /api/v1/compliance/query
│   │   ├── conversation.py             # POST /api/v1/conversation/chat
│   │   ├── loan_committee.py           # POST /api/v1/committee/evaluate
│   │   ├── resilience.py               # POST /api/v1/resilience/query + status + circuit
│   │   ├── security.py                 # POST /api/v1/security/hitl/submit + decide
│   │   └── autonomous.py               # POST /api/v1/autonomous/query
│   │
│   ├── graphs/                         # LangGraph AI workflows (one per feature)
│   │   ├── transaction_router.py       # Step 2 — conditional routing
│   │   ├── loan_eligibility.py         # Step 3 — 6-node stateful pipeline
│   │   ├── account_agent.py            # Step 4 — ReAct tool-calling agent
│   │   ├── compliance_rag.py           # Step 5 — FAISS RAG with grading
│   │   ├── conversation_agent.py       # Step 6 — MemorySaver conversational
│   │   ├── loan_committee.py           # Step 7 — 3-agent Planner/Executor/Validator
│   │   ├── resilient_agent.py          # Step 8 — circuit breaker + retry + fallback
│   │   ├── human_in_loop.py            # Step 10 — interrupt_before HITL graph
│   │   └── autonomous_agent.py         # Step 11 — master orchestrator
│   │
│   ├── security/
│   │   ├── jwt_handler.py              # JWT create + decode
│   │   └── rbac.py                     # Role enum, require_role() dependency
│   │
│   ├── resilience/
│   │   ├── circuit_breaker.py          # CLOSED/OPEN/HALF_OPEN state machine
│   │   └── llm_factory.py              # Composable resilience layers
│   │
│   ├── memory/
│   │   └── store.py                    # MemorySaver singleton + long-term profiles
│   │
│   ├── tools/
│   │   └── account_tools.py            # @tool: get_account_details, get_transactions
│   │
│   ├── core/
│   │   ├── logger.py                   # Structured logging
│   │   └── monitoring.py               # LangSmith + Arize Phoenix setup
│   │
│   └── schemas/                        # Pydantic request/response models
│       ├── transaction.py
│       ├── loan.py
│       ├── account.py
│       ├── compliance.py
│       ├── conversation.py
│       ├── loan_committee.py
│       ├── security.py
│       └── autonomous.py
│
├── tests/                              # Automated test suite
│   ├── test_transaction_router.py
│   ├── test_loan_eligibility.py
│   ├── test_security.py
│   ├── test_autonomous_agent.py
│   └── test_api_routes.py
│
└── interview-qa/                       # Interview preparation notes
    ├── 01-langgraph-fundamentals.md
    ├── 02-stateful-workflows.md
    ├── 03-multi-agent-systems.md
    ├── 04-rag-graph-integration.md
    ├── 05-tool-calling-agent.md
    ├── 06-memory-system.md
    ├── 07-resilience-layer.md
    ├── 08-observability.md
    ├── 09-security-layer.md
    └── 10-autonomous-agent.md
```

---

## 8. Monitoring Tools

| Tool | URL | Purpose |
|------|-----|---------|
| **Swagger UI** | http://127.0.0.1:8000/docs | Interactive API — test everything in browser |
| **ReDoc** | http://127.0.0.1:8000/redoc | Read-only API reference docs |
| **LangSmith** | https://smith.langchain.com | Cloud traces of every LLM call |
| **Arize Phoenix** | http://localhost:6006 | Local open-source LLM observability |

### Enable LangSmith (optional, free tier available)

1. Create account at [smith.langchain.com](https://smith.langchain.com)
2. Get your API key
3. Add to `.env`:
   ```env
   LANGCHAIN_API_KEY=ls__your_key_here
   LANGCHAIN_TRACING_V2=true
   LANGCHAIN_PROJECT=banking-ai-platform
   ```
4. Restart the server
5. Every LLM call now appears in your LangSmith dashboard with full traces

### Enable Arize Phoenix (optional, 100% local, no account needed)

```bash
pip install 'arize-phoenix>=4.0.0' openinference-instrumentation-langchain
python -m phoenix.server.main serve
# Open new terminal, restart the app:
python run.py
```
Open `http://localhost:6006` to see local traces.

---

## 9. All Steps at a Glance

| Step | Feature | Endpoint | Status |
|------|---------|----------|--------|
| 1 | Project Setup — FastAPI, config, health | `GET /api/v1/health/` | ✅ |
| 2 | Transaction Routing Graph | `POST /api/v1/transactions/route` | ✅ |
| 3 | Loan Eligibility Workflow | `POST /api/v1/loans/eligibility` | ✅ |
| 4 | Account Agent (Tool Calling) | `POST /api/v1/accounts/query` | ✅ |
| 5 | Compliance RAG Assistant | `POST /api/v1/compliance/query` | ✅ |
| 6 | Conversational Memory | `POST /api/v1/conversation/chat` | ✅ |
| 7 | Multi-Agent Loan Committee | `POST /api/v1/committee/evaluate` | ✅ |
| 8 | Resilience Layer | `POST /api/v1/resilience/query` | ✅ |
| 9 | Observability (LangSmith + Phoenix) | — (configured via .env) | ✅ |
| 10 | JWT Auth + RBAC + Human-in-the-Loop | `POST /api/v1/auth/token` + `/hitl/*` | ✅ |
| 11 | Autonomous Orchestrator Agent | `POST /api/v1/autonomous/query` | ✅ |

---

## Quick Start Cheatsheet

```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# 3. Run
python run.py

# 4. Test (browser)
open http://127.0.0.1:8000/docs

# 5. Health check (terminal)
curl http://127.0.0.1:8000/api/v1/health/

# 6. Get a token
curl -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -d "username=admin&password=admin123"

# 7. Try the autonomous agent (replace TOKEN with value from step 6)
curl -X POST http://127.0.0.1:8000/api/v1/autonomous/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Am I eligible for a home loan?", "session_id": "test-1"}'
```
