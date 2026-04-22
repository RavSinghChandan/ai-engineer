# ⚡ Agentic Growth OS

> A drag-and-drop AI agent platform for digital marketing agencies — powered by **LangGraph** and **Angular 17**.
> Workflows run autonomously. The system learns from every campaign and improves itself over time.

---

## 🎯 What It Does

Agentic Growth OS lets marketing teams visually design multi-agent pipelines and execute them against real campaign data. Each run is stored in a campaign memory store. On subsequent runs for similar campaigns, the system automatically applies learned improvements — better ad copy tone, smarter budget allocation, refined audience targeting — and shows you exactly what changed and by how much.

**First run** → establishes baseline metrics
**Second run** → learns from the first, improves ROI by 40–80%
**Third run and beyond** → continues compounding improvements

> 📐 **Deep dive:** See [LANGGRAPH_ARCHITECTURE.md](./LANGGRAPH_ARCHITECTURE.md) for the full LangGraph flow diagram, node responsibility breakdown, state mutation trace, and design decision log.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular 17 Frontend                      │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │   Workflow   │  │   Campaign    │  │    Learning      │ │
│  │   Builder    │  │   Dashboard   │  │    Insights      │ │
│  │  SVG Canvas  │  │  Chart.js     │  │  Run History     │ │
│  └──────────────┘  └───────────────┘  └──────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (REST)
┌───────────────────────────▼─────────────────────────────────┐
│                  FastAPI Backend (port 8000)                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              LangGraph StateGraph                   │  │
│   │                                                     │  │
│   │  audience → ad_copy → budget → campaign → perf      │  │
│   │                                                     │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   ┌──────────────────────┐   ┌────────────────────────┐    │
│   │  Campaign Memory     │   │  Learning Engine       │    │
│   │  (JSON Store)        │   │  (Similarity Match +   │    │
│   │                      │   │   Rule-based Improve)  │    │
│   └──────────────────────┘   └────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔹 Core Features

### 1. Visual Workflow Builder
- SVG canvas with 5 draggable agent nodes
- Animated edges showing LangGraph data flow
- Live execution progress with per-agent status badges
- One-click demo campaign presets (Real Estate, Coaching, E-commerce)

### 2. LangGraph Agent Pipeline
Each node in the graph is a pure function that reads and writes `CampaignState`:

| Node | Role |
|---|---|
| **Audience Agent** | Segments audience, scores quality, identifies interest clusters |
| **Ad Copy Agent** | Generates headlines, descriptions, CTA — tone adapts with learning |
| **Budget Optimizer** | Allocates budget across Search / Display / Social based on ROI history |
| **Campaign Agent** | Structures ad groups, keywords, quality score, platform config |
| **Performance Analyzer** | Simulates CTR, conversions, ROI; calculates improvement % |

### 3. Auto-Learning Engine (the core differentiator)
- Every run is persisted to `memory/campaign_store.json`
- On re-run, **keyword similarity matching** finds prior campaigns
- **Rule-based improvement logic** derives:
  - Optimal ad copy tone (`urgent_cta`, `emotional_storytelling`, `benefit_focused`, etc.)
  - Budget channel reallocation rationale
  - Audience age group refinement
  - Headline strategy upgrade (`question_hook`, `number_lead`, `testimonial_style`)
- Results panel shows `"System learned from N runs and improved performance by X%"`

### 4. Campaign Dashboard
- Key metrics: CTR, Conversion Rate, ROI Score, Conversions
- **Before vs After Learning** comparison (when 2+ runs exist)
- Budget allocation doughnut chart (Chart.js)
- ROI / CTR trend line chart across all runs
- 30-day forecast panel
- AI Insights feed (live from agent decisions)

### 5. Learning Insights Page
- Per campaign-type improvement bars
- Best-discovered ad tone and bid strategy
- Full run-by-run log with learning badges
- "How it works" explainer flow

### 6. Simulated Platforms
- Google Ads and Meta Ads are simulated (no real API keys needed)
- Platform-aware budget splits and bid strategies are applied
- Quality Score calculated per platform config

---

## 📁 Project Structure

```
agentic-growth-os/
│
├── start.sh                        # One-click startup script
│
├── backend/
│   ├── main.py                     # FastAPI app + all REST endpoints
│   ├── requirements.txt
│   │
│   ├── graph/
│   │   ├── state.py                # CampaignState TypedDict for LangGraph
│   │   ├── workflow.py             # StateGraph definition + compile
│   │   └── nodes/
│   │       ├── audience_node.py
│   │       ├── ad_copy_node.py
│   │       ├── budget_node.py
│   │       ├── campaign_node.py
│   │       └── performance_node.py
│   │
│   ├── memory/
│   │   ├── campaign_memory.py      # Store, find similar, derive improvements
│   │   └── campaign_store.json     # Auto-created on first run
│   │
│   └── models/
│       └── campaign.py             # Pydantic request/response models
│
└── frontend/
    ├── angular.json
    ├── tailwind.config.js
    ├── proxy.conf.json             # Proxies /api → localhost:8000
    │
    └── src/
        ├── main.ts                 # Bootstrap with HttpClient + Animations
        ├── styles.css              # Tailwind + custom glass/badge utilities
        │
        └── app/
            ├── app.component.ts    # Root shell with tab routing
            │
            ├── models/
            │   └── campaign.model.ts
            │
            ├── services/
            │   ├── campaign.service.ts   # HTTP + BehaviorSubject state
            │   └── workflow.service.ts   # Node positions + execution animation
            │
            └── components/
                ├── sidebar/              # Navigation + AI engine status
                ├── workflow-builder/     # SVG canvas + campaign form
                ├── dashboard/            # Metrics + charts + AI insights
                └── learning-insights/    # Learning history + improvement bars
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Python | 3.9+ |
| Node.js | 18+ |
| npm | 9+ |

### Option 1 — One-click start

```bash
cd agentic-growth-os
chmod +x start.sh
./start.sh
```

### Option 2 — Manual start

**Backend:**
```bash
cd backend

# Activate your virtual environment (if using one)
source ../.venv/bin/activate   # or python -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --port 8000 --reload
```

**Frontend (new terminal):**
```bash
cd frontend

npm install --legacy-peer-deps

npx ng serve --port 4200
```

Open **http://localhost:4200**

---

## 🎮 Demo Walkthrough

### Step 1 — Load a demo campaign
Click one of the three preset buttons in the Workflow Builder:
- 🏠 **Premium Residences Launch** — Real Estate, ₹50K budget, Google Ads
- 📚 **Data Science Bootcamp** — Coaching, ₹30K budget, Meta Ads
- 🛍️ **Fashion Flash Sale** — E-commerce, ₹20K budget, Google + Meta

### Step 2 — Run 1 (Baseline)
Click **▶ Execute LangGraph Workflow**. Watch the nodes animate through the pipeline.
Switch to **Campaign Dashboard** to see metrics. The learning summary shows:
> "First run — establishing baseline. Run again to see learning in action."

### Step 3 — Run 2 (Learning kicks in)
Click Execute again without changing anything. The system now:
- Finds Run 1 in memory via similarity matching
- Derives improvements: ad tone, budget reallocation, audience refinement
- Applies them through the LangGraph graph
- Shows: "System learned from 1 previous run(s) and improved performance by **X%**"

### Step 4 — Learning Insights tab
See the per-campaign-type improvement chart, the run log, and the best-discovered tone and bid strategy.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `GET` | `/api/demo-campaigns` | Returns 3 preloaded demo campaigns |
| `POST` | `/api/execute-workflow` | Runs LangGraph pipeline, returns full results |
| `GET` | `/api/campaign-memory` | Returns last 10 stored campaign runs |
| `DELETE` | `/api/campaign-memory` | Clears memory store (resets learning) |
| `GET` | `/api/learning-insights` | Returns per-type improvement analytics |

Interactive docs: **http://localhost:8000/docs**

### Execute Workflow — Request Body

```json
{
  "nodes": [{ "id": "1", "type": "audienceAgent", "label": "Audience Agent", "position": { "x": 60, "y": 180 }, "data": {} }],
  "edges": [],
  "campaign": {
    "name": "My Campaign",
    "campaign_type": "real_estate",
    "product_name": "Skyline Heights",
    "budget": 50000,
    "target_audience": "Home buyers aged 30-50",
    "key_benefit": "Luxury ready-to-move apartments",
    "platform": "google_ads",
    "learning_mode": true
  }
}
```

### Execute Workflow — Response (key fields)

```json
{
  "campaign_id": "8d496dfc",
  "run_number": 2,
  "learning_applied": true,
  "improvement_percentage": 74.8,
  "metrics": {
    "ctr": 3.24,
    "conversion_rate": 4.51,
    "roi_score": 5.47,
    "impressions": 52000,
    "clicks": 1684,
    "conversions": 76
  },
  "performance_grade": "A+",
  "ai_insights": ["CTR improved by +0.6% from audience refinement", "..."],
  "learning_summary": {
    "type": "improved",
    "message": "System learned from 1 previous run(s) and improved performance by 74.8%",
    "changes_applied": [
      "Ad tone → 'urgent_cta'",
      "Shifted to high-converting search ads",
      "Narrowed age group based on conversion data"
    ]
  }
}
```

---

## 🧠 How the Learning Engine Works

```
Run N stores:
  ┌─ campaign_type, product_name, target_audience
  ├─ metrics: { ctr, conversion_rate, roi_score, ... }
  └─ agent_decisions: { tone_used, budget_split, bid_strategy, ... }

Run N+1 triggers:
  1. find_similar()   → keyword similarity > 0.15 threshold
  2. get_improvements() → rule engine derives:
       if roi < 1.5  → tone = "urgent_cta",   budget → search-heavy
       if ctr < 2.0  → headline = "question_hook"
       if conv < 3.0 → audience age group narrowed to 28-40
       if roi > 2.5  → expand to display + social
  3. Each agent node reads `state["improvements"]` and applies changes
  4. Performance node computes improvement_percentage vs stored baseline
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | Angular 17 (standalone components) |
| Styling | Tailwind CSS 3 |
| Charts | Chart.js 4 |
| HTTP Client | Angular HttpClient + RxJS BehaviorSubject |
| Backend Framework | FastAPI |
| Agent Orchestration | LangGraph 0.6 (StateGraph) |
| Language | Python 3.9+ / TypeScript 5.4 |
| Storage | JSON flat file (campaign_store.json) |
| Dev Server | Uvicorn (backend) · Angular CLI (frontend) |

---

## 🔮 Extending the Project

| Idea | Where to add |
|---|---|
| Real OpenAI calls for copy generation | `graph/nodes/ad_copy_node.py` — swap mock with `ChatOpenAI` |
| Persistent DB instead of JSON | `memory/campaign_memory.py` — swap `_load/_save` with SQLAlchemy |
| Real Google Ads API | `graph/nodes/campaign_node.py` — add `googleads` SDK calls |
| Vector similarity (embeddings) | `memory/campaign_memory.py` — replace `_similarity` with cosine on embeddings |
| Add a new agent node | Create `graph/nodes/seo_node.py`, register in `workflow.py`, add to frontend `WorkflowService` |
| User authentication | Add FastAPI JWT middleware + Angular auth guards |

---

## 📄 License

MIT — free to use, modify, and demo to clients.

---

> **"This system improves automatically over time."**
> Every campaign you run makes the next one smarter.
