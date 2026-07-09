"""In-process job event broker.

Local-first stand-in for Redis pub/sub behind the same publish/subscribe
shape: the WebSocket layer subscribes per job, the pipeline publishes.
Events are ALSO persisted (agent_run_events) by the runner, so refreshing
the dashboard replays history and continues live without gaps.
"""
import asyncio
from collections import defaultdict
from typing import Any


class JobEventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, job_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=1000)
        async with self._lock:
            self._subscribers[job_id].add(queue)
        return queue

    async def unsubscribe(self, job_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers[job_id].discard(queue)
            if not self._subscribers[job_id]:
                del self._subscribers[job_id]

    async def publish(self, job_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            queues = list(self._subscribers.get(job_id, ()))
        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass  # Slow consumer: it will resync via DB replay on reconnect.


job_event_broker = JobEventBroker()
