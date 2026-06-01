# Universal Agent

**One AI agent. Any domain. Any application. Plug it in and it works.**

You configure it once via a YAML file. It integrates into any FastAPI app, React app, Angular app, or plain HTML page. Zero hardcoded domain logic — it adapts to whatever application you point it at.

---

## What This Is

A production-ready, plug-and-play AI agent that you can drop into **any existing application** — portfolio, SaaS, RAG system, enterprise dashboard, anything — without rewriting a single line of your app's code.

### What It Does
- Answers questions in natural language using Claude, GPT-4, Gemini, or any local model
- Remembers conversation history per user (auto-expires sessions)
- Optionally reads your documents (PDF, Markdown, text) to answer domain-specific questions (RAG)
- Has built-in tools: calculator, date/time — and you can plug in custom tools
- Serves a chat widget you can embed in any web page with one `<script>` tag
- Exposes a REST API that any frontend can call

---

## Architecture

```
universal-agent/
│
├── config/
│   └── agent.config.yaml       ← THE ONLY FILE YOU EDIT
│
├── core/                       ← Engine — never changes
│   ├── agent.py                ← LangGraph agent loop
│   ├── config_loader.py        ← Reads + validates config
│   ├── llm.py                  ← LLM abstraction (swap providers)
│   ├── memory.py               ← Per-session conversation memory
│   ├── tools.py                ← Dynamic tool registry
│   └── knowledge.py            ← Optional RAG knowledge base
│
├── adapters/                   ← Integration layer
│   ├── fastapi_adapter.py      ← Plug into any FastAPI app (3 lines)
│   ├── angular_adapter.ts      ← Angular service (copy + inject)
│   ├── react_adapter.tsx       ← React hook + widget component
│   └── widget/
│       └── demo.html           ← Test UI served by the standalone server
│
├── api/
│   └── main.py                 ← Standalone REST server
│
├── sdk/
│   └── universal-agent.js      ← JS SDK — 1 script tag in any HTML page
│
└── tests/
    └── test_agent.py           ← 20 tests, no API keys needed
```

### Data Flow (every request)

```
User message
    │
    ▼
MemoryStore          — load conversation history for this session
    │
    ▼
Knowledge Base       — retrieve relevant docs (if RAG enabled)
    │
    ▼
LangGraph Agent Loop
    ├── SystemPrompt (built from config + context)
    ├── History messages
    ├── Retrieved context (if any)
    └── User message
         │
         ▼
    LLM (Claude / GPT-4 / Gemini / Ollama)
         │
    [if tool call needed]
         ▼
    ToolNode (calculator / datetime / web search / custom)
         │
         ▼
    LLM (final answer)
    │
    ▼
MemoryStore          — save turn to history
    │
    ▼
Response → caller
```

---

## Quick Start (5 minutes)

### Step 1 — Install

```bash
cd universal-agent
pip install -r requirements.txt
```

### Step 2 — Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Step 3 — Configure (edit one file)

Open [config/agent.config.yaml](config/agent.config.yaml) and set:

```yaml
agent:
  name: "My App Assistant"
  persona: "You are a helpful assistant for My App. You help users..."

context:
  app_name: "My App"
  app_description: "A task management tool for teams."
  extra_facts:
    - "Free tier allows 10 projects. Pro is unlimited."
    - "Support email is help@myapp.com"
```

### Step 4 — Run

```bash
python -m universal_agent.api.main
```

Open [http://localhost:8000](http://localhost:8000) — you'll see the chat widget. Talk to it.

---

## Integration Patterns

### Pattern 1: Add to Any Existing FastAPI App

```python
# Your existing app — add these 2 lines
from universal_agent.adapters.fastapi_adapter import mount_agent

app = FastAPI(...)

# Add the agent — that's it
mount_agent(app)

# Your app now has:
# POST /agent/chat
# POST /agent/clear
# GET  /agent/health
```

Your existing routes are untouched. The agent routes are added alongside them.

---

### Pattern 2: Embed in Any HTML Page (1 script tag)

```html
<!-- Paste this before </body> in any HTML file -->
<script
  src="http://localhost:8000/sdk/universal-agent.js"
  data-agent-url="http://localhost:8000"
  data-agent-name="My Assistant"
  data-color="#2563eb"
></script>
```

A chat button appears in the bottom-right corner. Done.

---

### Pattern 3: Angular App

```bash
# Copy the adapter into your project
cp adapters/angular_adapter.ts your-app/src/app/services/universal-agent.service.ts
```

```typescript
// In any component
constructor(private agent: UniversalAgentService) {}

async askQuestion() {
  const reply = await this.agent.chat("What features does this app have?");
  console.log(reply);
}
```

---

### Pattern 4: React / Next.js

```tsx
import { useUniversalAgent, AgentWidget } from './react_adapter'

// Option A: Use the hook (build your own UI)
function MyComponent() {
  const { chat, messages, isLoading } = useUniversalAgent()
  const reply = await chat("Hello!")
}

// Option B: Drop-in widget
function App() {
  return (
    <>
      <YourApp />
      <AgentWidget agentName="My Assistant" primaryColor="#2563eb" />
    </>
  )
}
```

---

### Pattern 5: Call the REST API Directly (any language)

```bash
curl -X POST http://localhost:8000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What can you help me with?", "session_id": "user_123"}'
```

```json
{
  "session_id": "user_123",
  "message": "I can help you with...",
  "agent_name": "Assistant"
}
```

---

## Configuration Reference

All configuration lives in `config/agent.config.yaml`. Key sections:

| Section | What it controls |
|---|---|
| `agent.name` | Display name in the widget header |
| `agent.persona` | Personality and role instructions for the LLM |
| `llm.provider` | `anthropic` / `openai` / `gemini` / `ollama` |
| `llm.model` | Any model ID from the chosen provider |
| `memory.max_history` | How many conversation turns to remember |
| `knowledge_base.enabled` | Set `true` to enable RAG from your documents |
| `knowledge_base.source_dir` | Folder with your .txt / .md / .pdf files |
| `tools.calculator.enabled` | Safe math tool |
| `tools.web_search.enabled` | Live web search (needs Tavily API key) |
| `context.app_name` | Injected into every conversation so the agent knows your app |
| `context.extra_facts` | Static facts the agent always knows |
| `widget.primary_color` | Chat widget button and header color |

---

## Switching LLM Providers

Change 2 lines in config — no code changes:

```yaml
# Use OpenAI GPT-4o
llm:
  provider: openai
  model: gpt-4o
  api_key_env: OPENAI_API_KEY

# Use Google Gemini
llm:
  provider: gemini
  model: gemini-1.5-pro
  api_key_env: GOOGLE_API_KEY

# Use local Ollama (no API key needed)
llm:
  provider: ollama
  model: llama3.2
```

---

## Enabling RAG (Document Q&A)

```yaml
knowledge_base:
  enabled: true
  source_dir: "./knowledge"    # put your docs here
```

Then drop any `.txt`, `.md`, or `.pdf` files into the `knowledge/` folder. The agent reads them on startup and answers questions from them automatically.

---

## Adding Custom Tools

Create a Python file with a `TOOLS` list:

```python
# tools/my_tools.py
from langchain_core.tools import tool

@tool
def get_account_balance(user_id: str) -> str:
    """Get the account balance for a user."""
    # your actual logic here
    return f"Balance for {user_id}: $1,250.00"

TOOLS = [get_account_balance]
```

Then point config at it:

```yaml
tools:
  custom_tools:
    enabled: true
    module_path: "./tools/my_tools.py"
```

The agent will automatically call this tool when a user asks about account balances.

---

## Running Tests

```bash
# No API keys needed — all LLM calls are mocked
cd universal-agent
pytest tests/ -v
```

20 tests covering: config loading, memory, tools, agent logic, FastAPI endpoints.

---

## Production Deployment

### Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
EXPOSE 8000
CMD ["python", "-m", "universal_agent.api.main"]
```

```bash
docker build -t universal-agent .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... universal-agent
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (if using Claude) | Your Anthropic API key |
| `OPENAI_API_KEY` | Only if using OpenAI | Your OpenAI API key |
| `TAVILY_API_KEY` | Only if web search enabled | Tavily search API key |
| `AGENT_CONFIG_PATH` | No | Custom path to agent.config.yaml |
| `LOG_LEVEL` | No | `DEBUG` / `INFO` / `WARNING` |

---

## How I Integrated This With My Other Projects

### AstroIntel 360° (FastAPI + LangGraph)
```python
# In astro-intel-backend/main.py — add 2 lines
from universal_agent.adapters.fastapi_adapter import mount_agent
mount_agent(app, config_path="./config/astro_agent.config.yaml")
```
Create `astro_agent.config.yaml` with persona: "You are an Astrology assistant..."

### Portfolio (Angular)
```typescript
// Copy angular_adapter.ts → portfolio/src/app/services/
// Inject UniversalAgentService in any component
```

### Bench Resource Optimizer (FastAPI + Angular)
Same pattern as AstroIntel for backend, Angular adapter for frontend.

---

## Project Stats

| Metric | Value |
|---|---|
| Lines of Python (core) | ~400 |
| Lines of JavaScript (SDK) | ~200 |
| Tests | 20 (no API keys needed) |
| Config lines to integrate | 3 |
| Supported LLM providers | 4 (Claude, GPT-4, Gemini, Ollama) |
| Frontend adapters | 3 (Angular, React, plain HTML) |
