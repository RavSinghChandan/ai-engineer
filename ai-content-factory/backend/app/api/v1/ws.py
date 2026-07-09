"""WebSocket endpoint for live job execution.

Protocol: connect to /ws/jobs/{job_id}?token=<access_token>&after_id=<n>.
The server replays persisted events after `after_id`, then streams live
events — the replay/live fan-in guarantees no gaps and no duplicates.
"""
import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.exceptions import UnauthorizedError
from app.core.logging import get_logger
from app.core.security import TOKEN_TYPE_ACCESS, decode_token
from app.db.session import session_scope
from app.orchestration.events import job_event_broker
from app.repositories.content import EventRepository, VideoJobRepository
from app.repositories.users import UserRepository

router = APIRouter()
logger = get_logger(__name__)

_WS_POLICY_VIOLATION = 1008


@router.websocket("/ws/jobs/{job_id}")
async def job_events_ws(websocket: WebSocket, job_id: str, token: str = "", after_id: int = 0) -> None:
    # Authenticate + authorize before accepting.
    try:
        payload = decode_token(token, TOKEN_TYPE_ACCESS)
        async with session_scope() as session:
            user = await UserRepository(session).get(payload["sub"])
            job = await VideoJobRepository(session).get(job_id)
            if user is None or job is None:
                raise UnauthorizedError("Unknown user or job")
            project = await job.awaitable_attrs.project
            if project.owner_id != user.id:
                raise UnauthorizedError("Not your job")
    except UnauthorizedError:
        await websocket.close(code=_WS_POLICY_VIOLATION)
        return

    await websocket.accept()
    queue = await job_event_broker.subscribe(job_id)
    try:
        # 1) Replay history (subscription is already active → no gap).
        last_id = after_id
        async with session_scope() as session:
            for event in await EventRepository(session).replay(job_id, after_id):
                last_id = event.id
                await websocket.send_json(
                    {
                        "id": event.id,
                        "job_id": event.job_id,
                        "agent": event.agent_name,
                        "type": event.event_type,
                        "message": event.message,
                        "payload": event.payload,
                        "created_at": event.created_at.isoformat(),
                    }
                )
        # 2) Live stream, dropping anything already replayed.
        while True:
            event = await queue.get()
            if event["id"] <= last_id:
                continue
            last_id = event["id"]
            await websocket.send_json(event)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        await job_event_broker.unsubscribe(job_id, queue)
        with contextlib.suppress(RuntimeError):
            await websocket.close()
