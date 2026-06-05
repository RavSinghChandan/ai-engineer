# Senior AI Engineer — Module 10
# Topic: LoRA / QLoRA — When Your Team Needs It

---

## 1. Intuition

Full fine-tuning updates all model weights — expensive in GPU memory and training time. LoRA (Low-Rank Adaptation) updates a tiny fraction of the parameters, achieving comparable results at 10-100x lower cost.

Senior engineers know when to reach for LoRA, what QLoRA adds (quantization), and how to integrate fine-tuned models into a production serving stack.

---

## 2. Core Concept

### Full Fine-tuning vs LoRA vs QLoRA

**Full fine-tuning:**
Updates all N billion parameters. For a 7B model, that's 7 billion gradients — requires 80-160GB VRAM for training. Takes days on multiple A100s. Very expensive.

**LoRA (Low-Rank Adaptation):**
Keeps original weights frozen. Inserts trainable low-rank matrices (adapters) into each transformer layer. Instead of updating a W matrix of shape d×d, LoRA learns two matrices A (d×r) and B (r×d) where r << d (rank r is typically 4-64).

At inference: W' = W + BA. The adapter adds a correction on top of frozen weights.

Training updates only A and B — for a 7B model with rank=8, this is ~1% of the original parameter count. Fits on a single A100 (40GB) or even a high-end consumer GPU.

**QLoRA (Quantized LoRA):**
Extends LoRA by quantizing the frozen base model weights to 4-bit precision (NF4 format), reducing VRAM further. A 7B model in 4-bit is ~4GB. LoRA adapters remain in 16-bit for training quality.

Result: fine-tune a 7B model on a single 16GB GPU (RTX 3090/4090).

### The Three Numbers That Matter

| Approach | VRAM Required | Training Time (7B model) | Cost (AWS) |
|---|---|---|---|
| Full fine-tuning (7B) | 80-160GB | 2-4 hours | $30-80 |
| LoRA (7B, rank=8) | 20-40GB | 1-2 hours | $10-20 |
| QLoRA (7B, rank=8) | 8-16GB | 1-2 hours | $3-8 |

---

## 3. When Your Team Needs LoRA

**The right use cases:**

1. **Domain-specific instruction following:** You have a general LLM (Llama 3, Mistral) and need it to reliably follow your domain's output formats. LoRA trains this in without full retraining.

2. **Cost-sensitive fine-tuning:** Your team can't afford $50-200 for an OpenAI fine-tune every sprint (or doesn't want vendor lock-in). LoRA on an open-source model runs on a single GPU.

3. **Data privacy:** Your training data cannot leave your infrastructure (medical records, legal documents, PII). LoRA on a self-hosted model keeps data on-premises. OpenAI fine-tuning sends your data to OpenAI.

4. **Iterative behavior adjustment:** You need to fine-tune weekly as new examples accumulate. LoRA's low cost makes this economically viable.

**When NOT to use LoRA:**

- When you need GPT-4o level general reasoning — LoRA on a 7B model won't match GPT-4o's reasoning depth, only its format compliance.
- When you have < 50 examples — prompt engineering is more effective.
- When you don't have a GPU in your infrastructure — use OpenAI fine-tuning instead.

---

## 4. Code Skeleton (Production-Grade — QLoRA with HuggingFace)

```python
from transformers import (
    AutoModelForCausalLM, 
    AutoTokenizer,
    TrainingArguments,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, TaskType, PeftModel
from trl import SFTTrainer
from datasets import Dataset
import torch
import json

def prepare_dataset(jsonl_path: str) -> Dataset:
    """Load JSONL of {instruction, output} examples."""
    examples = []
    with open(jsonl_path) as f:
        for line in f:
            ex = json.loads(line)
            # Format as instruction-following template (Alpaca format)
            text = f"""### Instruction:
{ex['instruction']}

### Response:
{ex['output']}"""
            examples.append({"text": text})
    
    return Dataset.from_list(examples)


def train_qlora(
    base_model: str,    # e.g., "meta-llama/Llama-3.1-8B-Instruct"
    dataset_path: str,
    output_dir: str,
    lora_rank: int = 8,
    lora_alpha: int = 32,
    num_epochs: int = 3
):
    # 4-bit quantization config (QLoRA)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16  # bfloat16 for A100/4090, float16 for older
    )
    
    # Load model in 4-bit
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=bnb_config,
        device_map="auto",  # auto-distribute across available GPUs
        trust_remote_code=True
    )
    model.config.use_cache = False  # disable for training
    
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    
    # LoRA config
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=lora_rank,           # rank — higher = more capacity, more parameters
        lora_alpha=lora_alpha,  # scaling factor — typically 2-4x rank
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # attention layers
        lora_dropout=0.05,
        bias="none"
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    # Output: trainable params: 4,194,304 || all params: 8,044,380,160 || trainable%: 0.052
    
    # Training config
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,  # effective batch size = 16
        warmup_ratio=0.03,
        learning_rate=2e-4,
        fp16=False,
        bf16=True,  # better on modern GPUs
        logging_steps=10,
        save_strategy="epoch",
        evaluation_strategy="epoch",
        load_best_model_at_end=True,
        report_to="none"  # disable wandb for local runs
    )
    
    dataset = prepare_dataset(dataset_path)
    
    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        args=training_args,
        tokenizer=tokenizer,
        dataset_text_field="text",
        max_seq_length=2048,
        packing=False
    )
    
    trainer.train()
    trainer.save_model(f"{output_dir}/final")
    print(f"Adapter saved to {output_dir}/final")
    
    return f"{output_dir}/final"


def load_fine_tuned_model(base_model: str, adapter_path: str):
    """Load base model + LoRA adapter for inference."""
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=bnb_config,
        device_map="auto"
    )
    
    # Load LoRA adapter on top of base model
    model = PeftModel.from_pretrained(model, adapter_path)
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    
    return model, tokenizer


def generate(model, tokenizer, instruction: str, max_new_tokens: int = 512) -> str:
    prompt = f"""### Instruction:
{instruction}

### Response:
"""
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    
    # Decode only the new tokens (not the prompt)
    new_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True)
```

---

## 5. Example (From Your Projects)

**AstroIntel hypothetical — LoRA for domain output format:**

If AstroIntel needed strict format compliance at scale (a high-volume SaaS) and had budget concerns with OpenAI fine-tuning fees:

1. Collect 500-1000 high-quality (birth_profile + question → JSON insight) examples from approved outputs
2. Fine-tune Llama 3.1 8B Instruct with QLoRA (fits on a single RTX 4090 or A10G cloud GPU)
3. Training cost: ~$5-10 on spot instance
4. The fine-tuned model handles domain agents — 5 calls per analysis
5. GPT-4o-mini keeps handling synthesis (where general reasoning matters more than format)

Trade-off acknowledged: Llama 3.1 8B won't match GPT-4o-mini's general reasoning. For the domain agents (structured JSON outputs following a template), it's sufficient. For synthesis (free-form reasoning across 5 agent outputs), keep the commercial model.

---

## 6. Trade-offs

LoRA vs OpenAI fine-tuning:
LoRA/QLoRA: run on your own GPU, full data privacy, iterate cheaply, no vendor lock-in.
OpenAI fine-tune: simple API, no GPU required, GPT-4o-mini base quality, but data leaves your infra and costs scale with dataset size.

Low rank (r=4) vs high rank (r=64):
Low rank: fewer trainable parameters, less overfitting, less capacity for complex adaptations.
High rank: more capacity, higher overfitting risk if dataset is small. Default r=8-16 for most tasks.

Few epochs (1-2) vs many (5+):
Few epochs: faster, less overfitting risk, good for large datasets.
Many epochs: needed for small datasets (<200 examples), high overfitting risk on large datasets.

---

## 7. Interview Questions (Senior Level)

- What is LoRA and why does it use fewer parameters than full fine-tuning?

  **Answer:** LoRA (Low-Rank Adaptation) inserts two small trainable matrices (A and B, rank r) into each transformer weight matrix instead of updating the full matrix. For a weight matrix of shape (d × d), LoRA adds A (d × r) and B (r × d) where r << d — typically r=8 or r=16. The update is W + AB, but only A and B are trained. A 7B model has ~7 billion parameters; LoRA with r=8 on attention layers trains ~4-16 million parameters — less than 0.2% of the total. This dramatically reduces VRAM requirements, training time, and storage (LoRA adapters are 10-100MB vs 14GB for the full model).

- What is the difference between LoRA and QLoRA?

  **Answer:** LoRA trains small adapter matrices on top of a full-precision (float16 or bfloat16) frozen base model — still requires loading the full model in VRAM. QLoRA adds 4-bit NormalFloat quantization to the frozen base model, reducing its VRAM footprint by ~4×. A 7B model goes from ~14GB (float16) to ~4GB (4-bit) VRAM. This makes fine-tuning a 7B model feasible on a single RTX 4090 (24GB VRAM) or even a T4 (16GB VRAM). The adapter weights stay in float16 for training precision; only the frozen base is quantized. Production inference: you either merge the LoRA adapter back into the base (requires dequantizing) or serve with the adapter applied at inference time.

- When would you use LoRA instead of OpenAI fine-tuning?

  **Answer:** Use LoRA when: data is sensitive and can't leave your infrastructure (legal, medical, financial PII), you need to iterate faster than OpenAI's fine-tune queue allows (days vs hours), you need to serve from your own infrastructure for data sovereignty, or you're working with open-source models that OpenAI fine-tuning doesn't support. Use OpenAI fine-tuning when: you don't have GPU infrastructure, your data privacy requirements allow sending training data to OpenAI, and GPT-4o-mini's base quality is sufficient — it's operationally simpler with no GPU management. In Bench Resource Optimizer, if employee CV data is confidential (common in enterprise HR systems), LoRA on a self-hosted Llama 3.1 8B would be the right choice for the plan generation step — the CV data never leaves the company's infrastructure during training, unlike OpenAI fine-tuning which requires uploading training data to OpenAI's API.

- How do you evaluate whether a LoRA-trained model is good enough for production?

  **Answer:** Three gates: (1) Task eval on hold-out set — run the fine-tuned model on 20% of examples held out from training, compare format compliance, task accuracy, and domain-specific quality metrics against the base model. (2) Regression eval — run a set of general capability tests (instructions following, basic reasoning) to verify the LoRA hasn't caused catastrophic forgetting on capabilities you need. (3) Human blind eval — present outputs from base model and LoRA-fine-tuned model to domain experts without labels; 60%+ preference for the LoRA output is a meaningful improvement signal. If the LoRA scores equal or worse on the hold-out set, the training data was insufficient or of poor quality.

- What is catastrophic forgetting and how does LoRA help prevent it?

  **Answer:** Catastrophic forgetting is when fine-tuning on a specific task causes the model to "forget" previously learned general capabilities — it becomes good at the fine-tuned task but worse at everything else. Full fine-tuning is most susceptible because it updates all weights. LoRA mitigates this significantly: the base model weights are completely frozen and never modified. The adapter matrices are small deltas added at inference time. The model retains all pre-trained knowledge in the unchanged base weights; the adapter only adds task-specific behavior. The rank r parameter also controls forgetting risk — lower rank = smaller adaptation = less chance of overriding base capabilities.

---

## 8. Answer Framework

Step 1 — Explain LoRA simply:
"LoRA inserts small trainable adapter matrices into each transformer layer. Instead of updating 7 billion weights, you update 0.1% of them — two small matrices per layer that learn the task-specific correction. The base model stays frozen."

Step 2 — QLoRA extension:
"QLoRA adds 4-bit quantization to the frozen base model. A 7B model goes from ~14GB to ~4GB in VRAM. This makes fine-tuning accessible on a single consumer GPU — an RTX 4090 can fine-tune a 7B model overnight."

Step 3 — When to use it:
"I'd reach for LoRA when: data is sensitive and can't go to OpenAI, we need to iterate frequently, or we have a GPU in infrastructure. OpenAI fine-tuning wins when we don't have GPU capacity and the data privacy requirement allows it."

Step 4 — Catastrophic forgetting:
"Full fine-tuning can overwrite the model's general capabilities. A model fine-tuned heavily on legal documents may forget how to write Python. LoRA avoids this because the base weights are frozen — the adapter adds domain behavior without overwriting general capability."

Step 5 — Production integration:
"LoRA adapters are ~50-200MB files. In production, you load the base model once and swap adapters at inference time. Multiple adapters for different domains can share one base model in memory — efficient for multi-tenant scenarios where each client has a custom adapter."

---

## ★ YOUR 5 PROJECTS — LoRA/QLoRA Awareness

| Project | Would LoRA help? | Why / Why not |
|---------|----------------|--------------|
| **AstroIntel 360°** | Possibly for output format | Domain agents sometimes generate non-standard JSON. LoRA fine-tune for JSON compliance could help. But: prompt engineering with temperature=0 already achieves this. Not worth the training cost yet. |
| **Bench Resource Optimizer** | No — RAG wins | Role knowledge changes too frequently for fine-tuning to track. RAG updates instantly; fine-tuning takes days. |
| **RunbookAI** | No — SQL wins | Commands must be verbatim. No fine-tuning approach achieves verbatim recall better than storing in SQL. |
| **Agentic Growth OS** | Possibly for copy style | Ad copy has a house style. LoRA could encode that style better than prompt engineering. But: not at current scale — prompt adaptation achieves enough improvement. |
| **Universal Agent** | No — YAML is the config | Persona is YAML-configured at runtime. Fine-tuning would bake the persona into the model — the opposite of what Universal Agent needs (runtime flexibility). |

**Interview line:** "I understand LoRA and QLoRA architecturally — freeze base weights, train two low-rank matrices per attention layer, 1-10% of parameters updated. But for my 5 projects, the knowledge is too dynamic and the iteration speed too important for fine-tuning to win. RAG updates the knowledge base without any training. Prompt engineering updates behavior without any training. The day I need a consistent style that prompt engineering can't achieve at acceptable quality is the day I'd reach for LoRA."
