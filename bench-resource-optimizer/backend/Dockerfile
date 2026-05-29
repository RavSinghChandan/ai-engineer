# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (explicit list avoids accidentally bundling secrets or local config)
COPY main.py .
COPY db.py .
COPY storage.py .
COPY agents/ agents/
COPY auth/ auth/
COPY cache/ cache/
COPY guardrails/ guardrails/
COPY infra/ infra/
COPY memory/ memory/
COPY metrics/ metrics/
COPY middleware/ middleware/
COPY prompts/ prompts/
COPY rag/ rag/
COPY utils/ utils/
COPY data/ data/

# Non-root user for security
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Graceful shutdown timeout matches K8s terminationGracePeriodSeconds
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "30"]
