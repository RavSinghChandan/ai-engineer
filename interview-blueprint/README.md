# 🗺️ Chandan's Lifetime Interview Blueprint

> **One place. All roles. All questions. For life.**
>
> This is your personal, living interview bible — built for AI Engineer, Senior AI Engineer,
> Agentic AI Engineer, and Generative AI Engineer roles.
> You do NOT need YouTube. You do NOT need random websites.
> Open this folder → pick your role → study → clear any interview.

---

## How This Works (Read Once — Remember Always)

Every answer in this blueprint follows **your personal learning style**:

```
┌─────────────────────────────────────────────────────────────┐
│                    THE CHANDAN FORMAT                       │
│                                                             │
│  1. WHAT  — What is this thing?                            │
│  2. WHY   — Why does it exist? What problem does it solve? │
│  3. HOW   — How does it work? Step by step.                │
│  4. WHERE — Where is it used in real production systems?   │
│  5. WHEN  — When should you use it vs not use it?          │
│  6. WHO   — Who uses it? (company, team, persona)          │
│  7. 📌 KEY POINT — The one thing you MUST remember         │
│  8. 🇮🇳 DESI HOOK — One Indian-context memory trick         │
│  9. ❓ FOLLOW-UP Qs — What the interviewer asks next       │
└─────────────────────────────────────────────────────────────┘
```

**Diagrams** are included wherever a picture explains better than words.
**Simple English** — no jargon without explanation.
**Storytelling** — every concept has a real-world story you can narrate in interviews.

---

## Folder Structure at a Glance

```
interview-blueprint/
│
├── README.md                        ← YOU ARE HERE (Master Map)
│
├── 00-how-to-use/
│   └── HOW-TO-STUDY.md             ← Study strategy, monthly ritual
│
├── roles/                           ← Start here based on the JD
│   ├── ai-engineer/
│   │   └── BLUEPRINT.md            ← Full topic map + links for AI Engineer
│   ├── senior-ai-engineer/
│   │   └── BLUEPRINT.md            ← Full topic map + links for Senior AI Engineer
│   ├── agentic-ai-engineer/
│   │   └── BLUEPRINT.md            ← Full topic map + links for Agentic AI Engineer
│   └── generative-ai-engineer/
│       └── BLUEPRINT.md            ← Full topic map + links for GenAI Engineer
│
├── topics/                          ← The CORE — all questions live here
│   ├── 01-llm-core/
│   │   └── LLM-CORE.md             ← Transformers, Attention, Tokens, Fine-tuning
│   ├── 02-rag-systems/
│   │   └── RAG-SYSTEMS.md          ← RAG, Top-K, Reranking, Hallucination
│   ├── 03-agentic-ai/
│   │   └── AGENTIC-AI.md           ← Agents, ReAct, LangGraph, Tool Use
│   ├── 04-system-design/
│   │   └── SYSTEM-DESIGN.md        ← Designing AI systems end-to-end
│   ├── 05-mlops/
│   │   └── MLOPS.md                ← Deployment, monitoring, LLMOps
│   ├── 06-frameworks/
│   │   └── FRAMEWORKS.md           ← LangChain, LangGraph, FastAPI, Vector DBs
│   ├── 07-python-for-ai/
│   │   └── PYTHON-FOR-AI.md        ← Python patterns every AI engineer must know
│   └── 08-behavioral/
│       └── BEHAVIORAL.md           ← STAR stories, leadership, conflict
│
├── company-logs/                    ← Your personal interview diary
│   ├── templates/
│   │   └── COMPANY-LOG-TEMPLATE.md ← Copy this for every new company
│   └── [YYYY-MM-DD]-[Company]-[Role].md
│
└── assets/
    └── diagrams/                    ← All ASCII and image diagrams
```

---

## Your Role → Topic Map

Pick your target role. Follow the links below.

### 🟢 AI Engineer (0–3 years)

| Priority | Topic | File |
|----------|-------|------|
| ⭐⭐⭐ | LLM Core | [topics/01-llm-core/LLM-CORE.md](topics/01-llm-core/LLM-CORE.md) |
| ⭐⭐⭐ | RAG Systems | [topics/02-rag-systems/RAG-SYSTEMS.md](topics/02-rag-systems/RAG-SYSTEMS.md) |
| ⭐⭐ | Frameworks (LangChain, FastAPI) | [topics/06-frameworks/FRAMEWORKS.md](topics/06-frameworks/FRAMEWORKS.md) |
| ⭐⭐ | Python for AI | [topics/07-python-for-ai/PYTHON-FOR-AI.md](topics/07-python-for-ai/PYTHON-FOR-AI.md) |
| ⭐ | Behavioral | [topics/08-behavioral/BEHAVIORAL.md](topics/08-behavioral/BEHAVIORAL.md) |

→ Full blueprint: [roles/ai-engineer/BLUEPRINT.md](roles/ai-engineer/BLUEPRINT.md)

---

### 🔵 Senior AI Engineer (3–7 years)

| Priority | Topic | File |
|----------|-------|------|
| ⭐⭐⭐ | System Design for AI | [topics/04-system-design/SYSTEM-DESIGN.md](topics/04-system-design/SYSTEM-DESIGN.md) |
| ⭐⭐⭐ | RAG Systems (advanced) | [topics/02-rag-systems/RAG-SYSTEMS.md](topics/02-rag-systems/RAG-SYSTEMS.md) |
| ⭐⭐⭐ | LLM Core + Fine-tuning | [topics/01-llm-core/LLM-CORE.md](topics/01-llm-core/LLM-CORE.md) |
| ⭐⭐⭐ | Agentic AI | [topics/03-agentic-ai/AGENTIC-AI.md](topics/03-agentic-ai/AGENTIC-AI.md) |
| ⭐⭐ | MLOps / LLMOps | [topics/05-mlops/MLOPS.md](topics/05-mlops/MLOPS.md) |
| ⭐⭐ | Behavioral (leadership) | [topics/08-behavioral/BEHAVIORAL.md](topics/08-behavioral/BEHAVIORAL.md) |

→ Full blueprint: [roles/senior-ai-engineer/BLUEPRINT.md](roles/senior-ai-engineer/BLUEPRINT.md)

---

### 🟣 Agentic AI Engineer

| Priority | Topic | File |
|----------|-------|------|
| ⭐⭐⭐ | Agentic AI (deep) | [topics/03-agentic-ai/AGENTIC-AI.md](topics/03-agentic-ai/AGENTIC-AI.md) |
| ⭐⭐⭐ | LLM Core | [topics/01-llm-core/LLM-CORE.md](topics/01-llm-core/LLM-CORE.md) |
| ⭐⭐⭐ | System Design for AI | [topics/04-system-design/SYSTEM-DESIGN.md](topics/04-system-design/SYSTEM-DESIGN.md) |
| ⭐⭐ | Frameworks (LangGraph) | [topics/06-frameworks/FRAMEWORKS.md](topics/06-frameworks/FRAMEWORKS.md) |
| ⭐⭐ | RAG Systems | [topics/02-rag-systems/RAG-SYSTEMS.md](topics/02-rag-systems/RAG-SYSTEMS.md) |

→ Full blueprint: [roles/agentic-ai-engineer/BLUEPRINT.md](roles/agentic-ai-engineer/BLUEPRINT.md)

---

### 🟠 Generative AI Engineer

| Priority | Topic | File |
|----------|-------|------|
| ⭐⭐⭐ | LLM Core (deep) | [topics/01-llm-core/LLM-CORE.md](topics/01-llm-core/LLM-CORE.md) |
| ⭐⭐⭐ | RAG Systems | [topics/02-rag-systems/RAG-SYSTEMS.md](topics/02-rag-systems/RAG-SYSTEMS.md) |
| ⭐⭐⭐ | System Design for AI | [topics/04-system-design/SYSTEM-DESIGN.md](topics/04-system-design/SYSTEM-DESIGN.md) |
| ⭐⭐ | Agentic AI | [topics/03-agentic-ai/AGENTIC-AI.md](topics/03-agentic-ai/AGENTIC-AI.md) |
| ⭐⭐ | MLOps | [topics/05-mlops/MLOPS.md](topics/05-mlops/MLOPS.md) |

→ Full blueprint: [roles/generative-ai-engineer/BLUEPRINT.md](roles/generative-ai-engineer/BLUEPRINT.md)

---

## Your Monthly Ritual (Do This Every Month)

```
Week 1: Read your target role BLUEPRINT.md → mark what you feel weak on
Week 2: Go through those weak topic files → re-read W-H answers
Week 3: Answer out loud (talk to yourself / record voice) for 30 min
Week 4: Update company-logs/ with any new interview experience
```

---

## Company Logs (Your Personal Interview Diary)

Every company you interview with → one file in `company-logs/`.

| Date | Company | Role | Result | File |
|------|---------|------|--------|------|
| 2026-05-12 | Birla Opus | Senior AI Engineer | Learning | [company-logs/2026-05-12-Birla-Opus-Senior-AI-Engineer.md](company-logs/2026-05-12-Birla-Opus-Senior-AI-Engineer.md) |

---

## Golden Rule

> Study **WHY** before you memorize **WHAT**.
> The interviewer is not testing your memory. They are testing your **thinking**.
> If you know WHY something exists, you can reconstruct the WHAT on the fly.

---

*Last updated: 2026-06-29 | Maintained by Chandan Kumar*
