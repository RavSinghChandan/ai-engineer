# Senior AI Engineer — Module 10
# Topic: Fine-tuning vs RAG — Decision Matrix

---

## 1. Intuition

The most common senior AI interview question that separates candidates: "When would you fine-tune a model instead of using RAG?"

Most candidates give a vague answer. Senior candidates give a structured decision matrix with concrete examples and cost analysis.

---

## 2. Core Concept

### What Each Approach Does

**RAG (Retrieval Augmented Generation):**
Keeps the model weights frozen. Augments each prompt with retrieved context from an external knowledge base. The model uses its general reasoning capability applied to the retrieved content.

**Fine-tuning:**
Updates the model weights on domain-specific data. The model learns new patterns, styles, terminology, and behaviors that become part of its weights — no retrieval needed at inference time.

**Key insight:** RAG is a query-time solution. Fine-tuning is a training-time solution. They are not mutually exclusive — the most powerful systems combine both.

---

## 3. Decision Matrix

| Factor | Use RAG | Use Fine-tuning |
|---|---|---|
| **Knowledge type** | Factual, document-grounded, frequently updated | Behavioral, stylistic, domain-specific reasoning patterns |
| **Update frequency** | Daily/weekly (just update the vector DB) | Stable (retraining costs $10-$1000+) |
| **Data volume** | Any size (limited by vector DB, not model) | Needs 100-10,000+ high-quality examples |
| **Latency** | Adds retrieval step (50-200ms) | No retrieval (fast inference) |
| **Explainability** | High (can show retrieved sources) | Low (knowledge is in weights, opaque) |
| **Cost** | Storage + query cost per request | Upfront training cost, then cheaper inference |
| **Primary goal** | Groundedness, reduce hallucination on facts | Style, format, specialized reasoning, instruction following |

---

## 4. When to Use RAG

Use RAG when:

**1. Knowledge is external and dynamic:**
Your data changes: new product docs, news articles, customer support tickets, legal documents. Retraining every time data updates is impractical. Update the vector DB instead.

**2. You need source attribution:**
Users need to see "this answer came from Document X, page 3." RAG naturally provides this. Fine-tuned models can't attribute — the knowledge is baked into weights.

**3. Knowledge base is large:**
A GPT-4o fine-tune is limited in what it can memorize. A vector database can store billions of documents. RAG scales to arbitrary knowledge corpus size.

**4. Reducing hallucination on facts is the priority:**
RAG binds answers to retrieved evidence. A fine-tuned model can confidently hallucinate facts it learned from training data errors. RAG's faithfulness gate prevents this.

**AstroIntel example:** If AstroIntel needed a knowledge base of astrological texts (Vedic scriptures, planetary position tables, historical birth charts), RAG is the right choice. The corpus would be 100K+ documents, updated periodically, and users need source attribution.

---

## 5. When to Use Fine-tuning

Use fine-tuning when:

**1. Style and format consistency are critical:**
You need the model to always respond in a specific JSON schema, always use your company's tone, always follow a specific reasoning structure. Few-shot prompting handles this for simple formats, but for complex consistent behavior, fine-tuning is more reliable.

**2. Domain-specific reasoning patterns:**
The model needs to reason like an expert in your domain — medical diagnosis differential reasoning, legal argument structure, financial risk assessment frameworks. These reasoning patterns are hard to capture in a prompt but learnable from examples.

**3. Reducing prompt length (inference cost):**
With RAG, every prompt includes retrieved context (2000-5000 tokens). With a fine-tuned model that has internalized domain knowledge, prompt size shrinks dramatically. At 1 million calls/month, this matters financially.

**4. Instruction following improvement:**
The base model sometimes ignores instructions ("always respond in JSON," "never use the word 'certainly'"). Fine-tuning on examples of correct behavior forces compliance.

**Example:** A medical coding assistant needs to output ICD-10 codes in a specific format with confidence scores and rationale. The output format is complex and rigid. Fine-tuning on 5000 (note, code, correct format) examples produces more reliable output than few-shot prompting.

---

## 6. Code Skeleton — Fine-tuning Preparation Pipeline

```python
import json
import random
from dataclasses import dataclass
from openai import OpenAI

@dataclass
class FineTuneExample:
    system: str
    user: str
    assistant: str  # The exact output you want the model to produce

def prepare_fine_tune_dataset(
    raw_examples: list[dict],
    system_prompt: str,
    output_path: str,
    train_ratio: float = 0.9
) -> dict:
    """
    Convert raw examples to OpenAI fine-tuning JSONL format.
    Validates format, splits train/validation.
    """
    formatted = []
    
    for example in raw_examples:
        if not example.get("input") or not example.get("output"):
            continue
        
        # Validate output is the format you expect
        try:
            json.loads(example["output"])  # ensure it's valid JSON if you expect JSON
        except json.JSONDecodeError:
            print(f"Warning: example has non-JSON output: {example['output'][:100]}")
            continue
        
        formatted.append({
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": example["input"]},
                {"role": "assistant", "content": example["output"]}
            ]
        })
    
    # Shuffle and split
    random.shuffle(formatted)
    split_idx = int(len(formatted) * train_ratio)
    train_set = formatted[:split_idx]
    val_set = formatted[split_idx:]
    
    # Write JSONL files
    train_path = f"{output_path}_train.jsonl"
    val_path = f"{output_path}_val.jsonl"
    
    with open(train_path, "w") as f:
        for example in train_set:
            f.write(json.dumps(example) + "\n")
    
    with open(val_path, "w") as f:
        for example in val_set:
            f.write(json.dumps(example) + "\n")
    
    print(f"Train: {len(train_set)} examples → {train_path}")
    print(f"Val: {len(val_set)} examples → {val_path}")
    
    # Token count estimate
    avg_tokens = 300  # estimate
    total_tokens = len(train_set) * avg_tokens
    cost_estimate = (total_tokens / 1_000_000) * 8.0  # $8/1M tokens for gpt-4o-mini fine-tune
    print(f"Estimated training cost: ${cost_estimate:.2f}")
    
    return {"train_path": train_path, "val_path": val_path, "train_count": len(train_set)}


def submit_fine_tune_job(train_path: str, val_path: str, model: str = "gpt-4o-mini") -> str:
    client = OpenAI()
    
    # Upload files
    with open(train_path, "rb") as f:
        train_file = client.files.create(file=f, purpose="fine-tune")
    
    with open(val_path, "rb") as f:
        val_file = client.files.create(file=f, purpose="fine-tune")
    
    # Create fine-tune job
    job = client.fine_tuning.jobs.create(
        training_file=train_file.id,
        validation_file=val_file.id,
        model=model,
        hyperparameters={
            "n_epochs": 3,  # 3 epochs is usually sufficient; more risks overfitting
        }
    )
    
    print(f"Fine-tune job created: {job.id}")
    print(f"Status: {job.status}")
    print(f"Monitor: https://platform.openai.com/finetunes/{job.id}")
    
    return job.id


def poll_fine_tune_status(job_id: str) -> dict:
    client = OpenAI()
    job = client.fine_tuning.jobs.retrieve(job_id)
    
    return {
        "status": job.status,
        "fine_tuned_model": job.fine_tuned_model,  # None until complete
        "trained_tokens": job.trained_tokens,
        "error": job.error
    }


def evaluate_fine_tuned_model(
    fine_tuned_model: str,
    base_model: str,
    test_examples: list[dict],
    system_prompt: str
) -> dict:
    """Compare fine-tuned model vs base model on test examples."""
    client = OpenAI()
    
    fine_tune_correct = 0
    base_correct = 0
    
    for example in test_examples:
        # Fine-tuned model
        ft_response = client.chat.completions.create(
            model=fine_tuned_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": example["input"]}
            ],
            max_tokens=500
        )
        
        # Base model
        base_response = client.chat.completions.create(
            model=base_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": example["input"]}
            ],
            max_tokens=500
        )
        
        ft_output = ft_response.choices[0].message.content
        base_output = base_response.choices[0].message.content
        
        # Evaluate correctness (domain-specific — here we check JSON format compliance)
        try:
            json.loads(ft_output)
            fine_tune_correct += 1
        except:
            pass
        
        try:
            json.loads(base_output)
            base_correct += 1
        except:
            pass
    
    return {
        "fine_tuned_format_compliance": fine_tune_correct / len(test_examples),
        "base_model_format_compliance": base_correct / len(test_examples),
        "improvement": (fine_tune_correct - base_correct) / len(test_examples)
    }
```

---

## 7. Example (From Your Projects)

**AstroIntel — RAG is the right choice:**

AstroIntel agents use general astrological knowledge embedded in their system prompts. There is no external knowledge base to retrieve from. If the product scaled to require a Vedic astrology knowledge base (scriptures, planetary tables, historical readings), RAG would be the right choice: the corpus would be too large for prompts, would be updated periodically, and users would benefit from source attribution ("this insight is based on Brihat Parashara Hora Shastra, Chapter 4").

**When fine-tuning would add value for AstroIntel:**

The domain specialist agents always output a specific JSON schema. With the base model (gpt-4o-mini), the JSON compliance rate is ~95% — acceptable but not perfect. Fine-tuning 1000 examples of (birth_profile + question → correct JSON output) would push this to ~99%+, eliminating the JSON repair fallback logic.

In interview: "For AstroIntel's current state, RAG adds little value because the domain knowledge fits in the system prompt. Fine-tuning the output format for the domain agents would give me higher JSON compliance and remove the repair fallback. The trade-off is ~$50-100 to fine-tune and a re-tuning step whenever the output schema changes. At current scale, the repair fallback is sufficient."

---

## 8. Trade-offs

RAG:
+ No training cost, supports dynamic data, source attribution, any corpus size
- Adds retrieval latency, retrieval quality affects answer quality, larger prompts

Fine-tuning:
+ Faster inference (no retrieval), consistent behavior, reduced prompt length
- Training cost, requires high-quality labeled data, opaque, retraining on updates

RAG + Fine-tuning (combined):
+ Best of both: fine-tuned reasoning + retrieved factual grounding
- Most complex, highest cost, two failure modes instead of one

---

## 9. Interview Questions (Senior Level)

- When would you choose fine-tuning over RAG?
- What is the minimum dataset size for effective fine-tuning?
- How do you evaluate whether fine-tuning improved your model?
- Can you use RAG and fine-tuning together? When?
- What are the risks of fine-tuning on poor-quality data?

---

## 10. Answer Framework

Step 1 — Lead with the decision matrix:
"I use RAG when knowledge is external, dynamic, and needs attribution. I use fine-tuning when I need consistent behavioral patterns — output format, reasoning style, domain vocabulary — that are stable and expensive to prompt every time."

Step 2 — Acknowledge they're not mutually exclusive:
"In practice, the best systems often combine both. Fine-tune for behavior and format consistency, use RAG for factual grounding. A medical coding model might be fine-tuned for the ICD-10 coding workflow but still retrieves from a current drug database."

Step 3 — Cost framing:
"Fine-tuning gpt-4o-mini costs about $8 per 1M training tokens. A dataset of 1000 examples at 300 tokens each is $2.40 to train — negligible. The real cost is data preparation: getting 1000 high-quality labeled examples takes 40-80 hours of expert annotation."

Step 4 — From your project:
"For AstroIntel, I would fine-tune the domain agents' output format for higher JSON compliance. For the knowledge base component, RAG. The choice is driven by what the model needs to learn: behavior (fine-tune) vs facts (RAG)."

Step 5 — Failure mode awareness:
"The biggest risk with fine-tuning is catastrophic forgetting — the model becomes very good at the new task but loses general capability. Use LoRA or QLoRA for parameter-efficient fine-tuning that updates only a small adapter layer, preserving the base model's general reasoning."
