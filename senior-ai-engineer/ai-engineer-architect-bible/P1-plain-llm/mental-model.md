# P1 — Mental Model
### Understand this in 2 minutes. Never forget it.

← [Back to README](./README.md)

---

## The Story: You're a Customer Service Manager

Imagine you manage a team of 1 expert customer service rep (the LLM).

Here's your daily workflow:

```
A customer walks in (User Request)
       ↓
Security checks them at the door (Auth + Validation)
       ↓
You write a brief for your rep:
   "Your job is [X]. Rules are [Y]. Here's what the customer said: [Z]"
       ↓     (THIS BRIEF = THE PROMPT. This is your job.)
Your rep reads the brief and answers
       ↓
You clean up the answer and hand it to the customer
```

**That's Plain LLM. You are the manager. The prompt is the brief. The LLM is the expert rep.**

---

## The One Thing That Separates Good from Great

Everyone can hand a customer's message to the LLM. That's 3 lines of code.

**The difference is the brief (the prompt):**

| Weak brief | Strong brief |
|---|---|
| "Answer this question" | "You are a senior DevOps engineer. Your job is to diagnose Kubernetes issues. Always give the root cause FIRST, then steps to fix. Never suggest restarting unless all else fails." |
| LLM can answer anything | LLM answers like YOUR expert |
| Generic output | Branded, reliable output |

**Your value as an AI engineer = the quality of your prompts.**

---

## Mental Model: 3 Boxes

When explaining P1 to anyone, draw 3 boxes:

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  INPUT   │ →  │  YOUR CODE   │ →  │  OUTPUT  │
│          │    │              │    │          │
│ User msg │    │  Validate    │    │ Answer   │
│          │    │  Auth        │    │ Tokens   │
│          │    │  Build prompt│    │ Model    │
│          │    │  Call LLM    │    │          │
│          │    │  Parse       │    │          │
└──────────┘    └──────────────┘    └──────────┘
```

The middle box is where you live. The LLM is a black box — you can't change it.
**Everything you control is in the middle box.**

---

## The 3 Dials You Turn

Every time you use a Plain LLM, you turn 3 dials:

| Dial | What it controls | Typical value |
|---|---|---|
| `temperature` | How creative vs predictable | `0.2` for facts, `0.8` for creative |
| `max_tokens` | How long the answer can be | `500` for chat, `2000` for summaries |
| `system_prompt` | What kind of expert the LLM becomes | "You are a [role]..." |

---

## Why This Pattern Fails (and how to fix it)

| Failure mode | Why it happens | Fix |
|---|---|---|
| LLM gives off-topic answers | System prompt too vague | Add rules: "Only answer questions about X" |
| Responses too long / too short | Wrong `max_tokens` | Tune per use case |
| LLM hallucinates facts | No grounding, high temperature | Add `temperature=0.2`, add facts to prompt |
| Cost explodes | No token limit, users sending essays | Add `max_length=10_000` to request model |
| Slow responses | Sync client, no timeout | Use `AsyncOpenAI(timeout=60)` |

---

## In One Sentence (interview answer)

> "Plain LLM is Request → Prompt → LLM → Parse → Response. The engineering value is in the prompt: you craft the system prompt to make the LLM behave like your domain expert, validate input/output with Pydantic, and use async client with retries for production reliability."

---

← [Back to README](./README.md) | [→ Flow](./flow.md) | [→ Cheatsheet](./cheatsheet.md)
