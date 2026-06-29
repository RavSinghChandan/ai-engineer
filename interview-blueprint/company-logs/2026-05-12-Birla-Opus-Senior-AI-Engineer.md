# Birla Opus (Aditya Birla Group) — Senior AI Engineer Interview Log

---

## Basic Info

| Field | Value |
|-------|-------|
| **Company** | Birla Opus / Aditya Birla Group |
| **Role** | Senior AI Engineer |
| **Date** | 2026-05-12 |
| **Recruiter** | Rupesh, Team Forward (forward.net.in) |
| **Result** | Not Cleared |
| **Rounds** | Technical (RAG concepts + Live Coding) |

---

## Company Overview

Birla Opus is the paint division of the Aditya Birla Group, one of India's largest conglomerates. They are investing in AI/ML to improve customer experience (color matching, interior design recommendations, customer support) and internal operations. The AI team works on production ML systems integrated with their retail and enterprise channels.

---

## Questions Asked

### Technical Round (Concepts + Live Coding)

**Q1: Explain Top-K retrieval and reranking strategies.**

*How Chandan answered:* Explained Top-K but could not structure the full range of strategies (Fixed Top-K, Score Threshold, MMR, Reranking, Hybrid, HyDE). Got vague on the "why behind the why."

*What they wanted:* A structured table of strategies with trade-offs. Not just "what" but "when to use which and why."

**→ Gap fixed in:** [RAG Systems - Concept 3: Top-K and Reranking](../topics/02-rag-systems/RAG-SYSTEMS.md)

---

**Q2: Hallucination mitigation strategies in production RAG.**

*How Chandan answered:* Mentioned prompt engineering and RAG but couldn't structure 5 concrete layers of defense.

*What they wanted:* Multi-layer defense: retrieval quality → prompt guardrails → faithfulness scoring → threshold-based escalation → human-in-the-loop.

**→ Gap fixed in:** [RAG Systems - Concept 2: Hallucination](../topics/02-rag-systems/RAG-SYSTEMS.md)

---

**Q3: Live coding — Build a RAG pipeline from scratch.**

*Setup:* Given `demo.txt` and a starter `app-policy.py`. No Google. No autocomplete.

*Task:*
1. Write chunking code
2. Write embedding code
3. Write LLM call
4. Write retrieval
5. Write answer generation

*How Chandan answered:* Got the embedding and vector search right but fumbled on the LLM call syntax (forgot the exact `openai.chat.completions.create` signature). Couldn't explain the chunking strategy when asked "why 512 tokens?"

*What they wanted:* A clean 5-step pipeline written from memory with clear reasoning for every parameter choice.

**→ Gap fixed in:** [Python for AI - Concept 6: RAG From Scratch](../topics/07-python-for-ai/PYTHON-FOR-AI.md)

---

## Topics Tested

- [x] RAG Systems (deep)
- [ ] LLM Core
- [ ] Agentic AI
- [ ] System Design
- [ ] MLOps / LLMOps
- [ ] Frameworks
- [x] Live Coding (RAG pipeline)
- [ ] Behavioral

---

## What Did NOT Go Well

| Gap | Root Cause | How I Fixed It |
|-----|------------|----------------|
| Couldn't structure reranking strategies | Knew the concept, not the structured W-H answer | Added full reranking section to RAG-SYSTEMS.md |
| Hallucination defense — not structured | Knew pieces but no layered defense model | Added 5-layer defense framework to RAG-SYSTEMS.md |
| Live coding froze | Memorized concepts but never coded from scratch without IDE | Practiced RAG from blank file 10+ times |
| "Why 512 tokens?" — no confident answer | Built RAG but never deeply reasoned about params | Added chunk size reasoning to RAG-SYSTEMS.md |

---

## What I Did Well

1. Understood RAG at a conceptual level — the pipeline flow was clear
2. Correctly identified vector DB role and embedding model role
3. Was honest with the interviewer about what I wasn't sure of

---

## What I Would Do Differently

*This loss was a gift.* Before this interview, I was confident about RAG. After this interview, I realized I knew the WHAT but not the deep WHY behind each parameter choice. I also realized I had never coded RAG without IDE assistance.

After this interview, I:
1. Created this entire blueprint so I never walk into an interview underprepared
2. Practiced coding full RAG pipeline from scratch (blank editor, no imports visible) until I could do it in 15 minutes
3. Added "explanation drills" — I explain every parameter choice out loud as if teaching a junior

If I face Birla Opus or any similar interview again, I will clear it. Not because I memorized more, but because I understand it more deeply now.

---

**Result:** Not Cleared
**Feedback received:** Could not code RAG pipeline from scratch; depth on reranking and hallucination insufficient for senior level
**Reflection:** This was the interview that built my interview blueprint. Every file in this folder exists because of this interview. I am grateful for it.

---

*Log created: 2026-05-12 | Last updated: 2026-06-29*
