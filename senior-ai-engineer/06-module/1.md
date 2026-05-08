# Senior AI Engineer — Module 6
# Topic: Model Serving — FastAPI vs BentoML vs vLLM (When to Use What)

---

## 1. Intuition

Model serving is how you expose a model as a service that other systems can call. The right choice depends on whether you are serving third-party APIs, your own fine-tuned models, or open-source models at high throughput.

Your stack (FastAPI) is already the right choice for most cases. Senior engineers know when to step up to vLLM or BentoML.

---

## 2. Core Concept

### FastAPI (Your Primary Stack)
A Python web framework. You wrap LLM API calls (OpenAI, Anthropic) in FastAPI endpoints.
- Serving: third-party LLM APIs (OpenAI, Anthropic, Bedrock)
- You don't serve the model — you call someone else's API
- Handles: auth, rate limiting, business logic, RAG pipeline, agent orchestration
- Best for: 99% of enterprise AI applications

### BentoML
A framework specifically designed for ML model serving.
- Serving: your own trained or fine-tuned models (scikit-learn, PyTorch, HuggingFace)
- Handles: model packaging, versioning, batch inference, Kubernetes deployment
- Best for: teams serving custom models with complex preprocessing/postprocessing

### vLLM
An inference engine for open-source LLMs (LLaMA, Mistral, Qwen) optimized for throughput.
- Continuous batching: serves many concurrent requests on one GPU without waiting
- PagedAttention: efficient KV-cache management = more requests per GPU
- Best for: self-hosting open-source LLMs with high throughput requirements

---

## 3. When to Use What

| Scenario | Tool | Why |
|---|---|---|
| Using OpenAI/Anthropic API | FastAPI | You call their API, no model serving needed |
| Custom fine-tuned model (small team) | BentoML | Packaging + versioning + simple serving |
| Open-source LLM at scale (LLaMA, Mistral) | vLLM | High throughput, GPU efficiency, OpenAI-compatible API |
| Classifier or regression model | FastAPI + joblib | Simple enough, no need for specialized framework |
| Multiple model versions, A/B testing | BentoML | Model registry and traffic splitting built in |

---

## 4. Code Skeleton (Production-Grade)

```python
# FastAPI serving pattern (your primary stack)
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class QueryRequest(BaseModel):
    query: str
    context: str | None = None
    tenant_id: str
    task_type: str = "qa_answer"

class QueryResponse(BaseModel):
    answer: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int

@app.post("/v1/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    import time
    start = time.time()
    
    model = route_to_model(request.query, request.task_type)
    result = optimized_llm_call(
        task_type=request.task_type,
        system_prompt=load_system_prompt(request.task_type),
        user_message=request.query,
        context_chunks=[request.context] if request.context else None,
        tenant_id=request.tenant_id
    )
    
    return QueryResponse(
        answer=result["content"],
        model=result["model"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        cost_usd=result["cost_usd"],
        latency_ms=int((time.time() - start) * 1000)
    )

# Health check (important for k8s liveness probes)
@app.get("/health")
def health():
    return {"status": "ok"}

# vLLM server (if hosting open-source LLM)
# Launch from terminal: python -m vllm.entrypoints.openai.api_server \
#   --model meta-llama/Llama-3.1-8B-Instruct \
#   --port 8000 \
#   --max-model-len 8192 \
#   --tensor-parallel-size 1  # number of GPUs

# vLLM is OpenAI-compatible — call it like OpenAI API
def call_vllm(prompt: str) -> str:
    import openai
    client = openai.OpenAI(
        base_url="http://localhost:8000/v1",
        api_key="not-needed"  # vLLM doesn't require auth by default
    )
    response = client.chat.completions.create(
        model="meta-llama/Llama-3.1-8B-Instruct",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500
    )
    return response.choices[0].message.content
```

---

## 5. Example (From Your Projects)

**AstroIntel and LangChain Service — FastAPI:**

Both services use FastAPI as the serving layer, calling OpenAI's API.
This is the right choice: no model to host, no GPU management, instant scalability.

When would I move to vLLM?
- If the company has data sovereignty requirements (cannot send data to OpenAI)
- If LLM call volume is high enough that hosting a smaller open-source model is cheaper than API costs
- Example: at 10M tokens/day, GPT-4o-mini costs $3/day. A rented A10G GPU ($0.75/hr) running LLaMA-3.1-8B costs $18/day but has zero per-token cost. Break-even is around 120M tokens/day.

---

## 6. Trade-offs

FastAPI + OpenAI API:
+ No infrastructure to manage, instant to deploy, scales infinitely
- Per-token cost accumulates, data leaves your infrastructure, dependent on provider availability

vLLM + open-source model:
+ Data sovereignty, fixed infrastructure cost at scale
- GPU infrastructure overhead, model quality typically below GPT-4o, requires MLOps expertise

BentoML:
+ Purpose-built for ML serving, model registry, versioning
- More complexity than needed if you are just calling an external API

---

## 7. Interview Questions (Senior Level)

- When would you use vLLM instead of the OpenAI API?
- How do you deploy a FastAPI-based AI service to Kubernetes?
- What is continuous batching in vLLM and why does it matter for throughput?
- How do you handle model versioning for a production AI service?
- What monitoring do you add to a FastAPI AI service beyond standard HTTP metrics?

---

## 8. Answer Framework

Step 1 — Start with FastAPI (your current correct choice):
"For services calling third-party LLM APIs, FastAPI is the right serving layer. You are not hosting a model — you are orchestrating a pipeline."

Step 2 — Know when to upgrade:
"vLLM becomes relevant when data sovereignty is required or when token volume makes self-hosting cheaper than API costs. For most enterprises, that threshold is 100M+ tokens/day."

Step 3 — Production requirements for FastAPI AI service:
"Beyond a standard FastAPI service, I add: health check endpoints, LLM-specific metrics (token cost, model latency), request/response logging for audit, and graceful shutdown that completes in-flight requests."

Step 4 — From your project:
"AstroIntel uses FastAPI. The backend handles the LangGraph pipeline, SSE streaming, and all agent orchestration. FastAPI is ideal here — it handles async streaming natively."

Step 5 — Kubernetes:
"Deployed as a Docker container. Kubernetes deployment with 2+ replicas for availability. HPA on CPU/memory. Liveness probe on /health. ConfigMap for environment-specific LLM API keys."

---

## 10. Advanced Follow-ups

Q1: How do you containerize a FastAPI AI service for production deployment?

Answer:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cacheable layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Non-root user for security
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Gunicorn with uvicorn workers for production
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", 
     "--bind", "0.0.0.0:8000", "--timeout", "120", "--graceful-timeout", "30"]
```
Key production details: multi-stage build (smaller image), non-root user (security), uvicorn workers (async support), timeout configuration (LLM calls can take 30s).
Environment variables for API keys — never baked into the image. Injected via Kubernetes Secrets.

Q2: What is continuous batching in vLLM?

Answer:
Traditional batching: collect N requests, run them all together through the model, return all N results. Problem: some requests finish quickly, but the batch waits for the slowest one.
Continuous batching: as soon as one request in the batch completes its generation, a new waiting request takes its slot immediately. The GPU is never idle waiting for slow requests.
Result: 10-20× better GPU utilization compared to static batching. At the same GPU cost, you serve 10-20× more concurrent users.
This is the key reason vLLM became the de facto standard for self-hosted LLM serving — it made open-source model serving economically practical.

Q3: How do you handle zero-downtime deployments for an AI service?

Answer:
Rolling deployment with readiness probes.
Kubernetes rolling update: bring up new pods one at a time. New pod passes readiness probe (GET /health returns 200) before old pod is terminated. Traffic never routes to a pod that is not ready.
For AI services specifically: the readiness probe should also check that the LLM client is initialized and can reach the API. A pod that starts but cannot connect to OpenAI should not receive traffic.
Long-in-flight requests during deployment: set terminationGracePeriodSeconds to 120 seconds. Kubernetes sends SIGTERM, pod finishes in-flight LLM calls (max 30s per call), then terminates cleanly.
For model deployments (if hosting your own model): blue-green is safer than rolling. Bring up a full new deployment, run smoke tests, then switch traffic atomically. Rolling deployment of a model change is risky — partial rollout of a different model creates inconsistent behavior.
