# Generative AI Engineer — Interview Blueprint

> **Target:** Companies building GenAI products — image gen, text gen, multimodal, creative AI
> **Your job:** Show you understand the MODELS (not just the APIs) + can build production GenAI systems.

---

## What GenAI Engineer Means

```
GenAI Engineer = AI Engineer who understands HOW generative models work
                 deeply enough to fine-tune, evaluate, and improve them

Not just: "I called the OpenAI API"
But:      "I understood why GPT-4 hallucinated on this task,
            chose to fine-tune a smaller model with LoRA,
            and measured improvement with RAGAS + human eval"
```

---

## The GenAI Engineer Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                  GENERATIVE AI STACK                    │
│                                                         │
│  FOUNDATION MODELS   │  GPT-4, Claude, Gemini, Llama   │
│  FINE-TUNING         │  LoRA, QLoRA, SFT, RLHF         │
│  RAG                 │  Retrieval-Augmented Generation  │
│  EVALUATION          │  RAGAS, LLM-judge, BLEU, ROUGE  │
│  SERVING             │  vLLM, TGI, Ollama, APIs         │
│  SAFETY              │  Guardrails, red-teaming, filters│
│  MULTIMODAL          │  Vision + Text (GPT-4V, LLaVA)  │
└─────────────────────────────────────────────────────────┘
```

---

## Topics You MUST Know

### 🔴 MUST KNOW — GenAI-specific depth

| # | Topic | Depth | Study File |
|---|-------|-------|------------|
| 1 | Transformer architecture | Attention, positional encoding, layers | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 2 | How LLMs generate text | Autoregression, sampling, temperature, top-p | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 3 | Fine-tuning methods | LoRA vs QLoRA vs full fine-tune vs SFT | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 4 | RAG — full advanced stack | HyDE, reranking, hybrid search | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 5 | Prompt Engineering (expert level) | System prompts, CoT, few-shot, meta-prompting | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 6 | Evaluation at scale | RAGAS, LLM-as-judge, A/B, human eval | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 7 | AI Safety + Guardrails | Injection, jailbreaks, output filtering | [System Design](../../topics/04-system-design/SYSTEM-DESIGN.md) |

### 🟡 SHOULD KNOW

| # | Topic | Depth | Study File |
|---|-------|-------|------------|
| 8 | RLHF and RLAIF | How models are aligned | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 9 | Model serving | vLLM, batching, quantization for inference | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 10 | Multimodal LLMs | GPT-4V, document understanding | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 11 | Diffusion models basics | Stable Diffusion mental model | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |

---

## The Key Trade-off: Fine-tune vs RAG vs Prompt

This is the most asked question for GenAI engineers. Know it cold:

```
┌──────────────┬───────────────┬──────────────┬──────────────┐
│              │   FINE-TUNE   │     RAG      │   PROMPTING  │
├──────────────┼───────────────┼──────────────┼──────────────┤
│ Best for     │ Style/format  │ Knowledge    │ Quick tasks  │
│              │ Private vocab │ that changes │ No data need │
│              │ Domain adapt  │ Real-time    │              │
├──────────────┼───────────────┼──────────────┼──────────────┤
│ Cost         │ High (train)  │ Medium       │ Low          │
├──────────────┼───────────────┼──────────────┼──────────────┤
│ Updates      │ Requires      │ Just update  │ Just change  │
│              │ retraining    │ the index    │ the prompt   │
├──────────────┼───────────────┼──────────────┼──────────────┤
│ Hallucination│ Can embed     │ Grounded in  │ LLM's own    │
│ risk         │ wrong facts   │ retrieved doc│ knowledge    │
└──────────────┴───────────────┴──────────────┴──────────────┘

RULE OF THUMB:
→ Private docs that change?        Use RAG
→ Custom writing style/format?     Fine-tune
→ General reasoning task?          Prompting + few-shot
→ Domain-specific task, static?    Fine-tune OR RAG
```

---

## GenAI System Design Questions

1. **"Design a document Q&A system for a 1M-document legal firm"**
   → Use RAG + reranking + PII guardrails + audit logging

2. **"Build a code generation assistant"**
   → Fine-tuned model on code + RAG on codebase + eval with unit test pass rate

3. **"Build a customer support bot that never hallucinates"**
   → RAG on FAQ + faithfulness scoring + human escalation for low-confidence

4. **"How would you handle 10 different LLMs in production?"**
   → LLM router (task-based), fallback chains, cost vs quality matrix

---

*Role: Generative AI Engineer | Level: 2–6 years | Updated: 2026-06-29*
