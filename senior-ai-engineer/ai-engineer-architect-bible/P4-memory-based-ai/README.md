# P4 — Memory-Based AI
### Golden Memory: `Retrieve → Context Build → LLM → Store`

> **2-minute promise:** Read this page top to bottom. Click any link. You will understand the full memory architecture — and be able to explain it in any interview.

---

## 🗺️ What is this pattern?

Your AI remembers the user. Not just the current session — **across sessions**.

Two memory layers:
- **Short-term (Redis):** Last N messages of the current session. Like a scratchpad. TTL = 1 hour.
- **Long-term (FAISS/Vector):** Persistent facts about the user (preferences, goals, constraints). Survives restarts.

**When to use it:**
- Personalized assistant
- Long-running chat bot
- User preference bot
- Customer support that remembers past issues
- Any AI that should improve with every interaction

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
User sends a message
       ↓
Fetch short-term memory (Redis — last 10 msgs)      ← RETRIEVE
Fetch long-term memory (FAISS — top 3 user facts)   ← RETRIEVE
       ↓
Build context:
  system prompt + long-term facts
  + short-term history
  + current message                                  ← CONTEXT BUILD
       ↓
LLM call with full memory context                   ← LLM
       ↓
Save new turn to Redis (short-term)
Ask LLM: "Anything worth remembering?"              ← STORE
If YES → embed + store in FAISS (long-term)
       ↓
Return answer
```

---

## 🏗️ Real projects using this pattern

| Project | Where it's used |
|---|---|
| AstroIntel 360° | Episodic corrections table — admin edits are retrieved as persona context on next run |
| Bench Resource Optimizer | Session context for multi-turn resource planning |
| Any personalized AI | Any time the AI should know who it's talking to |

---

## 🔮 Future additions (track here)

When something new comes to this pattern, add it to [extensions.md](./extensions.md).

Examples of what might come:
- Memory summarization (compress old memories to save tokens)
- Memory deletion (right to be forgotten)
- Multi-user memory isolation
- SQLite/PostgreSQL persistent long-term store (replace in-memory dict)
