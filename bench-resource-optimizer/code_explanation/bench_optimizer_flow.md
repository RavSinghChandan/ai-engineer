# Bench Resource Optimizer — Dynamic Code Flow
> `bench-resource-optimizer/backend/`

---

## What This Project Does

An **AI-powered career readiness tool**.
Upload your CV → it parses your skills → maps you to a target role → generates a personalized day-by-day learning plan → tracks your progress.

Uses **LangChain chains** (not agents) — every LLM call is a structured `Prompt | LLM` pipeline.
Uses **FAISS + HuggingFace embeddings** for local RAG (no OpenAI embeddings needed).

**Type:** LangChain Chains + RAG (FAISS + HuggingFace)  
**LLM:** DeepSeek (OpenAI-compatible)  
**Embeddings:** HuggingFace all-MiniLM-L6-v2 (runs 100% locally, no API cost)

---

## Mind Map

```
                    ┌──────────────┐
                    │     USER     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────────────┐
              │            │                    │
              ▼            ▼                    ▼
    POST /upload-cv   POST /map-role    POST /generate-plan
              │            │                    │
              ▼            ▼                    ▼
       ┌──────────┐  ┌──────────────┐  ┌──────────────────┐
       │ parse_cv │  │  map_role    │  │  generate_plan   │
       │ (agent)  │  │  (agent)     │  │  (agent, async)  │
       └────┬─────┘  └──────┬───────┘  └────────┬─────────┘
            │               │                   │
            ▼               ▼                   │
    Prompt | LLM    Prompt | LLM         Phase 1: outline
    → JSON CV       FAISS search         (1 LLM call)
    profile         → role context              │
            │       → match %           Phase 2: day tasks
            ▼       missing skills      (N parallel LLM calls)
    save_user()                                 │
    returns user_id                      save_progress()

                    ┌─────────────────────────────┐
                    │   POST /update-progress      │
                    │   calculate_readiness()      │
                    │   NO LLM — pure Python math  │
                    │   returns readiness_score    │
                    └─────────────────────────────┘

────────────────────────────────────────────────────

SHARED INFRASTRUCTURE (started once at app boot):

  main.py::lifespan()
    ├── DeepSeek LLM created → shared as _llm
    └── HuggingFace embeddings loaded
        → FAISS index built from roles_knowledge.json
        → shared as _vector_store
```

---

## Step-by-Step Code Flow

```
APP STARTUP (happens once):
  main.py::lifespan()
    → Load DEEPSEEK_API_KEY from .env
    → Create ChatOpenAI(_llm) pointing to DeepSeek
    → get_embeddings() → loads HuggingFace model (all-MiniLM-L6-v2)
    → build_vector_store(embeddings)
        → reads data/roles_knowledge.json
        → converts each role to a Document
        → FAISS.from_documents() → builds index
        → saved/loaded from faiss_index/ folder
    → App is ready ✅

─────────────────────────────────────────────────────────────────

STEP 1 — Upload CV: POST /upload-cv (file: PDF)
  main.py::upload_cv()
    → extract_text_from_pdf(raw_bytes) → plain text
    → agents/cv_parser_agent.py::parse_cv(resume_text, _llm)
          ChatPromptTemplate:
            system: "You are a CV parser. Return ONLY valid JSON."
            human: "Extract info from this resume: {resume_text[:1200]}"
          chain = prompt | llm.bind(max_tokens=380)
          chain.invoke() → LLM returns JSON string
          parse_llm_json() → Python dict
          returns: { name, email, skills, experience_years, roles, projects }
    → save_user(parsed_profile) → generates user_id
    → Returns { user_id, profile }

─────────────────────────────────────────────────────────────────

STEP 2 — Map to Role: POST /map-role
  main.py::map_role_endpoint(user_id, target_role)
    → get_user(user_id) → load saved profile
    → agents/role_mapping_agent.py::map_role(profile, target_role, _vector_store, _llm)
          FAISS search: vector_store.similarity_search(target_role, k=1)
          → finds the closest role description in knowledge base
          → role_context = that document's text

          ChatPromptTemplate:
            system: "You are a technical recruiter. Return ONLY compact JSON."
            human:  "Compare candidate vs role. Candidate: {skills}. Role: {context}"
          chain = prompt | llm.bind(max_tokens=220)
          chain.invoke() → LLM returns JSON
          returns: { match_percentage, matched_skills, missing_skills, recommendation }

─────────────────────────────────────────────────────────────────

STEP 3 — Generate Plan: POST /generate-plan
  main.py::generate_plan_endpoint(user_id, target_role, missing_skills, num_days)
    → agents/planning_agent.py::generate_plan() ← ASYNC function

    PHASE 1 — Outline (1 LLM call):
      prompt: "List exactly {num_days} day themes for role {role}"
      chain.ainvoke() → returns pipe-delimited text:
        "1|Docker Fundamentals|Docker
         2|Kubernetes Basics|Kubernetes
         ..."
      _parse_outline() → list of {day, theme, skill}

    PHASE 2 — Day tasks (N parallel LLM calls):
      asyncio.gather(
        _generate_one_day(day1, role, llm),
        _generate_one_day(day2, role, llm),
        ...
      )
      Each call: prompt → LLM → JSON {day, theme, tasks:[t1,t2]}
      Each task gets resource URL from SKILL_RESOURCES dict (no LLM)
      Semaphore limits max 6 concurrent LLM calls

    → save_progress(user_id, {role, plan, completed_task_ids: []})
    → Returns full plan

─────────────────────────────────────────────────────────────────

STEP 4 — Update Progress: POST /update-progress
  → calculate_readiness() ← NO LLM, pure Python
      completed / total * 100 = readiness_score
      returns: { readiness_score, status, next_suggested_task }
```

---

## One Complete Example — "I want to become a Backend Java Developer"

**Start: Upload CV**
```
User uploads: resume.pdf

1. extract_text_from_pdf → "Chandan Kumar\nSkills: Python, FastAPI, SQL\n3 years experience..."

2. cv_parser_agent prompt to DeepSeek:
   "Extract info from this resume..."

3. DeepSeek returns:
   {
     "name": "Chandan Kumar",
     "skills": ["Python", "FastAPI", "SQL"],
     "experience_years": 3,
     "roles": ["Backend Developer"]
   }

4. save_user() → user_id = "abc123"

Response: { "user_id": "abc123", "profile": {...} }
```

**Map to Role**
```
POST /map-role  { user_id: "abc123", target_role: "Backend Java Developer" }

1. FAISS searches roles_knowledge.json for "Backend Java Developer"
   → Finds: "Role: Java Backend Developer. Required Skills: Java, Spring Boot, Docker, Kubernetes, JWT..."

2. Prompt to DeepSeek:
   "Candidate has: Python, FastAPI, SQL (3 yrs)
    Role requires: Java, Spring Boot, Docker, Kubernetes, JWT"

3. DeepSeek returns:
   {
     "match_percentage": 35,
     "matched_skills": ["SQL"],
     "missing_skills": ["Java", "Spring Boot", "Docker", "Kubernetes", "JWT"],
     "recommendation": "Strong Python background — needs Java ecosystem skills"
   }
```

**Generate Plan**
```
POST /generate-plan {
  user_id: "abc123",
  target_role: "Backend Java Developer",
  missing_skills: ["Java", "Spring Boot", "Docker", "Kubernetes", "JWT"],
  num_days: 5
}

PHASE 1 — 1 LLM call for outline:
  DeepSeek returns:
  "1|Java Fundamentals|Java
   2|Spring Boot Basics|Spring Boot
   3|REST APIs and JWT|JWT
   4|Docker Containers|Docker
   5|Kubernetes Orchestration|Kubernetes"

PHASE 2 — 5 parallel LLM calls:
  Day 1 task call → { day:1, theme:"Java Fundamentals", tasks:[
    { id:"d1t1", title:"Practice Java OOP concepts", skill:"Java", hours:2 },
    { id:"d1t2", title:"Build a Java calculator app", skill:"Java", hours:2 }
  ]}
  ... (4 more parallel calls)

Resources injected (no LLM):
  "Java" → https://docs.oracle.com/en/java/
  "Docker" → https://docs.docker.com/get-started/

Final plan: 5 days × 2 tasks = 10 tasks total
```

**Track Progress**
```
POST /update-progress { user_id: "abc123", completed_task_ids: ["d1t1", "d1t2"] }

calculate_readiness():
  total = 10, completed = 2
  score = 2/10 × 100 = 20%
  status = "In Progress"
  next_suggested_task = "Practice Spring Boot basics"

Response: { readiness_score: 20, status: "In Progress", ... }
```

---

## File Map

```
bench-resource-optimizer/backend/
├── main.py                   → FastAPI app + startup (LLM + FAISS init)
├── agents/
│   ├── cv_parser_agent.py    → Prompt | LLM → JSON CV profile
│   ├── role_mapping_agent.py → FAISS search + Prompt | LLM → match score
│   ├── planning_agent.py     → Async 2-phase plan generator
│   └── tracking_agent.py    → Pure Python readiness calculator (no LLM)
├── rag/
│   └── knowledge_base.py    → HuggingFace embeddings + FAISS index builder
├── storage.py               → Save/load user profiles and progress (JSON files)
├── utils/
│   ├── file_parser.py       → Extract text from PDF
│   └── json_parser.py       → Safe parse LLM JSON output
└── data/
    └── roles_knowledge.json → Role descriptions (the RAG knowledge base)
```

---

## Key LangChain Concepts in This Project

```
CHAINS (not agents — every call is a straight pipeline):

  ChatPromptTemplate.from_messages([...])
        |
  llm.bind(max_tokens=380)   ← limits output size for speed
        |
  chain.invoke(inputs)       ← sync
  chain.ainvoke(inputs)      ← async (used in planning)

RAG FLOW:

  roles_knowledge.json
        ↓
  HuggingFace Embeddings (local, free)
        ↓
  FAISS index (saved to disk, loaded on boot)
        ↓
  similarity_search(target_role, k=1)
        ↓
  role description → added to LLM prompt as context

ASYNC PARALLEL LLM CALLS:

  asyncio.gather(day1_call, day2_call, day3_call...)
  → All N day tasks generated simultaneously
  → 5x faster than sequential calls
  → Semaphore(6) prevents overloading the API
```
