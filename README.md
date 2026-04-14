# AI Engineer Projects

A collection of AI projects built with LangChain and OpenAI API.

---

## Project 1: LangChain AI Service

A production-ready FastAPI service with LangChain featuring an agent, RAG, memory, streaming, and versioned prompts.

### Features

- Agent with tools (calculator, datetime)
- Retrieval-Augmented Generation (RAG) via FAISS
- Conversation memory
- Streaming responses (token-by-token)
- Versioned prompt templates
- Structured JSON responses
- Request/response logging

### Project Structure

```
langchain-langraph-workspace/langchain_project/
├── app/
│   ├── main.py              # FastAPI entrypoint
│   ├── api/
│   │   └── routes.py        # All API endpoints
│   ├── core/
│   │   ├── config.py        # Settings (loaded from .env)
│   │   └── logger.py        # Logging setup (stdout)
│   ├── agents/
│   │   └── agent.py         # Agent with tools
│   ├── chains/
│   │   └── chain.py         # LangChain chains
│   ├── tools/
│   │   ├── tool_1.py        # Calculator tool
│   │   └── tool_2.py        # Datetime tool
│   ├── memory/
│   │   └── memory.py        # Conversation memory
│   ├── rag/
│   │   ├── ingest.py        # Document ingestion + FAISS indexing
│   │   └── retrieve.py      # RAG retrieval
│   ├── prompts/
│   │   ├── v1.txt           # Prompt version 1
│   │   └── v2.txt           # Prompt version 2
│   ├── models/
│   │   └── response_model.py # Pydantic request/response models
│   └── services/
│       └── ai_service.py    # Orchestration logic
├── data/
│   └── documents/           # Uploaded files for RAG
├── requirements.txt
├── .env                     # API keys (not committed)
└── README.md
```

### Setup & Run

**Step 1 — Navigate to the project**

```bash
cd langchain-langraph-workspace/langchain_project
```

**Step 2 — Activate the virtual environment**

```bash
source venv/bin/activate
```

**Step 3 — Install dependencies** (only needed once)

```bash
pip install -r requirements.txt
```

**Step 4 — Configure your API key**

Create or edit the `.env` file:

```
OPENAI_API_KEY=your_openai_api_key_here
```

**Step 5 — Start the server**

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The `--reload` flag auto-restarts the server on code changes (useful during development).

The server will be available at: `http://127.0.0.1:8000`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check — returns service status and model |
| POST | `/api/v1/chat` | Chat with AI (agent + optional RAG) |
| POST | `/api/v1/chat/stream` | Streaming chat (token-by-token via SSE) |
| POST | `/api/v1/agent` | Run agent directly with tools |
| POST | `/api/v1/ingest` | Upload a `.txt` or `.pdf` file for RAG |
| GET | `/api/v1/prompts` | List all available prompt versions |
| GET | `/api/v1/memory` | View current conversation history |
| DELETE | `/api/v1/memory` | Clear conversation history |

**Interactive API docs (Swagger UI):** `http://127.0.0.1:8000/docs`

### Example Requests

**Chat (with agent and tools):**

```bash
curl -X POST http://127.0.0.1:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is 10 * 5?", "prompt_version": "v1", "use_rag": false}'
```

**Agent (tool trace visible):**

```bash
curl -X POST http://127.0.0.1:8000/api/v1/agent \
  -H "Content-Type: application/json" \
  -d '{"question": "What is today'\''s date?"}'
```

**Ingest a document for RAG:**

```bash
curl -X POST http://127.0.0.1:8000/api/v1/ingest \
  -F "file=@/path/to/your/document.txt"
```

**Chat with RAG enabled:**

```bash
curl -X POST http://127.0.0.1:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "Summarize the document", "prompt_version": "v1", "use_rag": true}'
```

### Application Logs

Logs are written to **stdout** (the terminal where you started the server). There is no separate log file — all output appears inline in your terminal session.

**Log format:**

```
2026-04-13 21:44:33,123 | INFO | app.api.routes | POST /chat | question='What is 2+2?'
2026-04-13 21:44:33,890 | INFO | app.main | POST /api/v1/chat | 200 | 767.45ms
```

Each log line contains:
- **Timestamp** — when the event occurred
- **Level** — `INFO`, `WARNING`, or `ERROR`
- **Module** — which part of the code emitted the log
- **Message** — request details, tool usage, or error description

**To watch logs while the server runs:**

Just look at your terminal — logs stream in real time as requests come in. To save logs to a file alongside the terminal output:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload 2>&1 | tee app.log
```

This prints logs to the terminal AND saves them to `app.log` in the project directory.

**To view saved logs:**

```bash
cat app.log          # full log
tail -f app.log      # follow live (like tail -f)
grep ERROR app.log   # filter only errors
```

### Configuration

All settings are controlled via the `.env` file and loaded through `app/core/config.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Your OpenAI API key (required) |
| `MODEL_NAME` | `gpt-3.5-turbo` | OpenAI model to use |
| `TEMPERATURE` | `0.7` | Response creativity (0.0–1.0) |
| `PROMPT_VERSION` | `v1` | Default prompt version |
| `MAX_RETRIES` | `3` | Retry attempts on API failure |

### Troubleshooting

**Server won't start**
- Make sure the venv is activated: `source venv/bin/activate`
- Check that port 8000 is free: `lsof -i :8000`

**API key errors**
- Confirm `.env` exists in `langchain_project/` with `OPENAI_API_KEY=sk-...`
- Verify the key is valid at https://platform.openai.com/api-keys

**Import errors**
- Run `pip install -r requirements.txt` inside the activated venv

---

## Requirements

- Python 3.9+
- OpenAI API key
- Internet connection for API calls

## License

This is a demo application for educational purposes.

## Author

Created as an AI Engineer demo application.

