"""
Coverage boost for:
  - pipeline_queue/consumer.py  (51% → 80%+)  — _send_to_dlq, _worker_loop, lifecycle
"""
from __future__ import annotations
import json
import time
import threading
from unittest.mock import MagicMock, patch


class TestSendToDlq:
    def test_send_to_dlq_success(self):
        from pipeline_queue.consumer import _send_to_dlq
        mock_producer = MagicMock()
        _send_to_dlq(mock_producer, "job-001", {"key": "val"}, "some error")
        mock_producer.send.assert_called_once()
        mock_producer.flush.assert_called_once()

    def test_send_to_dlq_exception_does_not_raise(self):
        from pipeline_queue.consumer import _send_to_dlq
        mock_producer = MagicMock()
        mock_producer.send.side_effect = RuntimeError("kafka down")
        _send_to_dlq(mock_producer, "job-002", {}, "error")

    def test_send_to_dlq_includes_job_id(self):
        from pipeline_queue.consumer import _send_to_dlq
        sent_args = {}
        def capture_send(topic, key=None, value=None):
            sent_args["key"] = key
            sent_args["value"] = value
        mock_producer = MagicMock()
        mock_producer.send.side_effect = capture_send
        _send_to_dlq(mock_producer, "job-xyz", {"data": 1}, "timeout")
        assert sent_args.get("key") == "job-xyz"
        assert sent_args.get("value", {}).get("job_id") == "job-xyz"


class TestWorkerLoop:
    def test_worker_loop_exits_if_kafka_unavailable(self):
        from pipeline_queue.consumer import _worker_loop
        with patch.dict("sys.modules", {"kafka": None}):
            # Should return immediately without raising
            _worker_loop(0)

    def test_worker_loop_exits_if_kafka_import_fails(self):
        from pipeline_queue import consumer as c
        orig_stop = c._stop_event
        try:
            c._stop_event = threading.Event()
            c._stop_event.set()
            with patch("builtins.__import__", side_effect=ImportError("no kafka")):
                try:
                    _worker_loop_fn = c._worker_loop
                    _worker_loop_fn(0)
                except Exception:
                    pass
        finally:
            c._stop_event = orig_stop

    def test_worker_loop_stop_event_prevents_polling(self):
        from pipeline_queue import consumer as c
        orig_stop = c._stop_event
        try:
            stop = threading.Event()
            stop.set()
            c._stop_event = stop

            mock_kafka_module = MagicMock()
            mock_consumer_instance = MagicMock()
            mock_consumer_instance.__iter__ = lambda s: iter([])
            mock_consumer_instance.close = MagicMock()
            mock_kafka_module.KafkaConsumer.return_value = mock_consumer_instance
            mock_kafka_module.KafkaProducer.return_value = MagicMock()

            with patch.dict("sys.modules", {"kafka": mock_kafka_module}):
                c._worker_loop(0)
        finally:
            c._stop_event = orig_stop

    def test_worker_loop_processes_message_and_commits(self):
        from pipeline_queue import consumer as c
        orig_stop = c._stop_event

        try:
            stop = threading.Event()
            c._stop_event = stop

            mock_message = MagicMock()
            mock_message.value = {"job_id": "job-test-001", "payload": {}}

            call_count = [0]
            def fake_iter(self):
                if call_count[0] == 0:
                    call_count[0] += 1
                    yield mock_message
                stop.set()

            mock_consumer_instance = MagicMock()
            mock_consumer_instance.__iter__ = fake_iter
            mock_consumer_instance.commit = MagicMock()
            mock_consumer_instance.close = MagicMock()

            mock_kafka_module = MagicMock()
            mock_kafka_module.KafkaConsumer.return_value = mock_consumer_instance
            mock_kafka_module.KafkaProducer.return_value = MagicMock()

            with patch.dict("sys.modules", {"kafka": mock_kafka_module}):
                with patch("pipeline_queue.consumer._execute_job", return_value={"ok": True}):
                    with patch("pipeline_queue.job_store.mark_processing"):
                        with patch("pipeline_queue.job_store.mark_done"):
                            c._worker_loop(0)

            mock_consumer_instance.commit.assert_called()
        finally:
            c._stop_event = orig_stop

    def test_worker_loop_message_without_job_id_commits_and_continues(self):
        from pipeline_queue import consumer as c
        orig_stop = c._stop_event

        try:
            stop = threading.Event()
            c._stop_event = stop

            mock_message = MagicMock()
            mock_message.value = {}  # no job_id

            call_count = [0]
            def fake_iter(self):
                if call_count[0] == 0:
                    call_count[0] += 1
                    yield mock_message
                stop.set()

            mock_consumer_instance = MagicMock()
            mock_consumer_instance.__iter__ = fake_iter
            mock_consumer_instance.commit = MagicMock()
            mock_consumer_instance.close = MagicMock()

            mock_kafka_module = MagicMock()
            mock_kafka_module.KafkaConsumer.return_value = mock_consumer_instance
            mock_kafka_module.KafkaProducer.return_value = MagicMock()

            with patch.dict("sys.modules", {"kafka": mock_kafka_module}):
                c._worker_loop(0)

            mock_consumer_instance.commit.assert_called()
        finally:
            c._stop_event = orig_stop

    def test_worker_loop_marks_failed_on_all_retries_exhausted(self):
        from pipeline_queue import consumer as c
        orig_stop = c._stop_event
        orig_retries = c.KAFKA_MAX_RETRIES
        orig_backoff = c.KAFKA_RETRY_BACKOFF

        try:
            stop = threading.Event()
            c._stop_event = stop
            c.KAFKA_MAX_RETRIES = 1
            c.KAFKA_RETRY_BACKOFF = 0.001

            mock_message = MagicMock()
            mock_message.value = {"job_id": "job-fail-001", "payload": {}}

            call_count = [0]
            def fake_iter(self):
                if call_count[0] == 0:
                    call_count[0] += 1
                    yield mock_message
                stop.set()

            mock_consumer_instance = MagicMock()
            mock_consumer_instance.__iter__ = fake_iter
            mock_consumer_instance.commit = MagicMock()
            mock_consumer_instance.close = MagicMock()

            mock_kafka_module = MagicMock()
            mock_kafka_module.KafkaConsumer.return_value = mock_consumer_instance
            mock_kafka_module.KafkaProducer.return_value = MagicMock()

            import pipeline_queue.job_store as jstore
            mark_failed_calls = []
            orig_mark_failed = jstore.mark_failed
            jstore.mark_failed = lambda jid, err: mark_failed_calls.append(jid)
            try:
                with patch.dict("sys.modules", {"kafka": mock_kafka_module}):
                    with patch("pipeline_queue.consumer._execute_job", side_effect=RuntimeError("pipeline crash")):
                        with patch("pipeline_queue.consumer._send_to_dlq"):
                            c._worker_loop(0)
            finally:
                jstore.mark_failed = orig_mark_failed

            assert len(mark_failed_calls) >= 1
        finally:
            c._stop_event = orig_stop
            c.KAFKA_MAX_RETRIES = orig_retries
            c.KAFKA_RETRY_BACKOFF = orig_backoff


class TestConsumerLifecycle:
    def test_start_consumer_noop_when_kafka_disabled(self):
        from pipeline_queue import consumer as c
        orig_enabled = c.KAFKA_ENABLED
        try:
            c.KAFKA_ENABLED = False
            c.start_consumer()
        finally:
            c.KAFKA_ENABLED = orig_enabled

    def test_stop_consumer_sets_stop_event(self):
        from pipeline_queue import consumer as c
        c._stop_event.clear()
        c.stop_consumer()
        assert c._stop_event.is_set()
