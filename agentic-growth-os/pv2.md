You are a senior AI architect and full-stack engineer.

Build Version 2 (V2) of a DEMO SaaS application called:

"Agentic Growth OS"

This is a drag-and-drop AI agent platform for digital marketing agencies where users can design workflows and AI agents execute and optimize campaigns autonomously.

---

🔹 TECH STACK (MANDATORY)

* Frontend: Angular (latest stable version)
* Backend: FastAPI (Python)
* Agent Orchestration: LangGraph
* Database: SQLite
* AI: OpenAI API or mock LLM responses

---

🔹 GOALS

* Convert demo into a structured MVP
* Introduce real agent orchestration using LangGraph
* Implement a working auto-learning system (basic but visible)
* Keep it simple but impressive for demo

---

🔹 CORE FEATURES

1. ANGULAR FRONTEND

Create a clean SaaS-style UI with 3 main sections:

A. Workflow Builder Page

* Drag-and-drop canvas (use ngx-graph or similar)
* Nodes:

  * Audience Agent
  * Ad Copy Agent
  * Campaign Agent
  * Performance Analyzer Agent
  * Budget Optimizer Agent
* Allow connecting nodes to form workflow
* Add buttons:

  * "Run Workflow"
  * "Re-run with Learning"

B. Campaign Dashboard Page

* Show:

  * Campaign Name
  * Budget
  * CTR (simulated)
  * Conversion Rate (simulated)
  * ROI Score
* Show comparison:

  * Before Learning vs After Learning

C. Learning Insights Page

* Show messages like:

  * "System reused strategy from similar campaign"
  * "Budget shifted to high-performing segment"
  * "Ad tone optimized for better CTR"

---

2. LANGGRAPH AGENT ORCHESTRATION (BACKEND)

* Define agents as nodes in LangGraph:

  * audience_agent
  * ad_copy_agent
  * campaign_agent
  * performance_agent
  * optimizer_agent

* Each agent:

  * Accepts structured JSON input
  * Returns structured JSON output

* Build a LangGraph workflow:
  audience → ad_copy → campaign → performance → optimizer

* Maintain shared state across agents

---

3. AUTO-LEARNING ENGINE (CRITICAL)

Implement a simple but visible learning system:

* Create a "campaign_memory" table in SQLite:

  * campaign_type
  * inputs
  * decisions
  * results (CTR, ROI)

* Learning logic:

  * On new run:

    * Search similar past campaigns (keyword-based)
  * If found:

    * Modify:

      * Ad copy tone
      * Budget allocation
      * Audience targeting

* Rule examples:

  * If ROI < threshold → change strategy
  * If CTR low → improve ad copy tone

* Output clearly:
  "System learned from previous campaign and improved performance by X%"

---

4. API ENDPOINTS

* POST /run-workflow
* GET /campaigns
* GET /learning-insights

---

5. DEMO DATA MODE

Preload 3 campaigns:

* Real Estate
* Coaching Institute
* E-commerce

Allow user to:

* Run workflow (baseline)
* Re-run (with learning improvements)

---

6. SIMULATION LAYER

* Simulate:

  * Google Ads
  * Meta Ads
* No real integrations
* Just show:
  "Executing campaign..."

---

7. PROJECT STRUCTURE

* frontend/

  * Angular app
* backend/

  * FastAPI app
  * LangGraph workflow
  * learning module
  * database (SQLite)

---

🔹 SPECIAL REQUIREMENT

The app MUST demonstrate learning:

Flow:
1st Run → baseline results
2nd Run → improved results using stored memory

Display clearly:
"This system improves automatically over time"

---

🔹 OUTPUT REQUIREMENTS

* Provide full working code (Angular + FastAPI + LangGraph)
* Include instructions to run locally
* Include sample data
* Keep code clean and modular

---

🔹 DESIGN GOAL

A non-technical agency owner should feel:

"This system can automate and improve my campaigns without manual effort."

---

Focus on clarity, demo impact, and visible intelligence.
