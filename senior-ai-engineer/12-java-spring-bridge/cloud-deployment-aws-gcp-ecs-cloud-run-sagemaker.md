# Senior AI Engineer — Module 12
# Topic: Cloud Deployment — AI on AWS/GCP (ECS, Cloud Run, SageMaker)

---

## 1. Intuition

Deploying AI services on cloud requires different decisions than standard web services: GPU instances for self-hosted models, high-memory instances for large vector indexes, and the choice between managed AI services (SageMaker, Vertex AI) vs containerized deployment (ECS, Cloud Run).

Your existing cloud experience (EC2, ECS, GCP basics) applies directly. AI deployment is mostly the same infra with different instance types.

---

## 2. Core Concept

### Deployment Options by Use Case

| Scenario | AWS Option | GCP Option | When |
|---|---|---|---|
| FastAPI AI service (calling OpenAI) | ECS Fargate | Cloud Run | Most common — stateless, no GPU needed |
| Self-hosted LLM (Llama/Mistral) | ECS on p4d/p3 instances | Cloud Run GPU (NVIDIA L4) | Need GPU, want containers |
| Large-scale ML training | SageMaker Training | Vertex AI Training | Fine-tuning, LoRA training |
| Batch embedding / document processing | AWS Batch | Cloud Batch | One-time large jobs |
| Vector store | RDS PostgreSQL + pgvector | Cloud SQL + pgvector | SQL-native vector store |
| Managed LLM endpoint | Bedrock | Vertex AI Model Garden | No-ops LLM hosting |

### Key Instance Types for AI Workloads

**CPU-only (calling OpenAI API, RAG service):**
- AWS: t3.medium/c5.large — standard web service, 2-4 vCPU, 4-8GB RAM
- GCP: e2-standard-2/n1-standard-4

**GPU (self-hosted LLM serving):**
- AWS: g4dn.xlarge (1× T4 GPU, 16GB VRAM) — $0.53/hr, good for inference of 7B models
- AWS: p3.2xlarge (1× V100, 16GB VRAM) — $3.06/hr, training
- GCP: g2-standard-8 (1× L4 GPU, 24GB VRAM) — good for inference, $0.89/hr

**High-memory (large FAISS index):**
- AWS: r5.2xlarge (64GB RAM) — for FAISS indexes of 5M+ vectors
- GCP: n2-highmem-8 (64GB RAM)

---

## 3. Architecture Patterns

### Pattern 1: ECS Fargate (most common — CPU AI service)

```
User → ALB → ECS Fargate Service
              ├── Task: FastAPI AI Gateway (2 vCPU, 4GB RAM)
              └── Auto-scaling: scale on CPU > 70% or queue depth

External dependencies:
├── OpenAI API (direct HTTPS call)
├── RDS PostgreSQL + pgvector (vector store)
├── ElastiCache Redis (semantic cache, Celery broker)
└── S3 (document storage)
```

### Pattern 2: Cloud Run (GCP — serverless containers)

```
User → Cloud Load Balancer → Cloud Run (FastAPI)
                             ├── Scale to zero when idle (cost-efficient)
                             ├── Max instances: 10 (rate limit protection)
                             └── Min instances: 1 (avoid cold start for production)

External:
├── Cloud SQL PostgreSQL + pgvector
├── Memorystore Redis
└── Cloud Storage (documents)
```

### Pattern 3: ECS on GPU Instance (self-hosted LLM)

```
User → ALB → ECS Service on EC2 Launch Type (g4dn.xlarge)
              └── Task: vLLM server + FastAPI proxy

vLLM serves: Llama-3.1-8B or Mistral-7B
FastAPI proxies: /v1/chat/completions (OpenAI-compatible)
```

---

## 4. Code Skeleton (Production-Grade Infrastructure)

### Docker — AI Service Production Container

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY src/ ./src/
COPY prompts/ ./prompts/
COPY config/ ./config/

# Non-root user for security
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# Uvicorn with workers
CMD ["uvicorn", "src.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--timeout-keep-alive", "65"]
```

### ECS Task Definition (Terraform)

```hcl
# terraform/ecs.tf
resource "aws_ecs_task_definition" "ai_service" {
  family                   = "ai-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 2048  # 2 vCPU
  memory                   = 4096  # 4GB RAM
  
  execution_role_arn = aws_iam_role.ecs_execution.arn
  task_role_arn      = aws_iam_role.ecs_task.arn
  
  container_definitions = jsonencode([
    {
      name  = "ai-service"
      image = "${var.ecr_repo_url}:${var.image_tag}"
      
      portMappings = [{
        containerPort = 8000
        protocol      = "tcp"
      }]
      
      environment = [
        { name = "ENVIRONMENT", value = "production" },
        { name = "DB_HOST", value = var.db_host },
        { name = "REDIS_URL", value = var.redis_url }
      ]
      
      secrets = [
        { name = "OPENAI_API_KEY", valueFrom = aws_ssm_parameter.openai_key.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_ssm_parameter.anthropic_key.arn }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/ai-service"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

resource "aws_ecs_service" "ai_service" {
  name            = "ai-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_service.arn
  desired_count   = 2  # minimum 2 for HA
  launch_type     = "FARGATE"
  
  load_balancer {
    target_group_arn = aws_lb_target_group.ai_service.arn
    container_name   = "ai-service"
    container_port   = 8000
  }
  
  # Auto-scaling
  lifecycle {
    ignore_changes = [desired_count]
  }
}

# Auto-scaling
resource "aws_appautoscaling_target" "ai_service" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.ai_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ai_service_cpu" {
  name               = "ai-service-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ai_service.resource_id
  scalable_dimension = aws_appautoscaling_target.ai_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ai_service.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0  # scale when CPU > 70%
  }
}
```

### Cloud Run (GCP) — Simple Deployment

```yaml
# cloud-run.yaml — deploy with: gcloud run services replace cloud-run.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ai-service
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"   # avoid cold starts
        autoscaling.knative.dev/maxScale: "10"  # rate limit protection
        run.googleapis.com/cpu-throttling: "false"  # always-on CPU (needed for SSE)
    spec:
      containerConcurrency: 100  # requests per instance
      timeoutSeconds: 300        # 5 min for long AI calls
      containers:
        - image: gcr.io/PROJECT_ID/ai-service:latest
          resources:
            limits:
              cpu: "2"
              memory: "4Gi"
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: openai-api-key
                  key: latest
          ports:
            - containerPort: 8000
```

### SSM Parameter Store — Secrets (AWS)

```python
# src/config.py — secrets from AWS SSM, never in environment variables
import boto3
from functools import lru_cache

@lru_cache(maxsize=None)
def get_secret(param_name: str) -> str:
    """Retrieve secret from SSM Parameter Store (cached per process)."""
    ssm = boto3.client("ssm")
    response = ssm.get_parameter(Name=param_name, WithDecryption=True)
    return response["Parameter"]["Value"]

# Usage
OPENAI_API_KEY = get_secret("/ai-service/prod/openai-api-key")
ANTHROPIC_API_KEY = get_secret("/ai-service/prod/anthropic-api-key")
```

---

## 5. Example (From Your Projects)

**AstroIntel on ECS Fargate:**

AstroIntel is a FastAPI service with 6 concurrent LLM calls per request. No GPU needed (calling OpenAI, not self-hosted). ECS Fargate is the right choice:

- Task: 2 vCPU, 4GB RAM (handles concurrent async LLM calls)
- Min instances: 2 (HA)
- Auto-scale: CPU > 70% → add instances
- RDS PostgreSQL + pgvector for user data and (future) knowledge base
- ElastiCache Redis for SSE pub/sub and semantic cache
- Secrets in SSM Parameter Store, injected as ECS task secrets
- Monthly cost: 2 tasks × t3-equivalent × 730 hours ≈ $30-50/month for the compute

**LangChain Service on Cloud Run:**

The LangChain Service is a demo/learning project. Cloud Run's scale-to-zero is ideal:
- Zero cost when not in use
- Instant scale-up when demo traffic comes in
- No infrastructure to manage

---

## 6. Trade-offs

ECS Fargate vs EC2 Launch Type:
Fargate: zero infra management, pay per task-second, slightly higher per-unit cost.
EC2: reserve capacity, lower cost at high sustained load, must manage EC2 lifecycle.
Decision: Fargate for variable/unpredictable AI traffic. EC2 reserved instances for sustained high-volume production.

Cloud Run vs ECS:
Cloud Run: simpler deployment (gcloud run deploy), scale to zero, GCP-native.
ECS: AWS-native, better VPC integration, more control, Fargate pricing comparable.
Decision: use whichever cloud your org already uses. No material difference for a FastAPI AI service.

SageMaker vs ECS for model serving:
SageMaker: managed endpoint lifecycle, A/B testing, model registry — but vendor lock-in, higher cost.
ECS + vLLM: full control, portable, cheaper at scale.
Decision: SageMaker for teams new to ML serving. ECS + vLLM for teams with container ops experience.

---

## 7. Interview Questions (Senior Level)

- How would you deploy AstroIntel on AWS?

  **Answer:** ECS Fargate with Application Load Balancer. Two Fargate services: `astro-api` (FastAPI + LangGraph pipeline, 2 vCPU / 4GB, 2 tasks minimum) and `astro-worker` (Celery workers for async analysis jobs, same sizing, auto-scales on queue depth). ALB in front of `astro-api` with target group health checks on `GET /health`. Redis via ElastiCache (SSE pub/sub, semantic cache). Postgres via RDS for session data and LangGraph checkpoints. OpenAI API key in SSM Parameter Store, injected as ECS task secret. CloudWatch for logs and custom metrics (faithfulness score, token cost per run). S3 for audit log storage. Total infrastructure cost at demo scale: ~$50-80/month.

- What instance type would you use for self-hosted LLM inference?

  **Answer:** For a 7B parameter model (Llama 3.1 8B, Mistral 7B): `g4dn.xlarge` — 1× NVIDIA T4 GPU, 16GB VRAM, $0.53/hr on-demand. At float16 precision a 7B model fits in ~14GB VRAM with 2GB left for KV cache. For a 13B model or higher throughput: `g4dn.2xlarge` (still 1× T4, more CPU/RAM, $0.75/hr) or `g5.xlarge` (A10G GPU, 24GB VRAM, $1.01/hr). For 70B models: `p3.8xlarge` (4× V100, 64GB total VRAM) or multi-GPU `g5.12xlarge`. The break-even vs OpenAI API for a 7B model on g4dn.xlarge: ~24/hr × $0.53 = $12.72/day fixed vs OpenAI at $0.15/1M input tokens — break-even at approximately 85M tokens/day.

- How do you manage API keys in an ECS Fargate deployment?

  **Answer:** API keys are stored in AWS SSM Parameter Store (SecureString type, encrypted at rest by KMS). The ECS task definition references them as secrets: `{"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:ssm:region:account:parameter/prod/openai-api-key"}`. ECS pulls the value from SSM at task startup using the task execution role's IAM permission (`ssm:GetParameters`). Keys are never in the Docker image, never in environment variable plaintext in the task definition, and never in source control. Key rotation: update the SSM parameter, restart the ECS tasks — they pick up the new value on next start. Same pattern in GCP: Secret Manager + Cloud Run's `--set-secrets` flag.

- How do you handle SSE (streaming) with Cloud Run?

  **Answer:** Cloud Run's default HTTP request timeout is 60 seconds — SSE connections for LLM streaming can last 30-120 seconds. Set `timeoutSeconds: 300` in the Cloud Run service configuration. Set `cpu-throttling: false` so the container gets consistent CPU between token emissions (default throttling can cause uneven streaming). Set `max-instances` high enough to handle concurrent SSE connections — each SSE stream holds one container instance busy for the duration. On the FastAPI side: no changes needed from the standard SSE implementation. On the client side: ensure the load balancer or CDN in front doesn't buffer SSE — Cloud Run's built-in HTTPS endpoints don't buffer, but a custom CDN in front might.

- What is the cost difference between Fargate and a reserved EC2 instance for an AI service?

  **Answer:** Fargate at AstroIntel scale (2 tasks, 2 vCPU / 4GB each): ~2 × 2 vCPU × $0.04048/vCPU-hr + 2 × 4GB × $0.004445/GB-hr × 730 hrs/month ≈ $110-130/month. Reserved EC2 t3.medium (2 vCPU, 4GB, 1-year reserved): ~$21/month. Fargate is ~5× more expensive per compute unit. Fargate wins on: no server management, scales to zero (if configured), no patching, no capacity planning. EC2 wins on: cost efficiency at sustained load, predictable capacity, ability to run GPU instances for self-hosted LLMs. Decision rule: use Fargate for demo/startup phase or variable traffic. Switch to reserved EC2 when you have sustained predictable load and the cost difference justifies operational overhead.

---

## 8. Answer Framework

Step 1 — Connect to existing cloud experience:
"Deploying a FastAPI AI service to ECS or Cloud Run follows the same patterns I've used for Spring Boot — Dockerfile, task definition, ALB, auto-scaling. The difference is instance sizing for AI workloads and secrets management for API keys."

Step 2 — Instance selection:
"For AI services calling OpenAI (no GPU), standard compute (t3.medium or 2 vCPU/4GB Fargate) is sufficient. The service is IO-bound on LLM API calls, not CPU-bound. For self-hosted LLM inference (vLLM), I need a g4dn.xlarge minimum — T4 GPU, 16GB VRAM for a 7B model."

Step 3 — Secrets management:
"API keys never go in environment variables or Docker images. They're stored in AWS SSM Parameter Store (or GCP Secret Manager) and injected into ECS tasks as secrets — ECS pulls them at runtime with the task execution role's IAM permissions."

Step 4 — SSE consideration:
"Cloud Run's default HTTP timeout is 60 seconds. SSE streams last much longer. I set `timeoutSeconds: 300` and `cpu-throttling: false` (so the container gets full CPU between tokens, not just during active requests). Same issue with ALB — I set idle timeout to 300s."

Step 5 — Cost awareness:
"Two ECS Fargate tasks (2 vCPU, 4GB) running 24/7 costs approximately $30-50/month. The LLM API call cost at 1000 analyses/day × $0.07 is $70/day. The infrastructure is the smaller cost — the API calls dominate. This is why cost optimization focuses on model selection and caching, not instance rightsizing."
