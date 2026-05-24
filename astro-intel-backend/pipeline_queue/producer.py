"""
Kafka Producer — Enterprise Grade
=====================================
Publishes analysis jobs to Kafka with retry, exponential backoff, and DLQ.

Retry strategy:
  Up to KAFKA_MAX_RETRIES attempts with exponential backoff + jitter.
  On final failure, message is sent to the Dead Letter Queue topic.
  Falls back to inline thread execution if Kafka is disabled or unreachable.

Environment variables:
  KAFKA_ENABLED        — true / false (default: false)
  KAFKA_BOOTSTRAP      — broker address (default: localhost:9092)
  KAFKA_TOPIC_ANALYSIS — main topic name (default: astrointel.analysis)
  KAFKA_TOPIC_DLQ      — dead letter topic  (default: astrointel.analysis.dlq)
  KAFKA_MAX_RETRIES    — publish retry attempts (default: 3)
  KAFKA_RETRY_BACKOFF_MS — base backoff ms (default: 1000)
"""
from __future__ import annotations
import json
import os
import random
import threading
import time
from typing import Any

KAFKA_ENABLED        = os.getenv("KAFKA_ENABLED",        "false").lower() == "true"
KAFKA_BOOTSTRAP      = os.getenv("KAFKA_BOOTSTRAP",      "localhost:9092")
KAFKA_TOPIC_ANALYSIS = os.getenv("KAFKA_TOPIC_ANALYSIS", "astrointel.analysis")
KAFKA_TOPIC_DLQ      = os.getenv("KAFKA_TOPIC_DLQ",      "astrointel.analysis.dlq")
KAFKA_MAX_RETRIES    = int(os.getenv("KAFKA_MAX_RETRIES",       "3"))
KAFKA_RETRY_BACKOFF  = int(os.getenv("KAFKA_RETRY_BACKOFF_MS",  "1000")) / 1000.0

_producer = None
_producer_lock = threading.Lock()


def _get_producer():
    global _producer
    if _producer is not None:
        return _producer
    if not KAFKA_ENABLED:
        return None
    with _producer_lock:
        if _producer is not None:
            return _producer
        try:
            from kafka import KafkaProducer
            _producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",                   # wait for all replicas
                retries=3,
                request_timeout_ms=5000,
                max_block_ms=5000,
                compression_type="gzip",
            )
            return _producer
        except Exception:
            _producer = None
            return None


def _reset_producer():
    global _producer
    _producer = None


def _send_to_dlq(job_id: str, payload: dict[str, Any], error: str) -> None:
    """Send failed message to Dead Letter Queue for later inspection / replay."""
    try:
        producer = _get_producer()
        if producer is None:
            return
        dlq_message = {
            "job_id":     job_id,
            "payload":    payload,
            "error":      error,
            "failed_at":  time.time(),
            "topic":      KAFKA_TOPIC_ANALYSIS,
        }
        producer.send(KAFKA_TOPIC_DLQ, key=job_id, value=dlq_message)
        producer.flush(timeout=3)
    except Exception:
        pass


def _run_inline(job_id: str, payload: dict[str, Any]) -> None:
    """Fallback: run the pipeline directly in a background thread."""
    from pipeline_queue.job_store import mark_processing, mark_done, mark_failed
    from pipeline_queue.consumer import _execute_job
    mark_processing(job_id)
    try:
        result = _execute_job(payload)
        mark_done(job_id, result)
    except Exception as e:
        mark_failed(job_id, str(e))


def publish(job_id: str, payload: dict[str, Any]) -> bool:
    """
    Publish a job to Kafka with retry + DLQ, or run inline if Kafka is off.
    Returns True if published to Kafka, False if fell back to inline.
    """
    producer = _get_producer()
    if producer is None:
        t = threading.Thread(target=_run_inline, args=(job_id, payload), daemon=True)
        t.start()
        return False

    message = {"job_id": job_id, "payload": payload}
    last_error = ""
    for attempt in range(1, KAFKA_MAX_RETRIES + 1):
        try:
            producer.send(
                KAFKA_TOPIC_ANALYSIS,
                key=job_id,
                value=message,
            )
            producer.flush(timeout=5)
            return True
        except Exception as e:
            last_error = str(e)
            _reset_producer()
            if attempt < KAFKA_MAX_RETRIES:
                # Exponential backoff with ±20% jitter
                wait = KAFKA_RETRY_BACKOFF * (2 ** (attempt - 1))
                wait = wait * (0.8 + random.random() * 0.4)
                time.sleep(wait)

    # All retries exhausted → DLQ + inline fallback
    _send_to_dlq(job_id, payload, last_error)
    t = threading.Thread(target=_run_inline, args=(job_id, payload), daemon=True)
    t.start()
    return False


def kafka_producer_health() -> dict:
    """Health check for the Kafka producer — used by /health endpoint."""
    if not KAFKA_ENABLED:
        return {"enabled": False, "status": "disabled"}
    producer = _get_producer()
    if producer is None:
        return {"enabled": True, "status": "unreachable", "bootstrap": KAFKA_BOOTSTRAP}
    return {
        "enabled":   True,
        "status":    "connected",
        "bootstrap": KAFKA_BOOTSTRAP,
        "topic":     KAFKA_TOPIC_ANALYSIS,
        "dlq_topic": KAFKA_TOPIC_DLQ,
    }
