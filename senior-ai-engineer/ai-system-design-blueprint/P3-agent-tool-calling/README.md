# P3 — Agent / Tool Calling
### Golden Memory: `Think → Tool → Result → Think → Answer`

> **2-minute promise:** Read this page top to bottom. Click any link. You will understand the full ReAct agent architecture — and be able to explain it in any interview.

---

## 🗺️ What is this pattern?

You give the LLM **tools** it can call (functions, APIs, SQL queries). The LLM decides which tools to use, calls them, sees the results, and reasons again — looping until it has enough information to answer.

This is the **ReAct pattern**: Reason → Act → Observe → Reason → Act → ...

**When to use it:**
- Booking assistant (call calendar API)
- SQL agent (run database queries)
- Web search agent (call search API)
- Multi-step automation (email + calendar + CRM)
- Any task that requires external data or actions

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
User sends a request
       ↓
Load TOOL_SCHEMAS (what LLM can see)
       ↓
LLM reasons: "I need to call get_weather"   ← THINK
       ↓
Extract tool name + args from response
       ↓
Execute tool function (async, parallel)      ← ACT
       ↓
Append result as role="tool" message
       ↓
LLM reasons again with the result           ← THINK
       ↓
Need more tools? → loop back
       ↓
Final answer (no tool_calls in response)
```

---

## 🏗️ Real projects using this pattern

| Project | Where it's used |
|---|---|
| AstroIntel 360° | Domain agents (each agent is a mini ReAct loop calling interpretation tools) |
| Bench Resource Optimizer | Capability matching agent calling profile lookup tools |
| Any copilot / assistant | Any time the LLM needs live data or needs to take actions |

---

## 🔮 Future additions (track here)

When something new comes to this pattern, add it to [extensions.md](./extensions.md).

Examples of what might come:
- New tool (add to TOOL_SCHEMAS + TOOL_REGISTRY in code.py)
- Parallel tool calls (asyncio.gather — already in code.py)
- LangGraph multi-agent orchestration (add to extensions.md)
- Tool result caching (add to extensions.md)
