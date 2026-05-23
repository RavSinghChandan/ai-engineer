"""
Kafka Consumer (Phase 7)
=========================
Polls the Kafka topic and executes pipeline jobs.
Runs as a background thread started from main.py lifespan.

When KAFKA_ENABLED=false:  consumer thread is never started — zero overhead.
When KAFKA_ENABLED=true:   consumer polls the topic and calls _execute_job()
                            for each message, updating job_store on completion.

_execute_job() is also called directly by producer.py in fallback mode
(no Kafka), so the pipeline logic lives in exactly one place.
"""
from __future__ import annotations
import json
import os
import threading
import time
from typing import Any

KAFKA_ENABLED        = os.getenv("KAFKA_ENABLED",        "false").lower() == "true"
KAFKA_BOOTSTRAP      = os.getenv("KAFKA_BOOTSTRAP",      "localhost:9092")
KAFKA_TOPIC_ANALYSIS = os.getenv("KAFKA_TOPIC_ANALYSIS", "astrointel.analysis")
KAFKA_GROUP_ID       = os.getenv("KAFKA_GROUP_ID",       "astrointel-consumers")

_consumer_thread: threading.Thread | None = None


def _execute_job(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run the full analysis pipeline for a job payload.
    Returns the response_body dict that /run would have returned.
    Called by both the Kafka consumer loop AND the inline fallback in producer.py.
    """
    import uuid
    from graph.pipeline import run_pipeline
    import memory.store as store
    import cache.store as response_cache
    from cache.redis_store import redis_set
    from cache.semantic import semantic_set
    import session_store
    from metrics.collector import get_collector
    from routers.analysis import _record_metrics

    profile_dict   = payload.get("user_profile", {})
    final_question = payload.get("user_question", "").strip()
    extra_questions = payload.get("questions", [])

    session_id = str(uuid.uuid4())
    initial_state: dict[str, Any] = {
        "user_profile":        profile_dict,
        "user_question":       final_question,
        "questions":           extra_questions,
        "selected_modules":    payload.get("selected_modules"),
        "module_inputs":       payload.get("module_inputs", {}),
        "geocode":             payload.get("geocode", {}),
        "normalized_questions":[],
        "focus_context":       {},
        "memory":              {},
        "consolidated":        {},
        "question_consensus":  [],
        "admin_review_data":   {},
        "remedies":            {},
        "admin_review":        {},
        "final_report":        {},
        "agent_log":           [],
        "errors":              [],
    }

    t_start = time.time()
    final_state = run_pipeline(initial_state)
    t_end = time.time()

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

    # Store in both caches
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


def _consumer_loop() -> None:
    """Background thread: poll Kafka and process jobs."""
    from pipeline_queue.job_store import mark_processing, mark_done, mark_failed

    try:
        from kafka import KafkaConsumer
        consumer = KafkaConsumer(
            KAFKA_TOPIC_ANALYSIS,
            bootstrap_servers=KAFKA_BOOTSTRAP,
            group_id=KAFKA_GROUP_ID,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="earliest",
            consumer_timeout_ms=1000,
        )
    except Exception:
        return  # Kafka not available — exit silently

    while True:
        try:
            for message in consumer:
                data   = message.value
                job_id = data.get("job_id")
                payload = data.get("payload", {})
                if not job_id:
                    continue
                mark_processing(job_id)
                try:
                    result = _execute_job(payload)
                    mark_done(job_id, result)
                except Exception as e:
                    mark_failed(job_id, str(e))
        except Exception:
            time.sleep(2)   # brief pause before retry on poll error


def start_consumer() -> None:
    """Start the Kafka consumer background thread. No-op if KAFKA_ENABLED=false."""
    global _consumer_thread
    if not KAFKA_ENABLED:
        return
    if _consumer_thread and _consumer_thread.is_alive():
        return
    _consumer_thread = threading.Thread(
        target=_consumer_loop,
        daemon=True,
        name="kafka-consumer",
    )
    _consumer_thread.start()
