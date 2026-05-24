"""
Kafka Consumer — Enterprise Grade
=====================================
Multi-worker consumer group with graceful shutdown, retry, and DLQ routing.

Architecture:
  - KAFKA_CONSUMER_WORKERS threads each run their own KafkaConsumer in the
    same consumer group → Kafka distributes the 3 partitions across workers
  - Each worker processes one message at a time (no async complexity)
  - On failure: retry up to KAFKA_MAX_RETRIES with backoff, then send to DLQ
  - Graceful shutdown: _stop_event signals all workers to drain and exit

Environment variables:
  KAFKA_ENABLED          — true / false (default: false)
  KAFKA_BOOTSTRAP        — broker address (default: localhost:9092)
  KAFKA_TOPIC_ANALYSIS   — main topic (default: astrointel.analysis)
  KAFKA_TOPIC_DLQ        — dead letter topic (default: astrointel.analysis.dlq)
  KAFKA_GROUP_ID         — consumer group (default: astrointel-consumers)
  KAFKA_MAX_RETRIES      — per-message retry attempts (default: 3)
  KAFKA_RETRY_BACKOFF_MS — base backoff ms (default: 1000)
  KAFKA_CONSUMER_WORKERS — parallel consumer threads (default: 3)
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
KAFKA_GROUP_ID       = os.getenv("KAFKA_GROUP_ID",       "astrointel-consumers")
KAFKA_MAX_RETRIES    = int(os.getenv("KAFKA_MAX_RETRIES",       "3"))
KAFKA_RETRY_BACKOFF  = int(os.getenv("KAFKA_RETRY_BACKOFF_MS",  "1000")) / 1000.0
KAFKA_CONSUMER_WORKERS = int(os.getenv("KAFKA_CONSUMER_WORKERS", "3"))

_stop_event: threading.Event = threading.Event()
_worker_threads: list[threading.Thread] = []


# ── Job execution ─────────────────────────────────────────────────────────────

def _execute_job(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run the full analysis pipeline for a job payload.
    Called by both Kafka consumer workers AND the inline fallback in producer.py.
    Single source of truth for pipeline execution logic.
    """
    import uuid
    from graph.pipeline import run_pipeline
    import memory.store as store
    import cache.store as response_cache
    from cache.redis_store import redis_set
    from cache.semantic import semantic_set
    import session_store
    from routers.analysis import _record_metrics

    profile_dict    = payload.get("user_profile", {})
    final_question  = payload.get("user_question", "").strip()
    extra_questions = payload.get("questions", [])

    session_id = str(uuid.uuid4())
    initial_state: dict[str, Any] = {
        "user_profile":         profile_dict,
        "user_question":        final_question,
        "questions":            extra_questions,
        "selected_modules":     payload.get("selected_modules"),
        "module_inputs":        payload.get("module_inputs", {}),
        "geocode":              payload.get("geocode", {}),
        "normalized_questions": [],
        "focus_context":        {},
        "memory":               {},
        "consolidated":         {},
        "question_consensus":   [],
        "admin_review_data":    {},
        "remedies":             {},
        "admin_review":         {},
        "final_report":         {},
        "agent_log":            [],
        "errors":               [],
    }

    t_start     = time.time()
    final_state = run_pipeline(initial_state)
    t_end       = time.time()

    session_store.save(session_id, final_state, tenant_id=payload.get("tenant_id", ""))
    _record_metrics(session_id, final_state, t_start, t_end)

    admin_review = final_state.get("admin_review", {})
    cache_key    = response_cache.make_key(
        user_id       = "",
        questions     = extra_questions,
        user_question = final_question,
        profile       = profile_dict,
    )

    response_body: dict[str, Any] = {
        "session_id":           session_id,
        "status":               "completed",
        "cache_hit":            False,
        "cache_key":            cache_key,
        "focus_context":        final_state.get("focus_context", {}),
        "normalized_questions": final_state.get("normalized_questions", []),
        "admin_review":         admin_review,
        "agent_log":            final_state.get("agent_log", []),
        "hallucination_audit":  final_state.get("hallucination_audit", {}),
        "raw_outputs": {
            "astrology":    final_state.get("memory", {}).get("astrology"),
            "numerology":   final_state.get("memory", {}).get("numerology"),
            "palmistry":    final_state.get("memory", {}).get("palmistry"),
            "tarot":        final_state.get("memory", {}).get("tarot"),
            "vastu":        final_state.get("memory", {}).get("vastu"),
            "remedies":     final_state.get("remedies"),
            "consolidated": final_state.get("consolidated"),
        },
    }

    cache_meta = {
        "key_type":       "profile",
        "user_name":      profile_dict.get("full_name", ""),
        "date_of_birth":  profile_dict.get("date_of_birth", ""),
        "place_of_birth": profile_dict.get("place_of_birth", ""),
    }
    response_cache.set(cache_key, response_body,
                       ttl=response_cache.PROFILE_TTL_SECONDS, meta=cache_meta)
    redis_set(cache_key, response_body, ttl=response_cache.PROFILE_TTL_SECONDS)

    profile_key = response_cache.make_profile_key(profile_dict)
    if final_question:
        semantic_set(final_question, profile_key, response_body,
                     ttl=response_cache.PROFILE_TTL_SECONDS, meta=cache_meta)

    return response_body


# ── DLQ sender ────────────────────────────────────────────────────────────────

def _send_to_dlq(producer, job_id: str, payload: dict, error: str) -> None:
    try:
        dlq_msg = {
            "job_id":    job_id,
            "payload":   payload,
            "error":     error,
            "failed_at": time.time(),
        }
        producer.send(KAFKA_TOPIC_DLQ, key=job_id, value=dlq_msg)
        producer.flush(timeout=3)
    except Exception:
        pass


# ── Single worker loop ────────────────────────────────────────────────────────

def _worker_loop(worker_id: int) -> None:
    """One consumer thread. Polls topic, retries on failure, sends to DLQ."""
    from pipeline_queue.job_store import mark_processing, mark_done, mark_failed, increment_retry

    try:
        from kafka import KafkaConsumer, KafkaProducer
        consumer = KafkaConsumer(
            KAFKA_TOPIC_ANALYSIS,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            group_id=KAFKA_GROUP_ID,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            key_deserializer=lambda k: k.decode("utf-8") if k else None,
            auto_offset_reset="earliest",
            enable_auto_commit=False,        # manual commit after processing
            consumer_timeout_ms=1000,
            max_poll_records=1,              # one message per poll cycle
            session_timeout_ms=30000,
            heartbeat_interval_ms=10000,
        )
        # DLQ producer for this worker
        dlq_producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
    except Exception:
        return  # Kafka unavailable — exit silently

    while not _stop_event.is_set():
        try:
            for message in consumer:
                if _stop_event.is_set():
                    break

                data    = message.value or {}
                job_id  = data.get("job_id")
                payload = data.get("payload", {})

                if not job_id:
                    consumer.commit()
                    continue

                mark_processing(job_id)
                success = False
                last_error = ""

                for attempt in range(1, KAFKA_MAX_RETRIES + 1):
                    try:
                        result = _execute_job(payload)
                        mark_done(job_id, result)
                        success = True
                        break
                    except Exception as e:
                        last_error = str(e)
                        increment_retry(job_id)
                        if attempt < KAFKA_MAX_RETRIES:
                            wait = KAFKA_RETRY_BACKOFF * (2 ** (attempt - 1))
                            wait = wait * (0.8 + random.random() * 0.4)
                            time.sleep(wait)

                if not success:
                    mark_failed(job_id, last_error)
                    _send_to_dlq(dlq_producer, job_id, payload, last_error)

                consumer.commit()  # commit only after processing completes

        except Exception:
            time.sleep(2)

    try:
        consumer.close()
        dlq_producer.close(timeout=5)
    except Exception:
        pass


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def start_consumer() -> None:
    """Start KAFKA_CONSUMER_WORKERS consumer threads. No-op if KAFKA_ENABLED=false."""
    global _worker_threads
    if not KAFKA_ENABLED:
        return
    _stop_event.clear()
    for i in range(KAFKA_CONSUMER_WORKERS):
        t = threading.Thread(
            target=_worker_loop,
            args=(i,),
            daemon=True,
            name=f"kafka-consumer-{i}",
        )
        t.start()
        _worker_threads.append(t)


def stop_consumer() -> None:
    """Signal all consumer workers to stop gracefully."""
    _stop_event.set()


def consumer_health() -> dict:
    """Health status of consumer workers — for /health endpoint."""
    if not KAFKA_ENABLED:
        return {"enabled": False, "status": "disabled", "workers": 0}
    alive = sum(1 for t in _worker_threads if t.is_alive())
    return {
        "enabled":         True,
        "status":          "running" if alive > 0 else "stopped",
        "workers_alive":   alive,
        "workers_total":   KAFKA_CONSUMER_WORKERS,
        "topic":           KAFKA_TOPIC_ANALYSIS,
        "group_id":        KAFKA_GROUP_ID,
    }
