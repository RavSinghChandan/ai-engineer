# Running and deploying

## Local development (two processes)

```bash
# terminal 1 — API on 8000
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000

# terminal 2 — Angular dev server on 4200
cd frontend
npm install
npx ng serve --port 4200
```

Open http://localhost:4200. The frontend detects port 4200 and calls the API on
8000; everywhere else it calls its own origin.

## Deployment (one process)

There is no second server in a deployment. The Angular app is built once and
FastAPI serves it alongside the API on a single port, so the browser calls the
API on its own origin and CORS is not involved.

```bash
bash build.sh    # pip install + npm ci + ng build --configuration production
bash start.sh    # uvicorn on $PORT (default 8000), serving API + frontend
```

`start.sh` builds on first boot if no frontend build is present, so a bare
`bash start.sh` also works.

## Replit

`.replit` is committed and needs no edits:

- **Build**: `bash build.sh`
- **Run**: `bash start.sh`
- Port 8000 is mapped to external port 80.

### Secrets

The app runs fully offline with no configuration — ad copy comes from the
built-in template library.

To enable live copy generation, add this in **Tools → Secrets** (never in a
file, never in git):

| Key | Value |
|---|---|
| `DEEPSEEK_API_KEY` | your key |

Optional: `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`),
`DEEPSEEK_MODEL` (default `deepseek-chat`).

With no key, or if the call fails, the app falls back to templates and the UI
says which source produced the copy. `GET /api/model-info` reports whether
generation is enabled without ever exposing the key.

### Demo pacing

`AGENT_PACE` (default `0.7`) scales how long each agent step is held on screen —
about a 41s run. Raise it to slow the demo down, lower it to speed up, or set
`AGENT_PACE=0` to remove the pacing entirely for tests. See MODEL.md.

## Routes

| Route | Serves |
|---|---|
| `/` and any unknown path | the built frontend (client-side routing) |
| `/api` | API identity |
| `/api/workflow-steps` | the agents and their sub-steps |
| `/api/execute-workflow` | run the graph, one response |
| `/api/execute-workflow/stream` | run the graph, server-sent progress events |
| `/api/model-info` | how the numbers are produced; copy-generation status |
