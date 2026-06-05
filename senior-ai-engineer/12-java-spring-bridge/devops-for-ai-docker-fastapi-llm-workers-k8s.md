# Senior AI Engineer — Module 12
# Topic: DevOps for AI — Dockerizing FastAPI + LLM Workers, K8s Considerations

---

## 1. Intuition

AI systems have Docker and Kubernetes challenges that standard web services don't: large model weight files (7GB+), GPU node scheduling, workers that run different workloads (web server vs Celery worker vs vLLM server), and longer startup times.

Your DevOps background means you already know containers and K8s. This module focuses on the AI-specific differences.

---

## 2. Core Concept

### AI Service Components That Need Containers

```
Typical AI system in production:

ai-gateway         FastAPI API server (CPU, 2 vCPU, 4GB)
                   → handles incoming requests, RAG queries, routing

ai-worker          Celery worker (CPU, 2 vCPU, 4GB)
                   → processes async document ingestion, long analyses

vllm-server        vLLM inference server (GPU, g4dn.xlarge)
                   → serves self-hosted LLM at OpenAI-compatible endpoint

celery-beat        Celery beat scheduler (CPU, minimal)
                   → triggers scheduled jobs (nightly drift detection, weekly eval)

redis              Redis (CPU, 1 vCPU, 2GB)
                   → Celery broker + result backend + semantic cache

pgvector           PostgreSQL + pgvector (CPU, 2 vCPU, 8GB)
                   → vector store + application database
```

---

## 3. Docker Best Practices for AI Services

### Challenge 1: Large Dependency Images

AI services pull large libraries: PyTorch, HuggingFace Transformers, FAISS. These bloat Docker images to 3-10GB.

Solutions:
1. Use slim base images (python:3.11-slim, not python:3.11)
2. Use multi-stage builds — compile in a build stage, copy only artifacts to runtime stage
3. For vLLM/GPU: use NVIDIA's prebuilt Docker images as base (saves days of setup)
4. Cache pip layer before copying app code (COPY requirements.txt first)

### Challenge 2: Model Weights at Runtime

A 7B model is 7-14GB. You cannot bake it into a Docker image (image size limit, slow build, wasted storage per deploy).

Solutions:
1. Mount model weights from EFS/NFS/GCS at container startup
2. Download on first startup, cache in a persistent volume
3. Use S3 + a model weight loader at startup (common pattern with SageMaker)

---

## 4. Code Skeleton (Production-Grade)

### Multi-Service Docker Compose (local dev + staging)

```yaml
# docker-compose.yml
version: "3.9"

services:
  # FastAPI AI Gateway
  ai-gateway:
    build:
      context: .
      dockerfile: Dockerfile.gateway
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=development
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=postgresql://user:pass@postgres:5432/aidb
      - CELERY_BROKER_URL=redis://redis:6379/0
    env_file:
      - .env.local  # OPENAI_API_KEY etc.
    depends_on:
      - redis
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
  
  # Celery Worker
  ai-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A src.celery_app worker --loglevel=info --concurrency=4
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/1
      - DATABASE_URL=postgresql://user:pass@postgres:5432/aidb
    env_file:
      - .env.local
    depends_on:
      - redis
      - postgres
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
  
  # Celery Beat (scheduler)
  celery-beat:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: celery -A src.celery_app beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
    depends_on:
      - redis
  
  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
  
  # PostgreSQL + pgvector
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=aidb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/01_init.sql

volumes:
  redis_data:
  postgres_data:
```

### Dockerfile — FastAPI Gateway (optimized)

```dockerfile
# Dockerfile.gateway
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

# Cache pip layer — copy requirements BEFORE app code
COPY requirements/gateway.txt .
RUN pip install --user --no-cache-dir -r gateway.txt

# ──────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy only runtime dependencies from builder
COPY --from=builder /root/.local /root/.local
RUN apt-get update && apt-get install -y libpq5 curl && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -m -u 1000 appuser

# Copy application
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser prompts/ ./prompts/
COPY --chown=appuser:appuser config/ ./config/

USER appuser

ENV PATH="/root/.local/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### Dockerfile — Celery Worker

```dockerfile
# Dockerfile.worker
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y libpq-dev gcc curl && rm -rf /var/lib/apt/lists/*

COPY requirements/worker.txt .
RUN pip install --no-cache-dir -r worker.txt

RUN useradd -m -u 1000 appuser
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser config/ ./config/

USER appuser

ENV PYTHONUNBUFFERED=1
ENV C_FORCE_ROOT=0  # Celery: don't run as root

# No HEALTHCHECK for workers — use Celery's built-in health monitoring
CMD ["celery", "-A", "src.celery_app", "worker", "--loglevel=info"]
```

### Kubernetes Manifests

```yaml
# k8s/ai-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-gateway
  labels:
    app: ai-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-gateway
  template:
    metadata:
      labels:
        app: ai-gateway
    spec:
      containers:
        - name: ai-gateway
          image: your-registry/ai-gateway:latest
          ports:
            - containerPort: 8000
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          env:
            - name: ENVIRONMENT
              value: production
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ai-secrets
                  key: openai-api-key
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 60
            periodSeconds: 30
            failureThreshold: 3

---
# K8s HPA for AI gateway
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70

---
# K8s GPU deployment for vLLM
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  replicas: 1  # GPU nodes are expensive — scale carefully
  selector:
    matchLabels:
      app: vllm-server
  template:
    metadata:
      labels:
        app: vllm-server
    spec:
      # Schedule on GPU nodes only
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-l4  # GKE GPU node pool
      tolerations:
        - key: "nvidia.com/gpu"
          operator: "Exists"
          effect: "NoSchedule"
      containers:
        - name: vllm-server
          image: vllm/vllm-openai:latest
          command:
            - python
            - -m
            - vllm.entrypoints.openai.api_server
            - --model
            - meta-llama/Llama-3.1-8B-Instruct
            - --tensor-parallel-size
            - "1"
            - --port
            - "8080"
          resources:
            limits:
              nvidia.com/gpu: "1"  # request 1 GPU
              memory: "32Gi"
              cpu: "8"
          volumeMounts:
            - name: model-cache
              mountPath: /root/.cache/huggingface
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: model-weights-pvc  # pre-populated with model weights
```

---

## 5. AI-Specific K8s Considerations

### GPU Node Pools

Most K8s clusters use CPU nodes. For self-hosted LLM inference, you need a GPU node pool.

```
GKE: gcloud container node-pools create gpu-pool \
  --machine-type=g2-standard-8 \  # L4 GPU
  --accelerator type=nvidia-l4,count=1 \
  --num-nodes=1

EKS: eksctl create nodegroup \
  --cluster=production \
  --instance-type=g4dn.xlarge \
  --nodes=1
```

**Cost control:** GPU nodes are expensive ($0.53-$3/hr). Use spot/preemptible instances for inference servers — they're stateless and can restart.

### Startup Time for AI Services

vLLM loads a 7B model in 30-90 seconds. K8s readiness probe must account for this:
- `initialDelaySeconds: 90` — don't probe for the first 90 seconds
- Otherwise K8s kills the container before it's ready and enters a crash loop

### Persistent Volume for Model Weights

Model weights are not baked into Docker images — they're mounted from a PVC populated with the weights.

```
One-time setup:
1. Create PVC (100GB+)
2. Run a init job that downloads model weights from HuggingFace Hub into the PVC
3. vLLM deployment mounts the PVC read-only

Benefits:
- Docker images stay small (< 1GB)
- Model updates: run the download job, restart vLLM pod
- Multiple pods can share the same PVC (ReadOnlyMany)
```

---

## 6. Example (From Your Projects)

**AstroIntel Containerization — Enterprise Stack (7 services):**

AstroIntel's docker-compose.yml runs a full enterprise stack:

```
services:
  astro-gateway:   FastAPI (8080) — auth + LangGraph pipeline + SSE streaming
  zookeeper:       Kafka coordination
  kafka:           confluentinc/cp-kafka:7.6.0, 3 partitions, KAFKA_ENABLED=true
  kafka-ui:        :8090 — message browser (confluentinc/cp-enterprise-control-center)
  redis:           7.2-alpine, maxmemory 512mb, allkeys-lru, appendonly yes
                   DB0 = response cache, DB1 = job store
  redis-commander: :8091 — key browser, REDIS_HOSTS: "cache:redis:6379:0,jobs:redis:6379:1"
  postgres:        (future) user data + pgvector knowledge base

Auth-specific Docker concerns:
  - MASTER_API_KEY: injected as environment variable (never in Dockerfile or image)
  - JWT_SECRET: injected as environment variable
  - auth_keys.json: mounted as host volume — tenants and API keys persist across restarts
    Without this volume, every container restart loses all tenant data
```

Minimal production Dockerfile for AstroIntel (auth-aware):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser
# auth_keys.json lives at /data/auth_keys.json (mounted volume)
ENV AUTH_STORE_PATH=/data/auth_keys.json
HEALTHCHECK --interval=30s CMD curl -f http://localhost:8080/health || exit 1
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "4"]
```

docker-compose for local dev (auth-complete):
```yaml
services:
  astro-gateway:
    build: .
    ports: ["8080:8080"]
    environment:
      - MASTER_API_KEY=${MASTER_API_KEY}  # from .env — never hardcode
      - JWT_SECRET=${JWT_SECRET}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - AUTH_STORE_PATH=/data/auth_keys.json
    volumes:
      - auth_data:/data  # persists tenant/key store across restarts
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
volumes:
  auth_data:
```

In production (EC2 single-server):
- `astro-gateway` → Docker container, Nginx reverse proxy, HTTPS via Let's Encrypt
- `auth_keys.json` → host volume at `/var/astro/auth_keys.json`
- `MASTER_API_KEY`, `JWT_SECRET` → set in `/etc/environment` on EC2 (not in source control)
- Auth is fully tested (76/76 tests passing) — Docker deploy is the next phase

---

## 7. Trade-offs

Single container (API + worker combined):
+ Simpler deployment, one image to manage
- Can't scale workers and API independently, worker crash takes down API

Separate containers (API + worker + vllm):
+ Independent scaling, isolated failure domains
- More complex orchestration, more images to build and push

Docker Compose for local dev:
+ Matches production topology locally, easy to start all services
- Slower startup than just running FastAPI directly

Kubernetes vs ECS/Cloud Run:
K8s: full control, GPU scheduling, auto-scaling, but high operational complexity.
ECS/Cloud Run: managed, simpler, good enough for most AI services.
Decision: use ECS/Cloud Run unless you need multi-cloud portability, complex GPU scheduling, or already have K8s expertise.

---

## 8. Answer Framework

Step 1 — Connect to DevOps experience:
"My Docker and CI/CD experience transfers directly. AI service containerization follows the same patterns: multi-stage builds, non-root user, health checks, secrets from environment. The AI-specific additions are: large dependency management, model weight storage separate from the image, and GPU node scheduling in K8s."

Step 2 — Multi-container architecture:
"I separate the API gateway, Celery worker, and (optionally) vLLM server into separate containers. Each scales independently — API scales on request volume, worker scales on queue depth, vLLM scales on GPU utilization. In local dev, Docker Compose runs all four (including Redis and Postgres) with one command."

Step 3 — GPU K8s considerations:
"For self-hosted LLM inference, I create a dedicated GPU node pool and use K8s nodeSelector and tolerations to schedule vLLM pods exclusively on GPU nodes. Model weights are in a persistent volume — not baked into the image. This keeps the image small and lets me update model weights without rebuilding the container."

Step 4 — Startup time handling:
"vLLM takes 30-90 seconds to load a 7B model. I set K8s initialDelaySeconds to 90 for both readiness and liveness probes. Without this, K8s kills the container before it's ready and enters a crash loop — a common gotcha for engineers new to AI serving."

Step 5 — Cost awareness:
"GPU nodes are $0.53-$3/hour. I use spot instances for inference servers (vLLM is stateless, can restart in 90 seconds). For production, I keep one on-demand GPU node for low-latency and use spot for burst capacity. The cost of one g4dn.xlarge spot instance at $0.16/hr is $115/month — cheaper than Pinecone's middle tier for equivalent serving capacity."

---

## ★ YOUR 5 PROJECTS — DevOps Implementation

| Project | Docker/K8s detail | Key config |
|---------|------------------|-----------|
| **AstroIntel 360°** | Multi-stage Dockerfile. docker-compose: FastAPI + Redis + Kafka + ZooKeeper. Non-root user. `.dockerignore` excludes `.env`. | `acks=all` Kafka workers. Redis DB0 cache + DB1 job store. Connection pool. |
| **Bench Resource Optimizer** | Multi-stage Dockerfile. docker-compose: FastAPI + Redis + Kafka + ZooKeeper. SonarQube caught `COPY . .` bundling secrets — fixed to explicit per-directory copies. | FAISS index rebuilt async on role updates — no pod restart needed. |
| **RunbookAI** | Dockerfile. SQLite file persisted via Docker volume. No Kafka/Redis needed. | Simplest infra in portfolio — FastAPI + SQLite. No external services at query time. |
| **Agentic Growth OS** | Dockerfile. docker-compose: FastAPI + Angular frontend. | Campaign JSON persisted via Docker volume. LangGraph in-process. |
| **Universal Agent** | Dockerfile per agent config. 5 configs = 5 deployable images. CORS per config. | Port-based agent self-identification. `_resolve_agent_id()` reads its own port. |

**Interview line:** "SonarQube caught a security issue in Bench's Dockerfile — `COPY . .` was bundling `.env` secrets into the image layer. Fixed to explicit per-directory copies: `COPY src/ src/`, `COPY tests/ tests/`, never `COPY . .`. This is why static analysis in CI matters for Docker too, not just Python code."
