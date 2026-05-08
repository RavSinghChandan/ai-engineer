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
- What is DPO and how does it differ from RLHF?
- When would you update few-shot examples vs fine-tuning?
- How do you measure whether the feedback loop is actually improving model quality?
- What is the minimum number of training examples needed for effective fine-tuning?

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
