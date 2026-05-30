# What is RunbookAI?

---

## For the CEO

**The problem:**
- Every time your system goes down, it costs money — every minute.
- Your senior engineers waste 30–60 min searching for the right fix procedure.
- Junior engineers freeze. They don't know what to do or in what order.
- You are dependent on 1–2 people who "know everything." If they're offline, you're stuck.

**What RunbookAI does:**
- You upload your company's IT fix procedures (PDFs) — just once.
- Any team member types the problem in plain English.
- They get the exact fix steps instantly — no searching, no guessing.
- Junior engineers perform like senior engineers.

**The result:**
- Faster recovery → less downtime → more revenue protected.
- No single point of failure on your team.
- Incidents resolved in minutes, not hours.

**One line:** RunbookAI turns your company's existing knowledge into an instant response engine.

---

## For the CTO

**The problem:**
- RAG-based AI tools hallucinate commands — dangerous in production incidents.
- Engineers waste time in Confluence, Slack, Google Docs during high-pressure outages.
- No structured way to enforce step order, dependencies, or rollback plans.

**What RunbookAI does:**
- PDFs are ingested once through a LangGraph pipeline: `classify → extract steps → validate`.
- DeepSeek LLM extracts fully structured JSON — title, category, severity, commands, dependencies, timeouts, rollback steps.
- All structured data stored in SQLite with WAL mode. Zero vector databases.
- At query time: zero LLM calls. Pure deterministic 3-tier SQL matching:
  - HIGH → exact category + severity match
  - MEDIUM → category match
  - LOW → keyword LIKE search
- NetworkX DiGraph for graph analysis:
  - Critical path via `dag_longest_path`
  - Parallel execution groups via `topological_generations`
  - Failure blast radius via `descendants`
- LLM only writes the triage summary — it never generates commands.
- JWT auth with RBAC: viewer / editor / admin / superadmin, multi-tenant isolated.

**Stack:** FastAPI · LangGraph · DeepSeek · SQLite · NetworkX · Angular 21

**One line:** RAGless architecture — commands come from your PDFs, not from LLM imagination.

---

## For the VP / Manager

**The problem:**
- Procedures exist but are scattered — Word docs, PDFs, wikis, email threads.
- During an incident, engineers spend more time finding the guide than fixing the problem.
- The wrong order of steps can make the incident worse.
- New team members are a liability during incidents.

**What RunbookAI does:**
- Upload all existing IT procedures as PDFs — one time setup.
- Any team member types what's wrong in plain English.
- System instantly returns:
  - The correct procedure to follow
  - Steps in the right order
  - Which steps are critical vs optional
  - Which steps can run in parallel (saves time)
  - Rollback steps if the fix fails
- Works for the newest hire, not just the senior engineer.

**The result:**
- Incidents resolved faster, with fewer mistakes under pressure.
- Team is not dependent on one person who knows everything.
- New hires are productive from day one during incidents.

**One line:** Your team's collective knowledge, available to everyone, instantly.

---

## For the Manager (Day-to-Day Operations)

**The problem:**
- On-call rotation is stressful — engineers are afraid of the 2 AM alert.
- Runbooks are outdated because nobody has time to update them.
- Post-incident reviews show the same mistakes happening again and again.

**What RunbookAI does:**
- Every uploaded PDF becomes a structured, searchable procedure.
- Each procedure has clear step numbers, commands, expected output, and timeouts.
- Critical steps are highlighted — team knows what NOT to skip.
- Rollback plan is always visible alongside the fix plan.
- Multi-runbook view: if two systems fail at the same time, system detects conflicts between procedures and suggests the safe combined order.

**The result:**
- On-call engineers follow a proven path, not instinct.
- Fewer escalations to senior engineers at midnight.
- Post-incident: you can see exactly which steps were relevant and why.

**One line:** Structured, ordered, conflict-aware procedures — not just a document search.

---

## For an Angry Client

**The problem you experienced:**
- Your system was down for hours.
- Our team was scrambling, searching, guessing.
- You lost money, customers, and trust in us.

**What we have built:**
- Every fix procedure is now stored in a system — structured, ordered, searchable.
- The moment something goes wrong, any team member types what they see.
- The system shows them exactly what to do — step by step — in 3 seconds.
- No more searching. No more "let me call the person who knows this."
- Even a new team member follows the exact same proven path as our best engineer.

**What this means for you:**
- Incidents that took 3 hours now take under 30 minutes.
- You will never again wait while we search for the right procedure.
- We have the evidence — every step, timestamp, and decision is logged.

**One line:** We fixed the process, not just the system.

---

## For a Class 6 Student

**Imagine this:**
- You are playing a video game and you get stuck on a really hard level.
- You look up a YouTube guide — it shows you step 1, step 2, step 3.
- You follow it and you complete the level.

**Now think about this:**
- Big companies have computers running their websites, banks, hospitals.
- Sometimes those computers get "sick" and the website stops working.
- The people whose job is to fix computers need a guide — fast.
- But there are hundreds of guides and finding the right one takes a long time.
- While they are searching, the website is broken and everyone is angry.

**What RunbookAI does:**
- The company uploads all their guides into RunbookAI — like saving all YouTube guides in one place.
- When a computer gets sick, the fixer just types what is wrong — like "website is crashing."
- RunbookAI immediately shows the exact guide with all steps to fix it.
- Step 1 → Step 2 → Step 3 → Problem solved.
- It even tells you which step is the most important and which steps you can do at the same time.

**One line:** It is like a super-smart friend who has read every guide ever written and always gives you the right one immediately.

---

## Concrete Example — The Same Incident, Before and After

### The Incident
**3:00 AM.** A Kubernetes pod is stuck in `CrashLoopBackOff` after a deployment.
The monitoring alert fires. The on-call engineer wakes up.

---

### BEFORE RunbookAI

| Time | What happens |
|------|-------------|
| 3:00 AM | Alert fires. Engineer wakes up. |
| 3:05 AM | Logs into the server. Sees the error. Has no idea which runbook applies. |
| 3:15 AM | Searching Confluence. Finds 3 different docs. Not sure which is current. |
| 3:25 AM | Calls the senior engineer on vacation. Waits for callback. |
| 3:40 AM | Senior engineer talks through the fix. Engineer tries steps manually. |
| 3:55 AM | Wrong step order makes the situation worse. More pods fail. |
| 4:30 AM | Finally fixed. 90 minutes of downtime. CEO gets an angry email. |

---

### AFTER RunbookAI

| Time | What happens |
|------|-------------|
| 3:00 AM | Alert fires. Engineer wakes up. |
| 3:02 AM | Opens RunbookAI. Types: *"Pod is stuck in CrashLoopBackOff after deployment."* |
| 3:02 AM | System returns: **Kubernetes Pod CrashLoopBackOff Recovery** — P1 — 7 steps — 22 min estimated. |
| 3:03 AM | Engineer reads Step 1: Check pod logs. Runs the exact command shown. |
| 3:07 AM | Follows Step 2 → Step 3 → Step 4. Critical steps are highlighted in red. |
| 3:18 AM | Step 5 and Step 6 can run in parallel — system shows this. Saves 8 minutes. |
| 3:24 AM | Problem resolved. 24 minutes of downtime. No senior engineer called. |

**Result:** 90 minutes → 24 minutes. Senior engineer sleeps. Client never notices.

---

*Document prepared for RunbookAI — Phase 6 | Enterprise IT Incident Response*
