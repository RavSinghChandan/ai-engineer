# P1 — Plain LLM Application
### Golden Memory: `Request → Prompt → LLM → Parse → Response`

> **2-minute promise:** Read this page top to bottom. Click any link. You will understand the full architecture — and be able to explain it in any interview.

---

## 🗺️ What is this pattern?

You have a user. They send a message. You send it to an LLM. You get an answer back. That's it.

No memory. No tools. No vector search. Just: **User → LLM → Answer**.

**When to use it:**
- Chatbot / Q&A
- Summarizer
- Classifier / Extractor
- Code explainer
- Email generator

---

## 🧭 Navigation — Click to explore

| What you want | Go here |
|---|---|
| 🎨 **See the INTERACTIVE flow** (colorful, clickable, animated) | [→ **flow.html**](./flow.html) ← open in browser |
| 📄 **Mermaid flow** (VS Code / GitHub) | [→ flow.md](./flow.md) |
| 💻 **See the production code** (copy-paste ready) | [→ code.py](./code.py) |
| 🧠 **Understand it in 2 minutes** (mental model, story) | [→ mental-model.md](./mental-model.md) |
| 🎯 **Interview Q&A + what to say** | [→ cheatsheet.md](./cheatsheet.md) |
| ➕ **Add something new to this pattern** | [→ extensions.md](./extensions.md) |

---

## ⚡ 30-second summary

```
User types a message
       ↓
FastAPI validates it (Pydantic)
       ↓
Auth check (JWT)
       ↓
You build a prompt  ←── THIS IS YOUR SKILL
       ↓
LLM API call (OpenAI / Anthropic / Gemini)
       ↓
Parse the response
       ↓
Return clean JSON
```

---

## 🏗️ Real projects using this pattern

| Project | Where it's used |
|---|---|
| AstroIntel 360° | Domain agent nodes (each agent = plain LLM call with a crafted prompt) |
| Bench Resource Optimizer | Recommendation engine node |
| Aura with Rav | Initial intent classification step |

---

## 🔮 Future additions (track here)

When something new comes to this pattern, add it to [extensions.md](./extensions.md).

Examples of what might come:
- New LLM provider (add to code.py Provider section)
- New prompt technique (add to flow.md Prompt Builder section)
- Structured output via a new SDK (add to extensions.md)
