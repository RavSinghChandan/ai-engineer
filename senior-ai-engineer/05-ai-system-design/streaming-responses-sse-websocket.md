# Senior AI Engineer — Module 5
# Topic: Streaming Responses — SSE, WebSocket, Backpressure

---

## 1. Intuition

Streaming is not a nice-to-have. For any LLM response longer than 2 seconds, streaming is the difference between a product that feels fast and one that feels broken.

Senior engineers understand the full stack: LLM API → FastAPI → network → Angular. They design streaming that works correctly under load, handles partial failures, and respects backpressure.

---

## 2. Core Concept

### Server-Sent Events (SSE)
One-way stream from server to client over HTTP.
- Client opens a persistent HTTP connection
- Server pushes data as it becomes available
- Client receives and processes each chunk
- Best for: LLM token streaming, progress updates, agent status

### WebSocket
Bidirectional persistent connection.
- Both client and server can send at any time
- More complex: connection management, heartbeats, reconnection
- Best for: chat applications, real-time bidirectional communication
- Overkill for LLM streaming (unidirectional) — SSE is simpler and sufficient

### Backpressure
The mechanism that prevents a fast producer (LLM generating tokens) from overwhelming a slow consumer (client's rendering pipeline or network).
- HTTP/2 flow control handles this at the transport layer automatically
- Application-level: your streaming pipeline should not buffer unbounded token queues

---

## 3. Architecture (Your Stack: FastAPI + Angular)

```
LLM API (OpenAI) → stream=True
    ↓ yields tokens
FastAPI StreamingResponse
    ↓ SSE format: "data: {token}\n\n"
HTTP/1.1 chunked transfer or HTTP/2
    ↓
Angular HttpClient with observe:events + reportProgress
    ↓
Component updates via signals / zone-free change detection
    ↓
User sees tokens appear progressively
```

---

## 4. Code Skeleton (Production-Grade)

```python
# FastAPI SSE endpoint
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
import json

app = FastAPI()

async def stream_llm_tokens(query: str, context: str):
    """Generator that yields SSE-formatted tokens"""
    try:
        stream = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Answer from context only."},
                {"role": "user", "content": f"Context: {context}\n\nQuestion: {query}"}
            ],
            stream=True,
            max_tokens=500
        )
        
        full_response = ""
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                token = chunk.choices[0].delta.content
                full_response += token
                # SSE format: "data: <json>\n\n"
                yield f"data: {json.dumps({'token': token, 'type': 'token'})}\n\n"
                await asyncio.sleep(0)  # yield control to event loop
        
        # Send completion event with full response for logging
        yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

@app.get("/api/v1/query/stream")
async def stream_query(query: str, tenant_id: str, token: str):
    # Auth check
    user = verify_token(token)
    if not user:
        return {"error": "Unauthorized"}
    
    # Retrieve context
    context = await get_rag_context(query, tenant_id)
    
    return StreamingResponse(
        stream_llm_tokens(query, context),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # disable nginx buffering
        }
    )

# Multi-agent streaming (AstroIntel pattern)
async def stream_agent_pipeline(birth_profile: dict, question: str):
    """Stream agent progress events as they complete"""
    
    yield f"data: {json.dumps({'type': 'pipeline_start', 'total_agents': 5})}\n\n"
    
    # Run agents in parallel with asyncio
    async def run_agent_async(agent_name: str, agent_fn) -> dict:
        result = await asyncio.get_event_loop().run_in_executor(None, agent_fn, birth_profile, question)
        return {"agent": agent_name, "result": result}
    
    tasks = [
        run_agent_async("astrology", run_astrology_agent),
        run_agent_async("numerology", run_numerology_agent),
        run_agent_async("palmistry", run_palmistry_agent),
        run_agent_async("tarot", run_tarot_agent),
        run_agent_async("vastu", run_vastu_agent),
    ]
    
    # Yield each agent result as it completes (not waiting for all)
    for completed in asyncio.as_completed(tasks):
        result = await completed
        yield f"data: {json.dumps({'type': 'agent_complete', **result})}\n\n"
    
    yield f"data: {json.dumps({'type': 'pipeline_done'})}\n\n"
```

```typescript
// Angular SSE consumer (your frontend)
import { Injectable } from '@angular/core';
import { signal, WritableSignal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StreamingService {
  streamingResponse: WritableSignal<string> = signal('');
  isStreaming: WritableSignal<boolean> = signal(false);
  
  async streamQuery(query: string, tenantId: string, token: string): Promise<void> {
    this.streamingResponse.set('');
    this.isStreaming.set(true);
    
    const url = `/api/v1/query/stream?query=${encodeURIComponent(query)}&tenant_id=${tenantId}&token=${token}`;
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'token':
          this.streamingResponse.update(current => current + data.token);
          break;
        case 'done':
          this.isStreaming.set(false);
          eventSource.close();
          break;
        case 'error':
          console.error('Stream error:', data.message);
          this.isStreaming.set(false);
          eventSource.close();
          break;
      }
    };
    
    eventSource.onerror = () => {
      this.isStreaming.set(false);
      eventSource.close();
    };
  }
}
```

---

## 5. Example (From Your Projects)

**AstroIntel — SSE for agent pipeline progress:**

The agent pipeline takes 15 seconds. Without streaming, users stare at a loading spinner for 15 seconds.
With SSE: as each domain agent completes (asynchronously), the frontend receives an event and updates the neural graph visualization in real time. Users see agents completing one by one — the wait feels active, not passive.

This is exactly what `orchestrator.service.ts` manages — SSE stream from the backend, step tracking in signals, real-time agent status in the pipeline visualization.

In interview: "We used SSE to stream agent completion events in AstroIntel. Users see the neural graph nodes activate as each agent completes — a 15-second wait becomes a 15-second animated experience. Perceived performance is dramatically better even though the actual processing time is identical."

---

## 6. Trade-offs

SSE vs WebSocket for LLM streaming:
SSE: simpler, works over standard HTTP, automatic reconnect built into browsers, easier to implement in FastAPI.
WebSocket: needed for bidirectional real-time (e.g., user interrupts a generation mid-stream). For unidirectional LLM output, SSE is sufficient and simpler.

Streaming vs waiting for full response:
Streaming: better UX, user reads as it generates.
Full response: simpler implementation, easier to validate the complete output before showing. Use full response when output must pass a guardrail before being shown.

---

## 7. Interview Questions (Senior Level)

- How do you implement token streaming from an LLM API to an Angular frontend?

  **Answer:** FastAPI `StreamingResponse` with `text/event-stream` content type, yielding SSE-formatted chunks from the LLM's streaming API. Angular subscribes via `EventSource`, reads each `message` event, and appends tokens to a reactive signal or BehaviorSubject — the template updates automatically. In Bench Resource Optimizer, the plan generation endpoint streams tokens from DeepSeek; Angular renders the plan progressively as it generates, which reduces perceived latency significantly compared to waiting for the full response.

- What is the difference between SSE and WebSocket and when do you use each?

  **Answer:** SSE is unidirectional (server → client) over standard HTTP with automatic browser reconnection — simpler to implement and deploy, works through standard HTTP proxies. WebSocket is bidirectional full-duplex — needed when the client must also push data to the server in real-time (chat interruption, mid-stream cancellation signal). For LLM token streaming, SSE is almost always sufficient and simpler — the client doesn't need to send anything while the model is generating. Use WebSocket only if you need the user to be able to interrupt or modify the generation in real time.

- How do you handle a user closing the browser tab while streaming is in progress?

  **Answer:** *(Already covered in Advanced Follow-ups Q4 — skipped to avoid duplication.)*

- What is X-Accel-Buffering and why does it matter for SSE?

  **Answer:** Nginx buffers proxied responses by default — it waits for the upstream server to close the connection before forwarding the response to the client. This completely breaks SSE because the client never sees any tokens until the entire response is complete (defeating the purpose of streaming). Setting `X-Accel-Buffering: no` in the FastAPI response headers tells Nginx to forward each chunk immediately without buffering. This is the most common deployment gotcha when moving SSE from local development (no Nginx) to production (behind Nginx proxy).

- How do you add output guardrails (like topic filtering) to a streaming response?

  **Answer:** Buffer tokens until a sentence boundary (period, newline), then run the guardrail on the complete sentence before forwarding to the client — this catches violations at the sentence level without waiting for the full response. The trade-off: each sentence has a ~50ms moderation latency added to the stream. The alternative is post-stream validation with a client-side retraction event, but showing and then retracting content is a poor user experience for enterprise applications. In AstroIntel, the topic guardrail runs on the full response after the LLM call completes, before sending — we chose batch validation over streaming guardrails because the output is always short enough that full-response latency is acceptable.

---

## 8. Answer Framework

Step 1 — Explain the technology choice:
"For LLM token streaming, SSE is the right choice. It is unidirectional, works over standard HTTP, has built-in browser reconnection, and is simpler than WebSocket for this use case."

Step 2 — Describe the stack:
"FastAPI StreamingResponse with text/event-stream content type → HTTP with chunked transfer encoding → Angular EventSource API → Angular signals for reactive UI updates."

Step 3 — From your project:
"In AstroIntel, I used SSE to stream agent completion events. Each agent that finishes sends an event, the Angular frontend updates the neural graph visualization in real time."

Step 4 — Production concern:
"Nginx must have X-Accel-Buffering: no or it will buffer the stream and the user sees nothing until the buffer fills. This is a common deployment gotcha with SSE."

Step 5 — Guardrails on streams:
"For output guardrails on streams: buffer the full response, run the guardrail, then stream the validated response. Or: stream without guardrails for performance, and add a post-stream validation that flags violations asynchronously."

---

## 9. Advanced Follow-ups

Q1: How do you handle reconnection when an SSE stream is interrupted?

Answer:
The browser's EventSource API handles reconnection automatically — if the connection drops, it reconnects after a brief delay (default 3 seconds).
Server-side: implement the `id` field in SSE events. When the client reconnects, it sends a `Last-Event-ID` header with the last event ID it received. Your server resumes from that point.
Implementation: assign a sequential ID to each token chunk. On reconnect, look up the full response in cache (if completed) or resume streaming from the checkpoint.
For long-running agent pipelines: the agent results are idempotent — the same birth profile + question always produces the same result. On reconnection, the server can replay completed agent events from a short-term cache rather than re-running agents.
This is the same at-least-once delivery pattern used in Kafka consumers — you track the last processed offset and resume from there.

Q2: How do you add moderation to streaming output without buffering the full response?

Answer:
You cannot do real-time moderation on a token-by-token basis — moderation requires context (a single token is meaningless without surrounding context).
Two approaches.
First, sentence-level moderation: buffer tokens until a sentence-ending token (period, newline) is reached. Send the complete sentence to the moderation API. If it passes, stream it to the client. If it fails, stop streaming and send an error event. This adds latency per sentence but catches violations early.
Second, asynchronous moderation with rollback: stream all tokens to the client in real time (for UX). Simultaneously, run full moderation on the accumulating response. If moderation fails after 5 seconds of streaming, send a special "retract" event to the client that replaces the shown text with a moderation notice.
For most enterprise use cases, option 1 is more appropriate — you do not want to show and then retract content. For consumer-facing products where UX is paramount, option 2 is used by some platforms.

Q3: How do you test SSE endpoints?

Answer:
Three levels of testing.
Unit: mock the LLM client to return a predefined sequence of chunks. Assert that the generator yields the correct SSE-formatted events in the correct order.
Integration: use an async HTTP client (httpx with asyncio) to open a real SSE connection to your FastAPI test instance. Read and assert on each event.
Load test: use k6 or Locust to simulate 100 concurrent SSE connections. Measure: time-to-first-token (P95), stream completion rate (should be 100%), connection error rate, memory usage of the server under concurrent streams.
Angular side: use Jest with a mock EventSource implementation. Feed synthetic events and assert that signals update correctly.
Common test case: client closes connection mid-stream. Assert that the server detects the client disconnect and stops the LLM generation (saves tokens and cost).

Q4: How do you handle server-side cleanup when a client disconnects mid-stream?

Answer:
When a client closes the EventSource connection, the server's streaming generator needs to detect this and abort the LLM call.
In FastAPI with async generators: use `request.is_disconnected()` to check if the client has disconnected, and break the generator loop if so.
For the LLM call: if you are using the streaming API with `stream=True`, call `stream.close()` when you detect a disconnect. This cancels the in-flight API request and stops billing for tokens that will never be seen.
Why this matters: if a user closes their browser tab, you should stop generating tokens immediately. Without this, you generate and pay for the remaining tokens even though no one is reading them.
Implementation:
```python
async def stream_llm_tokens(query: str, context: str, request: Request):
    stream = openai.chat.completions.create(...)
    for chunk in stream:
        if await request.is_disconnected():
            stream.close()  # cancel the in-flight LLM call
            break
        token = chunk.choices[0].delta.content
        if token:
            yield f"data: {json.dumps({'token': token})}\n\n"
```

Q5: How do you handle streaming for multiple parallel agents (as in AstroIntel)?

Answer:
The challenge: 5 agents run in parallel, each completes at a different time. You want to stream each agent's result as it completes, not wait for all 5.
Pattern: use asyncio.as_completed() to yield results as they finish.
```python
async def stream_parallel_agents(birth_profile: dict, question: str):
    tasks = {
        asyncio.ensure_future(run_agent_async("astrology", ...)),
        asyncio.ensure_future(run_agent_async("numerology", ...)),
        # ...
    }
    for completed_task in asyncio.as_completed(tasks):
        result = await completed_task
        yield f"data: {json.dumps(result)}\n\n"
    yield f"data: {json.dumps({'type': 'all_done'})}\n\n"
```
Angular receives each agent completion event and updates the neural graph node to "completed" state — the user watches the graph come to life progressively.
This is the exact architecture in AstroIntel's `orchestrator.service.ts` + `agent-flow.component.ts` — SSE events driving signal updates driving DOM changes.
