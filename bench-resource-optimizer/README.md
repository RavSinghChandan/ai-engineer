# Bench Resource Optimization System

AI-powered system to track bench employees, map them to project roles, identify skill gaps, and generate preparation plans.

> **Want to understand the full system visually?**
> See [FLOW.md](./FLOW.md) — complete diagrams, plain-English explanations, and a 360° walkthrough of every layer from user action to AI response. Designed so even non-technical stakeholders can follow it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI · LangChain · FAISS |
| LLM | DeepSeek (`deepseek-chat`) via OpenAI-compatible API |
| Frontend | Angular 17 (standalone) |
| Storage | JSON files (no database) |

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+ & Angular CLI (`npm i -g @angular/cli`)
- DeepSeek API key

### 1. Set up environment

```bash
cd bench-resource-optimizer/backend
cp .env.example .env
# Edit .env and add your DEEPSEEK_API_KEY
```

### 2. Run backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend: http://localhost:8000  
API Docs: http://localhost:8000/docs

### 3. Run frontend

```bash
cd frontend
npm install
ng serve --proxy-config proxy.conf.json
```

Frontend: http://localhost:4200

### Or run both at once

```bash
chmod +x run.sh
./run.sh
```

---

## Project Structure

```
bench-resource-optimizer/
├── backend/
│   ├── main.py                    # FastAPI app + route handlers
│   ├── storage.py                 # JSON file persistence
│   ├── requirements.txt
│   ├── agents/
│   │   ├── cv_parser_agent.py     # LLM: PDF → structured JSON
│   │   ├── role_mapping_agent.py  # RAG + LLM: skill gap analysis
│   │   ├── planning_agent.py      # LLM: 7-day roadmap
│   │   └── tracking_agent.py      # calculates readiness %
│   ├── rag/
│   │   └── knowledge_base.py      # FAISS vector store build/load
│   ├── data/
│   │   ├── roles_knowledge.json   # role → required skills KB
│   │   ├── users.json             # parsed CV profiles
│   │   └── progress.json          # task completion state
│   └── utils/
│       └── file_parser.py         # PyPDF2 text extraction
└── frontend/
    └── src/app/
        ├── components/
        │   ├── upload-cv/          # Screen 1: upload + parse CV
        │   ├── role-mapping/       # Screen 2: RAG role fit analysis
        │   └── dashboard/          # Screen 3: tasks + readiness score
        ├── services/
        │   ├── api.service.ts      # HTTP calls to backend
        │   └── state.service.ts    # in-memory cross-component state
        └── models/types.ts         # TypeScript interfaces
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/roles` | List all available target roles |
| `POST` | `/upload-cv` | Upload PDF, extract + parse CV |
| `POST` | `/map-role` | RAG: match skills to target role |
| `POST` | `/generate-plan` | Generate 7-day preparation roadmap |
| `POST` | `/update-progress` | Save completed tasks, recalculate score |
| `GET` | `/progress/{user_id}` | Fetch saved progress |

---

## How It Works

### RAG Flow

```
User selects role
       ↓
FAISS vector search → retrieve matching role requirements
       ↓
LangChain prompt: candidate skills vs role requirements
       ↓
Output: match %, matched skills, missing skills
```

### Agent Pipeline

```
PDF upload → CV Parser Agent → UserProfile JSON
                                      ↓
               Role Mapping Agent ← RAG retriever
                                      ↓
                             Planning Agent → 7-day plan
                                      ↓
                            Tracking Agent → readiness %
```

### Readiness Formula

```
readiness_score = (completed_tasks / total_tasks) × 100
```

---

## UI Screens

**Screen 1 — Upload CV**
- Drag & drop or click to upload PDF
- Shows extracted skills, roles, projects, education

**Screen 2 — Role Mapping**
- Select target role from dropdown
- Displays match %, matched skills (green), missing skills (red)
- Generates 7-day plan button

**Screen 3 — Dashboard**
- Day-by-day task list with checkboxes
- Real-time readiness score
- "Save Progress" persists state to JSON

---

## Extending the Knowledge Base

Edit `backend/data/roles_knowledge.json` to add new roles.
Delete `backend/rag/faiss_index/` to rebuild the vector store on next startup.

---

## Notes

- No authentication — designed as a local demo
- Storage is flat JSON files; replace with SQLite/PostgreSQL for production
- LLM costs: each upload/mapping/plan call uses ~1-3K tokens (GPT-4o-mini is cheap)
