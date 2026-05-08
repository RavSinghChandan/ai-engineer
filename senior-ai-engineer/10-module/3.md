# Senior AI Engineer — Module 10
# Topic: RLHF — How It Shaped GPT-4 (Conceptual Depth for Senior Interviews)

---

## 1. Intuition

You will not implement RLHF. But you will be asked about it in senior interviews to test your depth of understanding of how production LLMs are built.

Senior answers explain the three-phase pipeline, know what the reward model is, and can articulate why RLHF matters for alignment. They also know the modern alternative — DPO — and when practitioners choose it over RLHF.

---

## 2. Core Concept

### The RLHF Pipeline (Three Phases)

**Phase 1 — Supervised Fine-tuning (SFT):**
Start with a pretrained language model. Fine-tune it on a curated dataset of high-quality (prompt → ideal response) pairs, written or approved by human annotators.

Result: a model that follows instructions reasonably well but not consistently optimized for human preferences.

**Phase 2 — Reward Model Training:**
Collect preference data: for each prompt, generate multiple responses with the SFT model. Human annotators rank the responses (which is better? which is worse?).

Train a separate reward model (RM) on these comparisons. The RM outputs a scalar score for any (prompt, response) pair: higher score = more preferred by humans.

The RM learns the human preference function — what makes a response helpful, harmless, and honest.

**Phase 3 — RL Optimization (PPO):**
Use Proximal Policy Optimization (PPO) to optimize the SFT model to maximize the reward model's score.

The SFT model is the policy. For each prompt, generate a response, score it with the RM, and update the policy to produce higher-scoring responses.

A KL divergence penalty prevents the policy from drifting too far from the SFT model (prevents reward hacking — generating nonsense that fools the RM for a high score).

```
Pretrained LLM
    ↓ Phase 1: SFT on (prompt, ideal_response) pairs
SFT Model
    ↓ Phase 2: Generate responses, human ranks, train Reward Model
Reward Model
    ↓ Phase 3: PPO — optimize SFT model to maximize RM score
RLHF-trained Model (GPT-4, Claude, Gemini)
```

---

## 3. Why RLHF Matters

**Without RLHF:** A pretrained LLM is trained to predict the next token — not to be helpful. It will continue harmful text, give wrong answers confidently, and follow instructions inconsistently. SFT alone improves this but is brittle.

**With RLHF:** The model learns the human preference function. It learns to be helpful, decline harmful requests, give honest uncertainty signals, and follow complex instructions. GPT-4, Claude, and Gemini are all RLHF-trained.

**The Alignment Problem:** RLHF is the primary current method for aligning LLM behavior with human values. It's imperfect (reward models can be fooled, jailbreaks exist) but dramatically better than SFT alone.

---

## 4. DPO — The Simpler Modern Alternative

**Direct Preference Optimization (DPO)** achieves similar results to RLHF without the separate reward model or PPO training loop.

DPO trains directly on preference pairs (prompt, preferred_response, rejected_response) using a contrastive loss. The policy learns to increase the probability of preferred responses and decrease the probability of rejected responses.

**Why practitioners prefer DPO:**
- Simpler: no separate reward model to train, no PPO instability
- More stable training: PPO is notoriously hard to tune
- Comparable results to RLHF on most benchmarks
- Works well with LoRA — apply DPO as a fine-tuning step on top of SFT

### DPO Training Dataset Format

```python
# DPO training data format
{
    "prompt": "Explain quantum entanglement simply.",
    "chosen": "Quantum entanglement means two particles are correlated — if you measure one, you instantly know something about the other, no matter the distance...",
    "rejected": "Quantum entanglement is a complex quantum mechanical phenomenon that involves the superposition of quantum states and non-local correlations..."
}
```

---

## 5. Code Skeleton (DPO Fine-tuning with TRL)

```python
from datasets import Dataset
from trl import DPOTrainer, DPOConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
import torch
import json

def prepare_dpo_dataset(preference_data_path: str) -> Dataset:
    """
    Load preference pairs for DPO training.
    Format: {prompt, chosen, rejected}
    """
    examples = []
    with open(preference_data_path) as f:
        for line in f:
            ex = json.loads(line)
            examples.append({
                "prompt": ex["prompt"],
                "chosen": ex["chosen"],
                "rejected": ex["rejected"]
            })
    return Dataset.from_list(examples)


def train_with_dpo(
    base_model_path: str,
    preference_data_path: str,
    output_dir: str,
    lora_rank: int = 8,
    num_epochs: int = 1  # DPO often needs only 1 epoch
):
    """Apply DPO on top of SFT model to align with human preferences."""
    
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4"
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        base_model_path,
        quantization_config=bnb_config,
        device_map="auto"
    )
    
    tokenizer = AutoTokenizer.from_pretrained(base_model_path)
    tokenizer.pad_token = tokenizer.eos_token
    
    # LoRA on top of quantized model
    lora_config = LoraConfig(
        r=lora_rank,
        lora_alpha=lora_rank * 4,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )
    
    model = get_peft_model(model, lora_config)
    
    dataset = prepare_dpo_dataset(preference_data_path)
    train_val = dataset.train_test_split(test_size=0.1)
    
    dpo_config = DPOConfig(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,
        learning_rate=5e-5,  # lower lr than SFT
        beta=0.1,  # KL divergence penalty (same role as in PPO — prevents reward hacking)
        max_prompt_length=512,
        max_length=1024,
        logging_steps=10,
        save_strategy="epoch",
        bf16=True
    )
    
    trainer = DPOTrainer(
        model=model,
        ref_model=None,  # with LoRA, reference model is not needed (PEFT handles KL via frozen base)
        args=dpo_config,
        train_dataset=train_val["train"],
        eval_dataset=train_val["test"],
        tokenizer=tokenizer
    )
    
    trainer.train()
    trainer.save_model(output_dir)
    print(f"DPO adapter saved to {output_dir}")
```

---

## 6. Example (From Your Projects)

**AstroIntel — RLHF Lite via Feedback Loop:**

AstroIntel collects admin feedback on agent outputs: approve, edit, or reject. This is human preference data. The pipeline:

1. Admin approves response → (prompt, response) added to positive examples
2. Admin edits response → (prompt, edited_response) is the chosen, (prompt, original_response) is the rejected
3. Admin rejects response → (prompt, original) is rejected, no chosen pair for this example

Over time, this accumulates DPO training data. After 200-500 preference pairs, run a DPO fine-tune on the domain specialist agents. This is "RLHF Lite" — the same three-phase concept applied at a small scale using admin feedback instead of a professional annotation team.

In interview: "AstroIntel's admin feedback mechanism is a lightweight RLHF pipeline. Approved and edited outputs become preference pairs for DPO training. After sufficient feedback accumulates, we fine-tune the domain agents. This is the same principle as InstructGPT's RLHF — human preference data drives model alignment — scaled down to a team-sized feedback loop."

---

## 7. Trade-offs

RLHF vs DPO:
RLHF (PPO): stronger theoretical grounding, can optimize complex reward functions, but PPO is unstable and requires careful hyperparameter tuning.
DPO: simpler, stable training, comparable empirical results on most tasks. Preferred by practitioners for iterative fine-tuning.

RLHF vs SFT alone:
RLHF: produces models that follow instructions more reliably, decline harmful requests, and produce human-preferred outputs.
SFT alone: simpler pipeline but produces models that are brittle on edge cases and don't consistently align with human values.

Human annotation vs AI-generated preferences:
Human annotation: gold standard, expensive ($15-50 per example for professional annotators).
AI-generated (LLM-as-judge): cheaper, scalable, but inherits the judge model's biases.

---

## 8. Interview Questions (Senior Level)

- Explain the three phases of RLHF.
- What is the reward model and how is it trained?
- What is DPO and why do practitioners prefer it to RLHF for fine-tuning?
- What is reward hacking and how does the KL penalty prevent it?
- How would you collect preference data for your project?

---

## 9. Answer Framework

Step 1 — Three phases:
"RLHF has three phases: SFT (fine-tune on ideal examples), reward model training (train a model to score responses based on human preferences), and PPO optimization (use RL to maximize the reward model score while staying close to the SFT model via KL divergence penalty)."

Step 2 — Why it matters:
"Without RLHF, an LLM is optimized to predict text, not to be helpful. RLHF teaches the model what humans consider a good response — this is how GPT-4, Claude, and Gemini are aligned. It's the gap between a raw pretrained model and a useful assistant."

Step 3 — DPO as the modern approach:
"DPO is the simpler alternative. It skips the reward model and PPO entirely. You train directly on (prompt, chosen, rejected) triples with a contrastive loss. More stable, simpler pipeline, comparable results. For a team-scale project, DPO with LoRA is the practical choice."

Step 4 — From your project:
"AstroIntel's admin approval/edit/reject feedback loop generates DPO training data. After accumulating ~500 preference pairs, I would run a DPO fine-tune on the domain agents. This is the production-scale version of what OpenAI's team does with professional annotators."

Step 5 — Limitation awareness:
"RLHF and DPO are imperfect. The model learns to satisfy the reward model or match the preference distribution — not necessarily to be correct. Reward hacking (generating nonsense that scores well) and sycophancy (telling users what they want to hear) are known failure modes. Human evaluation remains the ground truth."
