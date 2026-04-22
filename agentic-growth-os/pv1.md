You are a senior AI architect and full-stack engineer.

Build a DEMO SaaS web application called:

"Agentic Growth OS"

This is a drag-and-drop AI agent platform for digital marketing agencies where users can design workflows and AI agents execute and optimize campaigns autonomously.

IMPORTANT GOALS:

* This is NOT a WhatsApp tool or single-channel tool.
* This is a GENERIC marketing automation OS.
* The demo must clearly show AUTO-LEARNING behavior.
* The system should feel intelligent and evolving over time.

---

🔹 CORE FEATURES TO BUILD:

1. VISUAL WORKFLOW BUILDER (Frontend)

* Use React with a drag-and-drop canvas (React Flow or similar)
* Nodes represent agents:

  * Audience Agent
  * Ad Copy Agent
  * Campaign Agent
  * Performance Analyzer Agent
  * Budget Optimizer Agent
* User can connect nodes to form a pipeline

---

2. AGENT EXECUTION ENGINE (Backend)

* Use Node.js or Python (FastAPI preferred)
* Each node triggers an AI agent function
* Simulate execution (no real API integrations needed)
* Each agent should:

  * Take structured input
  * Return structured output (JSON)

---

3. AUTO-LEARNING ENGINE (MOST IMPORTANT)
   Implement a simple but powerful learning system:

* Maintain a "Campaign Memory Store" (JSON or DB)

* Store:

  * Campaign inputs
  * Decisions made by agents
  * Performance results (simulated)

* Learning logic:

  * If similar campaign appears again → improve output
  * Adjust:

    * Ad copy tone
    * Budget allocation
    * Audience targeting

* Implement:

  * similarity matching (basic vector or keyword match)
  * rule-based improvement (if ROI low → change strategy)
  * feedback loop

* Show:
  "System learned from previous campaign and improved performance by X%"

---

4. SIMULATED CAMPAIGN DASHBOARD

* Show:

  * Campaign name
  * Budget
  * CTR (simulated)
  * Conversion rate (simulated)
  * ROI score

* Add:
  "Before Learning" vs "After Learning" comparison

---

5. DEMO DATA MODE

* Preload 2–3 campaigns:

  * Real Estate Ads
  * Coaching Institute Ads
  * E-commerce Ads

* Let user:

  * Run workflow
  * See improvement after re-run

---

6. UI EXPERIENCE (VERY IMPORTANT)

* Clean SaaS dashboard look

* Sections:

  * Workflow Builder
  * Campaign Dashboard
  * Learning Insights

* Add a panel:
  "AI Insights"
  Example:

  * "Budget shifted to high-performing audience"
  * "Ad tone optimized for better CTR"

---

7. FAKE INTEGRATIONS (SIMULATION)

* Simulate:

  * Google Ads
  * Meta Ads
* No real API needed
* Just show "Executing campaign..."

---

8. ARCHITECTURE

* Frontend: React
* Backend: FastAPI
* AI: OpenAI API or mock responses
* Storage: simple JSON or SQLite

---

🔹 SPECIAL REQUIREMENT (CRITICAL):

The app must DEMONSTRATE LEARNING:

Flow:
1st Run → baseline results
2nd Run → improved results using stored memory

Display clearly:
"This system improves automatically over time"

---

🔹 OUTPUT REQUIREMENTS:

* Provide full working code (frontend + backend)
* Include instructions to run locally
* Include sample data
* Keep it simple but impressive for demo

---

🔹 DESIGN GOAL:

When a non-technical digital marketing agency owner sees this, they should say:

"This can replace half my team."

---

🔹 OPTIONAL ENHANCEMENT:

* Add a toggle:
  "Learning Mode ON/OFF"
* Add logs showing how decisions changed

---

Focus on clarity, demo impact, and storytelling over production complexity.
