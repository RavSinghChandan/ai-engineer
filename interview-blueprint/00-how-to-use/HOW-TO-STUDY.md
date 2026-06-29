# How to Use This Blueprint — Your Study Playbook

---

## The Problem With Most Interview Prep

Most people:
- Watch YouTube → forget in 3 days
- Read random articles → no structure
- Memorize answers → panic when follow-up comes

**You are different.** You understand through WHY.
This blueprint is built exactly for how your mind works.

---

## The Chandan Format — Explained Once

Every question in this blueprint is answered in this exact format:

### Step 1: WHAT (Definition in one sentence)
> "What is RAG?"
> → "RAG is a technique where an LLM retrieves relevant documents from a database before generating an answer, so it can answer questions beyond its training data."

### Step 2: WHY (The problem it solves)
> Why does RAG exist?
> → Because LLMs hallucinate when asked about private company data or recent events they were not trained on.

### Step 3: HOW (The mechanics — step by step)
> How does RAG work?
> → User asks question → question gets embedded → vector DB searched → top chunks retrieved → chunks + question sent to LLM → answer generated.

### Step 4: WHERE (Real production context)
> Where is RAG used?
> → Customer support bots, internal knowledge Q&A, legal document search, HR policy chatbots.

### Step 5: WHEN (Use it vs skip it)
> When should you use RAG?
> → When your data changes frequently OR when your data is private/company-specific.
> When NOT to use RAG?
> → When your question is fully answerable from the LLM's training data (e.g., "What is the capital of France?").

### Step 6: WHO (Who builds it, who uses it)
> Who uses RAG?
> → Companies like Google (NotebookLM), Salesforce (Einstein AI), enterprise teams with internal wikis.

### Step 7: 📌 KEY POINT (The one thing you must never forget)
> 📌 "RAG = Retrieval + Generation. The retrieval part is what makes the LLM smart about YOUR data. Without retrieval, it's just a chatbot."

### Step 8: 🇮🇳 DESI HOOK (Indian memory trick)
> 🇮🇳 "Think of RAG like a UPSC student. Before answering any question, they open their notes (retrieval). Then they write the answer in their own words (generation). Without notes, they'd hallucinate random facts."

### Step 9: ❓ FOLLOW-UP Qs (What the interviewer asks next)
> Q: How do you handle hallucination in RAG?
> Q: What is the difference between RAG and fine-tuning?
> Q: How do you choose the chunk size?
> → (Each follow-up has its own answer block in the topic file)

---

## How to Study One Topic

```
Time needed per topic: 45–60 minutes

1. Read the WHAT + WHY (5 min)
   → Can you say it back in your own words? Yes → move on. No → re-read.

2. Walk through the HOW diagram (10 min)
   → Trace the flow with your finger. Say it out loud.

3. Read the WHERE + WHEN (5 min)
   → Pick ONE example that connects to YOUR project. Remember that.

4. Memorize the KEY POINT (2 min)
   → This is your anchor. If you blank in an interview, this brings you back.

5. Say the DESI HOOK to yourself (1 min)
   → Funny or familiar → stays in memory forever.

6. Read follow-up Qs and answers (15 min)
   → These are the questions that separate average from great candidates.

7. Close the file. Answer the main question out loud. (10 min)
   → No peeking. If you can explain it to an imaginary junior engineer — you're ready.
```

---

## Monthly Review Ritual

Do this on the **last Sunday of every month** (60–90 minutes):

```
Step 1 (10 min): Open README.md → Check the company logs
                 → What interviews happened this month?
                 → What new questions came up?

Step 2 (20 min): Identify 2–3 weak areas
                 → Topics you fumbled on OR topics you haven't touched in 60+ days

Step 3 (30 min): Re-study those topics using the 7-step method above

Step 4 (20 min): Update any company log file with new learnings
                 → Add new questions you faced
                 → Update the "gaps" section with what you fixed

Step 5 (10 min): Note any NEW topic that appeared in an interview
                 → Create a stub file for it in topics/
                 → (Even a blank file with just WHAT and WHY is a start)
```

---

## Interview Day Ritual (Morning of the Interview)

```
2 hours before: Open the BLUEPRINT.md for the specific role
1 hour before:  Read just the KEY POINTs from each topic (30 sec per topic)
30 min before:  Read your company log for THIS company (if you have one)
5 min before:   Read your DESI HOOKs → they calm you down and anchor your memory
```

---

## How to Add New Content

When you learn something new (from an interview, article, or project):

```
1. Find the right topic file in topics/
2. Add a new question block at the end of the file
3. Use the EXACT Chandan Format (WHAT → WHY → HOW → WHERE → WHEN → WHO → KEY POINT → DESI HOOK → FOLLOW-UPS)
4. If it's a new topic entirely → create a new file in topics/ and add it to README.md
5. If it came from an interview → also update company-logs/ for that company
```

---

## The Mindset

You are not preparing to **pass** an interview.
You are preparing to **understand** the domain so deeply that the interview becomes easy.

The interview is just a side effect of real knowledge.

> "Give me six hours to chop down a tree and I will spend the first four sharpening the axe." — Abraham Lincoln

This blueprint is your axe. Sharpen it every month.

---

*This file is your permanent study guide. Do not delete it.*
