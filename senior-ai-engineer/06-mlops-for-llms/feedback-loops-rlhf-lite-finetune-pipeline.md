# Senior AI Engineer — Module 6
# Topic: Feedback Loops — RLHF Lite, Thumbs Up/Down → Fine-tune Pipeline (Senior-Only Topic)

---

## 1. Intuition

Deploying an AI system is not the end. It is the beginning of a feedback loop that makes the system better over time.

Senior engineers design feedback collection and improvement pipelines from day one — not as an afterthought when quality starts degrading.

---

## 2. Core Concept

### RLHF (Reinforcement Learning from Human Feedback)
How GPT-4 and Claude learned to be helpful:
1. Supervised fine-tuning (SFT): train on human-written high-quality responses
2. Reward model training: humans rank multiple responses, train a model to predict human preference
3. RLHF: use the reward model to fine-tune the LLM via RL (PPO algorithm)

For most teams: this is too expensive and complex to implement from scratch.

### RLHF Lite (Practical Production Pattern)
The key insight from RLHF: collect human preference signal → use it to improve the model.
You do not need full RL. You need:
1. Collect thumbs up/down or ranking signals on live responses
2. Store as (prompt, good_response) and (prompt, bad_response) pairs
3. Periodically fine-tune with good examples / DPO (Direct Preference Optimization)

### The Feedback Loop

```
User sees AI response
    ↓
User signals feedback: thumbs up / thumbs down / edit correction
    ↓
Signal stored: {query, context, response, signal, user_id, timestamp}
    ↓
Weekly: review flagged responses (human review of thumbs-down)
    ↓
Monthly (or when enough data): fine-tune on approved good examples
OR: update few-shot examples in prompt with best-rated responses
    ↓
Deploy improved model/prompt → better responses
    ↓
Measure: does thumbs-up rate increase? Does faithfulness improve?
```

---

## 3. Code Skeleton (Production-Grade)

```python
# Feedback collection API
from pydantic import BaseModel
from enum import Enum

class FeedbackSignal(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    EDITED = "edited"  # user corrected the response

class FeedbackRequest(BaseModel):
    query_id: str  # links to the original query log
    signal: FeedbackSignal
    edited_response: str | None = None  # if user corrected it
    comment: str | None = None

@app.post("/v1/feedback")
async def collect_feedback(feedback: FeedbackRequest, user: dict = Depends(verify_api_key)):
    db.execute("""
        INSERT INTO response_feedback 
        (query_id, user_id, tenant_id, signal, edited_response, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    """, (feedback.query_id, user["user_id"], user["tenant_id"],
          feedback.signal.value, feedback.edited_response, feedback.comment))
    
    # Trigger review queue for negative signals
    if feedback.signal == FeedbackSignal.NEGATIVE:
        review_queue.push({"query_id": feedback.query_id, "priority": "normal"})
    
    return {"status": "recorded"}

# Weekly feedback analysis
def analyze_feedback_weekly():
    """Extract patterns from feedback to improve prompts and fine-tuning data"""
    
    # Get last 7 days of feedback
    feedback = db.query("""
        SELECT ql.query_text, ql.answer_text, ql.retrieved_chunks,
               rf.signal, rf.edited_response, rf.comment
        FROM response_feedback rf
        JOIN query_logs ql ON rf.query_id = ql.query_id
        WHERE rf.created_at > NOW() - INTERVAL '7 days'
    """)
    
    positive = [f for f in feedback if f["signal"] == "positive"]
    negative = [f for f in feedback if f["signal"] == "negative"]
    edited = [f for f in feedback if f["edited_response"]]
    
    logger.info(f"Weekly feedback: +{len(positive)} / -{len(negative)} / edited:{len(edited)}")
    
    # Negative feedback → review queue for human annotation
    for item in negative:
        review_queue.push({
            "query": item["query_text"],
            "bad_response": item["answer_text"],
            "comment": item["comment"],
            "needs_good_response": True
        })
    
    # Edited responses → immediate high-quality training examples
    training_examples = []
    for item in edited:
        training_examples.append({
            "messages": [
                {"role": "system", "content": load_system_prompt("qa_answer")},
                {"role": "user", "content": item["query_text"]},
                {"role": "assistant", "content": item["edited_response"]}  # human-corrected response
            ]
        })
    
    if len(training_examples) >= 50:  # enough for fine-tuning
        trigger_fine_tune_job(training_examples)
    else:
        # Not enough for fine-tuning — use as few-shot examples instead
        update_few_shot_examples(training_examples[:5])
    
    return {"positive": len(positive), "negative": len(negative), "training_examples": len(training_examples)}

# Few-shot prompt updater (lightweight alternative to fine-tuning)
def update_few_shot_examples(new_examples: list[dict]):
    """Replace the worst-performing few-shot examples with new high-quality ones"""
    current_examples = load_few_shot_examples()
    
    # Score current examples by how often similar queries got positive feedback
    scored = [(ex, get_example_performance_score(ex)) for ex in current_examples]
    scored.sort(key=lambda x: x[1])
    
    # Replace bottom performers with new examples
    n_replace = min(len(new_examples), 2)
    updated = [ex for ex, _ in scored[n_replace:]] + new_examples[:n_replace]
    
    save_few_shot_examples(updated)
    logger.info(f"Updated {n_replace} few-shot examples")

# Fine-tuning pipeline (OpenAI fine-tuning API)
def trigger_fine_tune_job(training_examples: list[dict]):
    import json
    
    # Write JSONL
    training_file = "\n".join([json.dumps(ex) for ex in training_examples])
    
    # Upload to OpenAI
    file_response = openai.files.create(
        file=training_file.encode(),
        purpose="fine-tune"
    )
    
    # Create fine-tune job
    job = openai.fine_tuning.jobs.create(
        training_file=file_response.id,
        model="gpt-4o-mini",
        hyperparameters={"n_epochs": 3}
    )
    
    db.execute("INSERT INTO fine_tune_jobs (job_id, status, num_examples, created_at) VALUES (?, 'queued', ?, NOW())",
               (job.id, len(training_examples)))
    
    logger.info(f"Fine-tune job submitted: {job.id} with {len(training_examples)} examples")
```

---

## 5. Example (From Your Projects — Senior Framing)

**AstroIntel — Admin Review as RLHF Lite:**

The Admin Review step is already a human feedback mechanism. An admin can:
- Approve: this insight is correct (positive signal)
- Edit: correct the insight (edited signal = high-quality training example)
- Reject: this insight is wrong (negative signal)

Turning this into a feedback loop:
- Approved insights → training data for future fine-tuning
- Edited insights → immediate high-quality examples (human corrected the LLM output)
- Rejected insights → investigation: is this a systematic prompt failure or a one-off?

In interview: "AstroIntel has a human-in-the-loop review step built into the pipeline. I would close the feedback loop by extracting approved and edited insights as training data. Over time, this would allow fine-tuning the domain agents to produce better quality insights specific to our use cases."

---

## 6. Trade-offs

Thumbs up/down signals:
+ Easy to collect, minimal user friction
- Noisy, low volume, users are more likely to downvote than upvote

User correction (edited response):
+ Highest quality signal — exact correct response from human
- Rare: only highly motivated users will correct the AI

Expert annotation:
+ Most reliable quality signal
- Expensive, slow, does not scale

Prompt update vs fine-tuning:
Prompt: cheaper, faster, immediately deployable. Best for small improvements.
Fine-tuning: more powerful for domain-specific behavior, but requires 50+ examples and takes hours. Best for systematic improvement.

---

## 7. Interview Questions (Senior Level)

- How do you build a feedback loop for an AI chatbot without a dedicated ML team?

  **Answer:** Collect implicit signals (thumbs up/down, edit actions, follow-up correction queries) and log them with query_id, user_id, and timestamp — this requires no ML expertise to set up. Weekly, review the bottom 20 responses by rating and identify patterns: are they failing on a specific query type, topic, or output format? Update few-shot examples or system prompt constraints based on patterns — this is prompt engineering, not ML. AstroIntel's admin review (approve/edit/reject) is exactly this feedback loop at a higher quality level — human experts provide direct correction signals that accumulate as training data. In Bench Resource Optimizer, the LLM-as-judge pipeline provides an automated feedback loop without human reviewers: plans scoring below 3.5 are flagged, the low-scoring examples are logged to a review queue, and patterns across flagged plans (e.g., consistently low Actionability scores) reveal which prompt or retrieval component needs tuning.

- What is DPO and how does it differ from RLHF?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- When would you update few-shot examples vs fine-tuning?

  **Answer:** Update few-shot examples when the failure pattern is consistent and reproducible (specific query type consistently gets wrong format, specific domain consistently gets wrong tone) and you have 1-5 clear examples of the correct behavior. Fine-tune when the failure pattern is pervasive across many query types and requires deep behavioral change that few examples cannot anchor — typically after accumulating 50+ high-quality preference pairs. The practical rule: few-shot update takes hours and is reversible in minutes; fine-tuning takes days and costs money. Always exhaust few-shot improvement first before investing in fine-tuning.

- How do you measure whether the feedback loop is actually improving model quality?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

- What is the minimum number of training examples needed for effective fine-tuning?

  **Answer:** OpenAI's guidance is 50-100 examples as the practical minimum; below 50, the model doesn't generalize the new behavior well. For DPO fine-tuning with LoRA on open-source models, 200-500 preference pairs typically produce meaningful behavioral change. The quality of examples matters more than quantity — 50 high-quality, diverse examples from different query patterns beats 500 similar examples that all look alike. In AstroIntel, the admin review generates ~10-20 preference pairs per day of active usage; after 1-2 months, there would be enough data to run a domain-specific DPO fine-tune on the specialist agents.

---

## 8. Answer Framework

Step 1 — Collect feedback at the right granularity:
"I collect thumbs up/down per response. Edited responses are the highest-quality signal. I log all feedback with query_id, user_id, and timestamp."

Step 2 — Lightweight loop first:
"Before fine-tuning, I update few-shot examples with the best-rated responses. This is zero-cost and immediately deployable."

Step 3 — Fine-tune when you have enough data:
"Once I have 50+ edited/approved examples, I submit a fine-tuning job. GPT-4o-mini fine-tuning costs ~$10 for 100 examples. Very accessible."

Step 4 — From your project:
"AstroIntel's admin review step is already a feedback collection mechanism. I would extract approved and edited insights as training data to improve domain agent quality over time."

Step 5 — Measure the loop:
"After each feedback-driven improvement (prompt update or fine-tune), I run the RAGAS eval suite and compare to baseline. The loop is working if faithfulness and relevancy trend upward over releases."

---

## 10. Advanced Follow-ups

Q1: What is DPO and how does it differ from RLHF?

Answer:
Both RLHF and DPO aim to make the model align with human preferences. They differ in how they use preference data.
RLHF: three-step process. First train a reward model on preference pairs. Then use RL (PPO) to fine-tune the LLM to maximize the reward model's score. Complex, unstable, requires careful hyperparameter tuning.
DPO (Direct Preference Optimization): skip the reward model entirely. Directly fine-tune the LLM using (chosen, rejected) response pairs with a mathematically equivalent objective. Much simpler, more stable, produces similar or better results.
For most teams: DPO is the practical choice. You collect (query, good_response, bad_response) triples and run DPO fine-tuning. No reward model needed.
Implementation: use the `trl` library with DPOTrainer. Works with HuggingFace models. For OpenAI models: use their fine-tuning API which internally handles preference optimization.

Q2: How do you handle feedback bias — power users dominate the feedback signal?

Answer:
Feedback bias is real: a small % of engaged users generate most feedback, and their preferences may not represent the general user population.
Detection: track feedback volume by user. If 10% of users are generating 80% of feedback, you have a bias problem.
Mitigation strategies:
First, stratified sampling: ensure your training data includes examples from diverse user segments, not just power users.
Second, weight by novelty: examples from underrepresented query types get higher weight.
Third, A/B testing as ground truth: instead of relying on feedback alone, run A/B tests where the treatment group gets an improved prompt/model and measure task completion rate, session length, and other behavioral metrics that are harder to game than explicit feedback.
Fourth, human annotation on random samples: periodically have experts annotate a random sample of responses (not user-selected), which provides an unbiased quality estimate.

Q3: How do you track whether fine-tuning improved production quality?

Answer:
Three measurements.
Before fine-tuning: run RAGAS eval suite on the current model, record baseline scores.
After fine-tuning: deploy fine-tuned model to 10% of traffic (canary). Run RAGAS on canary traffic. Compare to baseline.
Behavioral metrics: thumbs-up rate, session length, return usage rate. If fine-tuning worked, thumbs-up rate should increase and negative feedback volume should decrease.
A/B test: old model vs fine-tuned model on the same set of queries. Human judges blind evaluation (they don't know which is which). Preference rate for the fine-tuned model is the cleanest quality signal.
If RAGAS improves but behavioral metrics do not, the fine-tuning improved the AI's measured quality on the eval set but not the metric that actually matters to users. Go back and analyze what users actually care about vs what RAGAS measures.

---

## LIVE IMPLEMENTATION — AstroIntel 360° Multi-Tenant Feedback Loop (2026-05-28)

### The problem it solves

AstroIntel is a multi-tenant SaaS. Each enterprise tenant has a domain expert who reviews AI-generated spiritual insights and corrects them before approval. Two problems existed:
1. **No memory:** Corrections were discarded — the next report repeated the same mistakes.
2. **Data isolation bug:** A naive single-table correction store would mix Tenant A's editorial style into Tenant B's pipeline — a critical multi-tenant violation.

**Solution:** A per-tenant correction store. Every correction is tagged with `tenant_id`. All retrieval is scoped to the authenticated tenant. Tenant A's corrections never influence Tenant B's pipeline.

### What was built — Phase 1 (multi-tenant correction logging + tenant persona injection)

**New API endpoints** (`/api/v1/feedback/*`, tenant-scoped — RBAC via `can(Permission.ANALYSIS__APPROVE)`):

| Endpoint | Purpose |
|----------|---------|
| `POST /corrections` | Log a correction for this tenant (reason tag: tone/factual/wrong_remedy/language) |
| `POST /corrections/batch` | Bulk log corrections for this tenant |
| `GET /corrections` | View this tenant's correction history, filter by intent |
| `GET /corrections/stats` | Count this tenant's corrections by intent |
| `POST /persona/preferences` | Save a permanent preference for this tenant (e.g. `__persona__: "custom voice"`) |
| `GET /persona/preferences` | View all saved preferences for this tenant |
| `GET /persona/preview?query=...` | Debug: see exactly what agents will receive for this tenant + query |

**Auto-logging on `/approve`:** The `ApprovalRequest` schema was extended with an optional `edited_insights[]` field. When the admin edits insights before approving, corrections are auto-logged for `ctx.tenant_id` — no separate API call needed.

```python
# schemas/models.py
class EditedInsight(BaseModel):
    insight_id:     str
    original_text:  str
    corrected_text: str
    reason_tag:     str = ""   # "tone" | "factual" | "wrong_remedy" | "language"

class ApprovalRequest(BaseModel):
    session_id:            str
    approved_insight_ids:  List[str]
    rejected_insight_ids:  List[str]
    edited_insights:       List[EditedInsight] = []   # ← new, backwards-compatible
```

**At pipeline start** (`/run`), the per-tenant correction store is queried and injected:

```python
# routers/analysis.py — ctx.tenant_id comes from authenticated JWT
chandan_preferences = build_tenant_context(
    query=final_question,
    intent="general",
    tenant_id=ctx.tenant_id,   # ← CRITICAL: scoped to this tenant only
)
initial_state = { ..., "chandan_preferences": chandan_preferences }
```

**DB schema** — `tenant_id` as partition key on both tables:

```sql
CREATE TABLE episodic_corrections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id      TEXT NOT NULL DEFAULT 'tenant_master',  -- ← partition key
    insight_id     TEXT NOT NULL,
    intent         TEXT NOT NULL DEFAULT 'general',
    original_text  TEXT NOT NULL,
    corrected_text TEXT NOT NULL,
    similarity_key TEXT NOT NULL DEFAULT '',               -- bag-of-words fingerprint
    created_at     REAL NOT NULL
);
CREATE INDEX idx_ec_tenant_intent ON episodic_corrections(tenant_id, intent);

CREATE TABLE persona_preferences (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id  TEXT NOT NULL DEFAULT 'tenant_master',      -- ← partition key
    pref_key   TEXT NOT NULL,
    pref_value TEXT NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(tenant_id, pref_key)                            -- ← per-tenant uniqueness
);
```

### The three-phase fine-tuning roadmap (now per-tenant)

```
Phase 1 (NOW — live in production)
  Every correction logged per tenant_id → retrieved at next /run for same tenant
  Effect: each tenant's agents immediately stop repeating that tenant's corrected mistakes
  Dataset: building correction_history per tenant in SQLite

Phase 2 (when 100+ corrections per tenant)
  Run per-tenant distillation script:
    for each correction in DB WHERE tenant_id=X:
        generate 3 synthetic training examples in that tenant's corrected style
        tenant admin reviews and approves each
  Output: per-tenant JSONL fine-tuning dataset triples

Phase 3 (when 500+ approved examples per tenant)
  LoRA fine-tune Mistral-7B-Instruct on the tenant's dataset (trl library, 4-bit quantisation)
  Merge adapter weights → host privately per tenant
  Replace DeepSeek calls for insight generation with the tenant's personal model
  Result: each tenant gets a model that speaks in their exact editorial voice
```

### Why not fine-tune immediately?

Senior answer (the one that gets you hired):

"Fine-tuning without sufficient domain-specific data degrades model performance — the model overfits to the few examples and loses general capability. You need minimum 200–500 high-quality (input, ideal output) pairs for LoRA to add signal rather than noise. We're building that dataset per-tenant through real corrections on real reports. Meanwhile, per-tenant persona prompting + episodic recall gives us 70–80% of the quality gain immediately, with zero training cost. In three months, when we have the data, we fine-tune — and the baseline we're comparing against will already be improved by the per-tenant correction injection."

### Tests

`tests/test_episodic_memory.py` — 30 tests covering:

**Functional tests (16):**
- `log_correction` write + ID return
- `retrieve_similar_corrections` — cosine similarity, top-K, score ordering, empty-when-no-match
- `list_corrections` — default and intent-filtered
- `correction_stats` — counts by intent
- `set/get_persona_pref` — upsert behaviour
- `build_tenant_context` — structure, past correction inclusion, tenant_id in output
- `format_for_prompt` — persona block, LEARNED CORRECTIONS block, preference overrides

**Multi-tenant isolation tests (14):**
- `test_tenant_isolation_retrieve` — Tenant B gets zero results from Tenant A's corrections
- `test_tenant_isolation_list_corrections` — each tenant sees only their own rows
- `test_tenant_isolation_correction_stats` — per-tenant counts are accurate
- `test_correction_stats_global_counts_all` — global view shows both tenants
- `test_tenant_isolation_persona_prefs` — prefs are scoped per tenant
- `test_build_tenant_context_isolation` — Tenant B's context contains no Tenant A corrections
- `test_build_tenant_context_own_corrections_visible` — Tenant A sees their own corrections
- `test_custom_persona_override` — `__persona__` pref replaces DEFAULT_PERSONA for that tenant
- `test_backward_compat_build_chandan_context` — alias still works, uses `tenant_master`
- `test_chandan_persona_alias` — CHANDAN_PERSONA importable, equals DEFAULT_PERSONA
- plus 4 additional edge-case isolation checks

All 30 passing. Zero external dependencies in the test suite.

---

## ★ YOUR 5 PROJECTS — Feedback Loops in Practice

| Project | Feedback mechanism | How it improves the system |
|---------|------------------|--------------------------|
| **AstroIntel 360°** | Admin Review workspace — Approve / Flag / Generate Report | Approved insights inform future system prompts. RLHF-lite: human preference data collected per insight. Episodic corrections stored in SQLite. |
| **Bench Resource Optimizer** | `update-progress` — task completion as implicit feedback | Readiness score updates live. RAGAS scores per query feed prompt improvement cycle. Readiness history tracked as time-series — trend visible. |
| **RunbookAI** | Conflict detection as feedback loop | When internal and official runbooks conflict, engineer resolves it → resolution updates the runbook. Human-in-the-loop knowledge correction. |
| **Agentic Growth OS** | **Explicit auto-learning loop** | Every campaign run stores result. Next run: similarity-match past campaigns → extract winning rules → apply to agent prompts automatically. ROI delta measured. System improves itself. |
| **Universal Agent** | Session history as implicit feedback | `max_history: 20` — conversation context improves follow-up quality. Session expiry resets stale context. |

**Interview line:** "Agentic Growth OS has the most sophisticated feedback loop — it's not human-in-the-loop, it's automated learning. After each campaign run, the learning engine stores the ROI, CTR, and conversion rate. For the next similar campaign, it extracts the winning rules from high-ROI past runs and modifies the agent prompts before the run starts. ROI improves 40–80% run-over-run. This is DPO-style learning applied without any model fine-tuning."
