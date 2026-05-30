import asyncio
from fastapi import APIRouter, Request, Response, HTTPException, Query
from platforms.instagram.auth import INSTAGRAM_VERIFY_TOKEN
from platforms.instagram.webhook import parse_webhook_payload, verify_signature
from graph.pipeline import pipeline

router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.get("/instagram")
async def instagram_verify(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
):
    """Meta webhook verification handshake."""
    if hub_mode == "subscribe" and hub_verify_token == INSTAGRAM_VERIFY_TOKEN:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/instagram")
async def instagram_webhook(request: Request):
    """Receive Instagram comments and DMs; run the SalesFlow pipeline."""
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")

    if not verify_signature(body, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    messages = parse_webhook_payload(payload)

    results = []
    for msg in messages:
        state = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda m=msg: pipeline.invoke({"raw_message": m, "agent_log": []}),
        )
        results.append({
            "sender_id": state.get("sender_id"),
            "intent": state.get("intent"),
            "funnel_stage": state.get("funnel_stage"),
            "sent": state.get("sent"),
            "agent_log": state.get("agent_log", []),
        })

    return {"processed": len(results), "results": results}
