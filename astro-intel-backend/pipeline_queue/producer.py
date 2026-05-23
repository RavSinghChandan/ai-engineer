"""
Kafka Producer (Phase 7)
=========================
Publishes analysis job messages to the Kafka topic.
Falls back to direct in-process execution when Kafka is unavailable
so the application NEVER breaks without Kafka.

Environment variables:
  KAFKA_ENABLED        — true / false (default: false)
  KAFKA_BOOTSTRAP      — broker address (default: localhost:9092)
  KAFKA_TOPIC_ANALYSIS — topic name (default: astrointel.analysis)

Fallback behaviour (KAFKA_ENABLED=false or broker unreachable):
  publish() runs the pipeline inline in a thread and stores the result
  in the job store directly — identical to the existing /run endpoint.
  The caller gets a job_id and can poll /job/{id} as normal.
"""
from __future__ import annotations
import json
import os
import threading
from typing import Any

KAFKA_ENABLED        = os.getenv("KAFKA_ENABLED",        "false").lower() == "true"
KAFKA_BOOTSTRAP      = os.getenv("KAFKA_BOOTSTRAP",      "localhost:9092")
KAFKA_TOPIC_ANALYSIS = os.getenv("KAFKA_TOPIC_ANALYSIS", "astrointel.analysis")

_producer = None   # lazy-loaded AIOKafkaProducer / KafkaProducer


def _get_producer():
    """Return a synchronous KafkaProducer, lazy-loaded. None if unavailable."""
    global _producer
    if _producer is not None:
        return _producer
    if not KAFKA_ENABLED:
        return None
    try:
        from kafka import KafkaProducer
        _producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=3000,
            max_block_ms=3000,
        )
        return _producer
    except Exception:
        _producer = None
        return None


def _run_inline(job_id: str, payload: dict[str, Any]) -> None:
    """
    Fallback: run the pipeline directly in a thread.
    This mirrors what the Kafka consumer would do — same code path.
    """
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
    Publish a job to Kafka, or run it inline if Kafka is disabled/unreachable.
    Returns True if published to Kafka, False if fell back to inline execution.
    """
    from pipeline_queue.job_store import mark_processing

    producer = _get_producer()
    if producer is None:
        # No Kafka — run inline in background thread (non-blocking for caller)
        t = threading.Thread(
            target=_run_inline,
            args=(job_id, payload),
            daemon=True,
        )
        t.start()
        return False

    try:
        message = {"job_id": job_id, "payload": payload}
        producer.send(KAFKA_TOPIC_ANALYSIS, value=message)
        producer.flush(timeout=3)
        return True
    except Exception:
        # Kafka send failed — fall back to inline
        t = threading.Thread(
            target=_run_inline,
            args=(job_id, payload),
            daemon=True,
        )
        t.start()
        return False
