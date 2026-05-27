"""
Kafka producer — enterprise event streaming layer.

Events published:
  bench.cv.uploaded   — when a CV is successfully parsed
  bench.plan.requested — when a learning plan is generated
  bench.dlq           — dead-letter queue for events that fail 3 delivery attempts

Pattern: fire-and-forget with retry (3 attempts, exponential backoff).
         If all retries fail, the event is written to the DLQ topic so it
         is never silently dropped — a core reliability guarantee.

Why this matters at Senior Engineer level:
  CV upload triggers downstream workflows: manager notification, skills-gap
  analytics, headcount planning dashboards. These consumers are decoupled
  from the API — they subscribe to Kafka topics independently. If the
  analytics service is down, events queue up in Kafka (7-day retention)
  and replay when it recovers. No data loss, no tight coupling.

Graceful degradation: if Kafka is unavailable (local dev without Docker),
  publish() logs a warning and returns False — the API request still
  succeeds. This is intentional: CV parsing should not fail because Kafka
  is not running.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from typing import Any, Optional

logger = logging.getLogger("bench.kafka")

_producer = None


def _get_producer():
    """Lazy-init Kafka producer. Returns None if kafka-python not installed
    or broker is unreachable."""
    global _producer
    if _producer is not None:
        return _producer

    try:
        from kafka import KafkaProducer
        from kafka.errors import NoBrokersAvailable

        servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        _producer = KafkaProducer(
            bootstrap_servers=servers.split(","),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            retries=3,
            acks="all",          # wait for all in-sync replicas — durability guarantee
            linger_ms=5,         # batch small messages for throughput
            request_timeout_ms=5000,
            api_version_auto_timeout_ms=3000,
        )
        logger.info("Kafka producer connected: %s", servers)
    except Exception as exc:
        logger.warning("Kafka unavailable — events will not be published: %s", exc)
        _producer = None

    return _producer


def publish(
    topic_env_key: str,
    event_type: str,
    payload: dict,
    key: Optional[str] = None,
    max_retries: int = 3,
) -> bool:
    """
    Publish an event to a Kafka topic.

    Args:
        topic_env_key: env var name holding the topic name
                       e.g. "KAFKA_CV_TOPIC" → "bench.cv.uploaded"
        event_type:    string label e.g. "cv.parsed", "plan.generated"
        payload:       event data dict
        key:           Kafka partition key (use user_id for ordering per user)
        max_retries:   attempts before routing to DLQ

    Returns True on success, False if Kafka unavailable.
    """
    producer = _get_producer()
    if producer is None:
        return False

    topic = os.getenv(topic_env_key, topic_env_key)
    envelope = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "ts": time.time(),
        "payload": payload,
    }

    for attempt in range(1, max_retries + 1):
        try:
            future = producer.send(topic, value=envelope, key=key)
            future.get(timeout=5)  # block until ack received
            logger.info("kafka publish ok topic=%s event=%s key=%s", topic, event_type, key)
            return True
        except Exception as exc:
            wait = 2 ** attempt
            logger.warning(
                "kafka publish attempt %d/%d failed topic=%s: %s — retrying in %ds",
                attempt, max_retries, topic, exc, wait,
            )
            if attempt < max_retries:
                time.sleep(wait)

    # All retries exhausted — send to DLQ
    _send_to_dlq(envelope, topic, "max_retries_exceeded")
    return False


def _send_to_dlq(envelope: dict, original_topic: str, reason: str) -> None:
    """Route a failed event to the dead-letter queue."""
    producer = _get_producer()
    if producer is None:
        logger.error("DLQ unavailable — event lost: %s", envelope.get("event_id"))
        return

    dlq_topic = os.getenv("KAFKA_DLQ_TOPIC", "bench.dlq")
    dlq_event = {
        **envelope,
        "dlq_reason": reason,
        "original_topic": original_topic,
        "dlq_ts": time.time(),
    }
    try:
        producer.send(dlq_topic, value=dlq_event)
        producer.flush(timeout=3)
        logger.warning("Event routed to DLQ: event_id=%s reason=%s", envelope.get("event_id"), reason)
    except Exception as exc:
        logger.error("DLQ write failed — event permanently lost: %s", exc)


def kafka_ping() -> bool:
    """Health check — returns True if Kafka producer is connected."""
    return _get_producer() is not None


def reset_producer():
    """Force producer re-creation (used in tests)."""
    global _producer
    if _producer is not None:
        try:
            _producer.close(timeout=1)
        except Exception:
            pass
    _producer = None
