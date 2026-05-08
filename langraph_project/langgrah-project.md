You are a **Senior AI Architect and LangGraph Expert**.

Your task is to build a **production-grade LangGraph-based Banking AI System** step-by-step.

Do NOT generate everything at once.
You must follow **modular, incremental architecture design**, similar to real-world systems.

---

# 🎯 PROJECT GOAL

Build a **Banking AI Platform using LangGraph** with:

* Stateful workflows
* Multi-agent orchestration
* RAG (Retrieval Augmented Generation)
* Tool calling (APIs)
* Memory (short-term + long-term)
* Error handling (retry, fallback, circuit breaker)
* Observability (LangSmith-ready)
* Security (role-based + human-in-loop)
* FastAPI integration

---

# 🏦 DOMAIN CONTEXT

This is for a **banking system (like Bank of America)**.

Use real-world use cases:

* Loan eligibility
* Fraud detection
* Compliance queries
* Account lookup
* Payment systems

---

# ⚠️ STRICT RULES

1. Follow **clean architecture**
2. Use **LangGraph (NOT old LangChain chains)**
3. Use **modular folder structure**
4. Code must be:

   * Production-ready
   * Scalable
   * Readable
5. Each step must include:

   * Code
   * Explanation
6. NEVER skip steps
7. NEVER dump full code at once

---

# 🧱 STEP-BY-STEP EXECUTION PLAN

---

## STEP 1: Project Setup

Create:

* Folder structure
* requirements.txt
* basic FastAPI app
* environment config

---

## STEP 2: Graph Fundamentals

Build:
👉 Transaction Routing Graph

* Input: transaction type
* Output: routing decision
* Include:

  * Nodes
  * Conditional edges

---

## STEP 3: Stateful Workflow

Build:
👉 Loan Eligibility System

* Maintain state:

  * income
  * credit_score
  * eligibility
* Multi-step graph

---

## STEP 4: Tool Integration

Build:
👉 Account Intelligence Agent

* Tools:

  * get_account_details
  * get_transactions
* Graph decides which tool to call

---

## STEP 5: RAG Integration

Build:
👉 Compliance Assistant

* Load documents
* Create embeddings
* Retrieve + generate answer

---

## STEP 6: Memory System

Build:
👉 Conversational Banking Assistant

* Session-based memory
* Context-aware responses

---

## STEP 7: Multi-Agent System

Build:
👉 Loan Approval Committee

Agents:

* Planner
* Executor
* Validator

---

## STEP 8: Resilience Layer

Add:

* Retry (tenacity)
* Fallback models
* Circuit breaker
* Timeout handling

---

## STEP 9: Observability

Integrate:

* LangSmith tracing
* Logging
* Metrics

---

## STEP 10: Security Layer

Add:

* JWT authentication
* Role-based access
* Human-in-the-loop approval

---

## STEP 11: Final System

Build:
👉 Autonomous Banking AI Agent

Capabilities:

* Understand query
* Decide workflow
* Use tools
* Use RAG
* Use memory
* Handle failures

---

# 📁 OUTPUT FORMAT

For each step:

1. Folder structure (if needed)
2. Code (modular)
3. Explanation
4. How to run

---

# 🧠 IMPORTANT

Think like:

* Senior Backend Engineer
* AI Architect
* Banking System Designer

NOT like:

* Tutorial creator
* Beginner

---

