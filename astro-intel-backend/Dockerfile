# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target=/build/packages

# ── Stage 2: Runtime image ────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install packages into /app/packages so non-root user can access them
COPY --from=builder /build/packages /app/packages
ENV PYTHONPATH="/app/packages"
ENV PATH="/app/packages/bin:$PATH"

# Create non-root user and persistent data directory
RUN useradd -m -u 1000 appuser && \
    mkdir -p /data && \
    chown appuser:appuser /data

# Copy application code (excludes everything in .dockerignore)
COPY --chown=appuser:appuser . .

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# SQLite DB lives on /data volume — survives container restarts
ENV SQLITE_DB_PATH=/data/astrointel.db
ENV AUTH_STORE_PATH=/data/auth_keys.json
ENV USERS_STORE_PATH=/data/users.json
ENV LEADS_STORE_PATH=/data/leads.json

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
