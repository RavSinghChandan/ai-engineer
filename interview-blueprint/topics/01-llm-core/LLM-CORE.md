# LLM Core — Complete Interview Guide

> The foundation of everything. You cannot skip this topic for ANY AI interview.
> Every question follows the Chandan Format: WHAT → WHY → HOW → WHERE → WHEN → WHO → KEY POINT → DESI HOOK → FOLLOW-UPS

---

## CONCEPT 1: What is an LLM?

### WHAT
An LLM (Large Language Model) is a neural network trained on massive amounts of text to predict the next word given the words before it.

```
Input:  "The sky is"
Output: "blue" (predicted next word)

Do this millions of times → you get: "The sky is blue and the clouds are white..."
```

That's it. Billions of parameters. One task: predict next word. Everything else emerges from scale.

### WHY
We need LLMs because:
- Human language is complex, ambiguous, and context-dependent
- Traditional rule-based systems couldn't handle this complexity
- LLMs learn language patterns from data → they generalize to new sentences

### HOW — The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                 HOW AN LLM IS BUILT                        │
│                                                             │
│  Step 1: PRE-TRAINING                                      │
│  Feed internet text → model learns to predict next token   │
│  Data: Common Crawl, Wikipedia, books, code               │
│  Cost: Millions of dollars, weeks of GPU time              │
│                                                             │
│  Step 2: SUPERVISED FINE-TUNING (SFT)                     │
│  Feed question-answer pairs → model learns to be helpful   │
│  Human-written ideal answers as training data              │
│                                                             │
│  Step 3: RLHF                                              │
│  Reinforcement Learning from Human Feedback                │
│  Humans rank outputs → model learns to rank like humans    │
│  Result: helpful, harmless, honest                         │
└─────────────────────────────────────────────────────────────┘
```

### 📌 KEY POINT
> An LLM doesn't "know" anything. It predicts text.
> When it seems to "know" the capital of France — it's predicting the next word based on having seen "capital of France is" followed by "Paris" millions of times in training.

### 🇮🇳 DESI HOOK
> Think of an LLM like a **student who read every book in the world** but never went to school.
> They can predict what comes next in any sentence because they've seen it so many times.
> But ask them about your family's private WhatsApp chat? They have no idea — they never saw it.
> That's why we need RAG. To show them YOUR private text.

---

## CONCEPT 2: Transformers and Attention

### WHAT
A Transformer is the neural network architecture that powers all modern LLMs.
The key innovation: **Self-Attention** — the model can look at ALL words in the input at once and decide which words matter most for understanding each word.

### WHY Attention Changed Everything

Before Transformers (RNNs):
```
"The cat sat on the mat and it was comfortable."
When processing "it" → model barely remembers "cat" from 9 words ago
Problem: Long-range dependencies were lost
```

With Transformers (Attention):
```
"The cat sat on the mat and it was comfortable."
When processing "it" → model attends to "cat" with high weight
"it" → refers to "cat" → UNDERSTOOD
```

### HOW Attention Works (Simplified)

```
For every word, attention asks 3 questions:
  Q (Query):  "What am I looking for?"
  K (Key):    "What does each other word represent?"
  V (Value):  "What information should I pull from each word?"

Attention Score = softmax(Q × K^T / √dimension) × V

High score = "these words are very related to each other"
Low score  = "these words are not related"
```

**The number you need to remember:**
GPT-4 has ~96 attention heads across 96 layers. Each head learns DIFFERENT types of relationships (grammar, facts, coreferences, etc.)

### 📌 KEY POINT
> Attention = "which words should I pay attention to when processing this word?"
> Multi-head attention = multiple perspectives at once, like a panel of reviewers each focusing on different aspects.

### 🇮🇳 DESI HOOK
> Think of attention like a **group study session**.
> Every student (word) looks around at other students and decides: who has information I need?
> "It" looks at "cat" → "you're the one I'm referring to" → high attention weight.
> Everyone pays attention to everyone else. No information gets lost.

---

## CONCEPT 3: Tokens and Context Window

### WHAT
A **token** is the unit an LLM processes. Roughly: 1 token ≈ 0.75 words (in English).
The **context window** is the maximum number of tokens the LLM can see at once.

```
"Hello, how are you?" = 5 words ≈ 6–7 tokens

GPT-4:          128,000 token context (≈ 96,000 words ≈ 200 pages)
Claude 3:       200,000 token context (≈ 150,000 words ≈ 300 pages)
Gemini 1.5:   1,000,000 token context (≈ 750,000 words ≈ 1500 pages)
```

### WHY This Matters for You as an Engineer

```
Problem 1: COST
→ You pay per token (input + output)
→ 1M input tokens with GPT-4 = $10
→ Engineers must optimize: shorter prompts, chunking, caching

Problem 2: LOST IN THE MIDDLE
→ Research shows LLMs are best at START and END of context
→ Important info in the MIDDLE gets ignored
→ Put key info first or last in your prompt

Problem 3: RAG NECESSITY
→ Most production knowledge bases > context window
→ You can't stuff 1M documents into 128K tokens
→ Retrieval solves this
```

### 📌 KEY POINT
> Context window ≠ memory. When the context fills up, the oldest tokens are dropped.
> This is why agents need special memory management — they can't just keep appending.

---

## CONCEPT 4: Temperature, Top-P, and Sampling

### WHAT
These parameters control HOW the LLM picks the next token.

### HOW

```
After the model produces probabilities for every possible next token:

TEMPERATURE:
  temperature=0.0  → Always pick the most likely token (deterministic, safe)
  temperature=0.7  → Slightly random (balanced, good for most tasks)
  temperature=1.5  → Very random (creative, but can go off-track)

  Think: temperature = how "drunk" is the model?
  0.0 = perfectly sober (same answer every time)
  2.0 = very drunk (unpredictable, creative, sometimes wrong)

TOP-P (nucleus sampling):
  top_p=0.9 → Only consider tokens that together make up 90% of probability mass
  Filters out the long tail of unlikely tokens
  Safer than high temperature for keeping quality

TOP-K:
  top_k=50 → Only consider the 50 most likely tokens at each step
```

### When to Use What

| Task | Temperature | Top-P |
|------|------------|-------|
| Code generation | 0.0–0.2 | 0.95 |
| Q&A with facts | 0.0–0.3 | 0.95 |
| Creative writing | 0.7–1.0 | 0.95 |
| Brainstorming | 0.8–1.2 | 0.95 |

### 📌 KEY POINT
> For production AI systems that need ACCURACY: keep temperature low (0.0–0.3).
> For creative tasks: go higher.
> For interviews, say: "I set temperature=0 for factual Q&A to get consistent answers."

---

## CONCEPT 5: Fine-Tuning — When and How

### WHAT
Fine-tuning is the process of taking a pre-trained LLM and training it further on YOUR specific data to specialize its behavior.

### WHY
Pre-trained LLMs are generalists. Fine-tuning makes them specialists.

```
Base GPT (generalist):    Knows everything, mediocre at your task
Fine-tuned model:         Knows YOUR task deeply, writes in YOUR style
```

### HOW — The Modern Methods

```
┌─────────────────────────────────────────────────────────────┐
│              FINE-TUNING METHODS                            │
│                                                             │
│  FULL FINE-TUNE:                                           │
│  → Update ALL model weights                                 │
│  → Most powerful, most expensive                            │
│  → Needs: 100K+ examples, 8x A100 GPUs, days of compute   │
│  → Use when: you have budget and massive task-specific data │
│                                                             │
│  LoRA (Low-Rank Adaptation):                               │
│  → Freeze original weights, train small adapter matrices    │
│  → Only 0.1–1% of parameters trained                       │
│  → 90% cheaper than full fine-tune                         │
│  → Use when: limited data (1K–10K examples), limited GPU   │
│                                                             │
│  QLoRA:                                                    │
│  → LoRA + quantized base model (4-bit weights)             │
│  → Fine-tune 70B model on a SINGLE consumer GPU            │
│  → Use when: resource-constrained environments             │
│                                                             │
│  SFT (Supervised Fine-Tuning):                            │
│  → Teach the model from Q+A pairs                          │
│  → Most common starting point for instruction-following    │
└─────────────────────────────────────────────────────────────┘
```

### The Decision Tree: Fine-tune vs RAG vs Prompting

```
Do you need new KNOWLEDGE (private docs, recent events)?
  YES → Use RAG
  NO  → Continue...

Do you need new BEHAVIOR (style, format, specialized tone)?
  YES → Fine-tune
  NO  → Continue...

Can you solve it with a well-crafted prompt + examples?
  YES → Few-shot prompting (cheapest, fastest)
  NO  → Consider fine-tuning
```

### 📌 KEY POINT
> **Fine-tuning teaches HOW to respond. RAG teaches WHAT to say.**
> Combine them: fine-tune for style + RAG for knowledge = best of both worlds.

### 🇮🇳 DESI HOOK
> Fine-tuning is like **coaching a generalist doctor to become a cardiologist**.
> They already know medicine (pre-training).
> You give them specialized cardiology cases to study (fine-tuning data).
> Now they're an expert at heart conditions — but they still can't know YOUR patient's latest lab report.
> For that, you show them the fresh lab report (RAG).

---

## CONCEPT 6: Prompt Engineering

### WHAT
Prompt Engineering is the art of crafting inputs to get the best outputs from an LLM.

### The Main Techniques

```
1. ZERO-SHOT PROMPTING
   → Just ask the question directly
   → "Summarize this document in 3 bullet points."

2. FEW-SHOT PROMPTING
   → Give examples first, then ask
   → "Here are 2 examples of good summaries: [ex1] [ex2]. Now summarize this: [doc]"
   → WHY: LLMs are great pattern matchers; show the pattern you want

3. CHAIN-OF-THOUGHT (CoT)
   → Ask the model to think step by step
   → "Solve this math problem step by step: 24 × 37 = ?"
   → WHY: Forcing explicit reasoning improves accuracy for complex tasks
   → Tip: Just adding "Let's think step by step" improves accuracy by 30–40%

4. SYSTEM PROMPTS
   → Set the LLM's persona and constraints up front
   → "You are a helpful HR assistant. Answer ONLY questions about company policy.
       Do NOT answer personal or off-topic questions."

5. STRUCTURED OUTPUT PROMPTING
   → Force JSON/structured output
   → "Respond ONLY in this JSON format: {\"name\": ..., \"score\": ...}"
```

### 📌 KEY POINT
> The single biggest improvement you can make to any LLM system: better prompts.
> Before adding RAG, fine-tuning, or any complexity — try prompt engineering first.
> It's free and often enough.

### 🇮🇳 DESI HOOK
> Prompt engineering is like giving **clear instructions to a new joiner** at work.
> A vague task → vague output. "Write something." → garbage.
> A specific task → specific output. "Write a 3-bullet summary of this refund policy in simple English for a customer who is angry." → gold.
> The LLM is smart but clueless. YOU must be specific.

---

## CONCEPT 7: RLHF — How Models Learn to Be Helpful

### WHAT
RLHF = Reinforcement Learning from Human Feedback.
It is the training technique used to make models like GPT-4 and Claude helpful, harmless, and honest.

### HOW

```
Step 1: SFT (Supervised Fine-Tuning)
        Human writers create ideal responses → model learns from them

Step 2: Reward Model Training
        Humans rank multiple model outputs (A is better than B)
        A separate model learns to PREDICT human preference scores

Step 3: PPO (Proximal Policy Optimization)
        The LLM is trained using RL to maximize the reward model's score
        It learns: "produce outputs that humans would rank higher"

Result: A model that is aligned with human preferences
```

### 📌 KEY POINT
> RLHF is WHY modern LLMs feel helpful and conversational vs raw GPT-2 (which just continued text).
> Without RLHF, ChatGPT would just complete your sentence, not answer your question.

---

*Topic: LLM Core | Updated: 2026-06-29*
