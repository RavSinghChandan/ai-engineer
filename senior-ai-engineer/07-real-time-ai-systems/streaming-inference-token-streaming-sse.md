# Senior AI Engineer — Module 7
# Topic: Streaming Inference Pipelines — Token Streaming, Partial Renders, SSE

---

## 1. Intuition

Streaming is covered in Module 5 from the system design angle. This module covers the production engineering details: how token streaming works inside the LLM API, how to handle partial renders correctly, and how to build a robust SSE pipeline end-to-end.

This is the implementation depth that separates a senior engineer from someone who just read the docs.

---

## 2. Core Concept

### How Streaming Works Inside the LLM API

The LLM generates tokens one at a time (autoregressive decoding).
Without streaming: the API buffers all tokens, then sends the full response.
With streaming (`stream=True`): the API sends each token (or small group) as it is generated.

OpenAI streaming response format:
```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" world"},"finish_reason":null}]}
data: {"id":"chatcmpl-xxx","choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

### Partial Render Challenges

**Problem 1 — Partial JSON:**
If you stream JSON output from an LLM, you receive partial JSON that is not parseable until the stream is complete.
Solution: buffer until the stream ends, then parse. OR use structured partial rendering.

**Problem 2 — Partial Markdown:**
A bold word `**this**` rendered as tokens: `**`, `this`, `**`. If you render each token immediately, the user sees raw `**` before the markdown is resolved.
Solution: use a markdown renderer that handles incremental input (most modern renderers do).

**Problem 3 — Tool call streaming:**
When an agent calls a tool via function calling, the tool call JSON arrives as streaming tokens. You must buffer until the complete JSON is received before executing the tool.
Solution: detect `finish_reason == "tool_calls"`, buffer all delta tokens, then parse complete JSON.

---

## 3. Architecture (End-to-End Streaming Pipeline)

```
OpenAI API (stream=True)
    ↓ SSE: data: {delta}
FastAPI async generator
    ↓ SSE: data: {token, type, metadata}
Nginx (X-Accel-Buffering: no) 
    ↓ HTTP chunked transfer
Angular EventSource
    ↓ onmessage → signal update
DOM: progressive text render
```

---

## 4. Code Skeleton (Production-Grade)

```python
# FastAPI streaming with tool call handling
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

async def stream_with_tool_support(messages: list[dict], tools: list[dict] = None):
    """Stream LLM response, handling both text tokens and tool calls"""
    
    kwargs = {
        "model": "gpt-4o-mini",
        "messages": messages,
        "stream": True,
        "max_tokens": 500
    }
    if tools:
        kwargs["tools"] = tools
    
    stream = openai.chat.completions.create(**kwargs)
    
    # Buffers for accumulation
    text_buffer = ""
    tool_call_buffer = {}  # {index: {id, name, arguments_so_far}}
    
    for chunk in stream:
        choice = chunk.choices[0]
        delta = choice.delta
        finish_reason = choice.finish_reason
        
        # Text token
        if delta.content:
            text_buffer += delta.content
            yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"
        
        # Tool call streaming
        if delta.tool_calls:
            for tool_call_delta in delta.tool_calls:
                idx = tool_call_delta.index
                if idx not in tool_call_buffer:
                    tool_call_buffer[idx] = {"id": "", "name": "", "arguments": ""}
                
                if tool_call_delta.id:
                    tool_call_buffer[idx]["id"] = tool_call_delta.id
                if tool_call_delta.function.name:
                    tool_call_buffer[idx]["name"] = tool_call_delta.function.name
                if tool_call_delta.function.arguments:
                    tool_call_buffer[idx]["arguments"] += tool_call_delta.function.arguments
        
        # Stream complete
        if finish_reason == "stop":
            yield f"data: {json.dumps({'type': 'done', 'full_text': text_buffer})}\n\n"
        
        # Tool call complete — execute and stream result
        elif finish_reason == "tool_calls":
            for idx, call in tool_call_buffer.items():
                try:
                    tool_args = json.loads(call["arguments"])
                    yield f"data: {json.dumps({'type': 'tool_call', 'name': call['name'], 'args': tool_args})}\n\n"
                    
                    # Execute tool
                    tool_result = execute_tool(call["name"], tool_args)
                    yield f"data: {json.dumps({'type': 'tool_result', 'name': call['name'], 'result': str(tool_result)[:500]})}\n\n"
                    
                    # Continue conversation with tool result
                    messages.append({"role": "assistant", "tool_calls": [
                        {"id": call["id"], "type": "function",
                         "function": {"name": call["name"], "arguments": call["arguments"]}}
                    ]})
                    messages.append({"role": "tool", "content": json.dumps(tool_result), "tool_call_id": call["id"]})
                    
                    # Continue streaming with tool result in context
                    async for event in stream_with_tool_support(messages, tools):
                        yield event
                        
                except json.JSONDecodeError as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Tool call parse error: {e}'})}\n\n"
        
        await asyncio.sleep(0)  # yield event loop control

@app.post("/v1/stream")
async def stream_endpoint(request: Request, body: dict):
    query = body["query"]
    context = await get_rag_context(query, body["tenant_id"])
    
    messages = [
        {"role": "system", "content": "Answer from provided context."},
        {"role": "user", "content": f"Context: {context}\n\nQuestion: {query}"}
    ]
    
    return StreamingResponse(
        stream_with_tool_support(messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
```

```typescript
// Angular — robust SSE consumer with error recovery
import { signal, WritableSignal, computed, Signal } from '@angular/core';

interface StreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
  toolCalls: Array<{name: string; args: object}>;
}

@Injectable({ providedIn: 'root' })
export class StreamingService {
  private _state: WritableSignal<StreamState> = signal({
    text: '', isStreaming: false, error: null, toolCalls: []
  });
  
  state: Signal<StreamState> = this._state.asReadonly();
  
  async startStream(query: string, tenantId: string, authToken: string): Promise<void> {
    this._state.set({ text: '', isStreaming: true, error: null, toolCalls: [] });
    
    const url = `/v1/stream?query=${encodeURIComponent(query)}&tenant_id=${tenantId}&token=${authToken}`;
    let eventSource: EventSource | null = null;
    
    try {
      eventSource = new EventSource(url);
      
      eventSource.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'token':
            this._state.update(s => ({ ...s, text: s.text + data.content }));
            break;
          
          case 'tool_call':
            this._state.update(s => ({
              ...s,
              toolCalls: [...s.toolCalls, { name: data.name, args: data.args }]
            }));
            break;
          
          case 'done':
            this._state.update(s => ({ ...s, isStreaming: false }));
            eventSource?.close();
            break;
          
          case 'error':
            this._state.update(s => ({ ...s, isStreaming: false, error: data.message }));
            eventSource?.close();
            break;
        }
      };
      
      eventSource.onerror = () => {
        this._state.update(s => ({ ...s, isStreaming: false, error: 'Connection lost' }));
        eventSource?.close();
      };
      
    } catch (error) {
      this._state.update(s => ({ ...s, isStreaming: false, error: String(error) }));
    }
  }
  
  cancelStream(): void {
    // Signal to backend (close SSE connection — backend detects via request.is_disconnected())
    this._state.update(s => ({ ...s, isStreaming: false }));
  }
}
```

---

## 5. Example (From Your Projects)

**AstroIntel — multi-agent progress streaming:**

The orchestrator streams agent completion events using SSE. The Angular frontend receives events and updates the neural graph visualization — nodes glow as each agent completes.

Key implementation detail: agent completion events are non-text (JSON metadata), not text tokens. The SSE stream carries mixed event types: `agent_complete`, `pipeline_done`, and eventually the `token` stream from the final remedy generation.

In interview: "AstroIntel uses SSE for two different streaming concerns: agent pipeline progress (JSON events updating the visualization) and LLM token streaming for the final answer. The same SSE connection carries both event types, distinguished by the type field in the JSON payload."

---

## 6. Trade-offs

Stream everything:
+ Best UX for long responses
- Partial renders can show intermediate states, harder to apply guardrails

Buffer then stream:
+ Can validate full response before showing
- Adds latency proportional to response length

Mixed approach (most common):
+ Stream text tokens immediately, buffer tool calls and structured data
- More complex event handling in frontend

---

## 7. Interview Questions (Senior Level)

- How do you handle a streaming LLM response that contains function/tool calls?

  **Answer:** Buffer chunks until a complete tool call JSON is accumulated (tool calls arrive in delta chunks across multiple SSE events), execute the tool, then resume streaming the text response. The stream has two modes: text tokens (stream immediately to client) and tool call deltas (buffer silently, execute, inject result back into the next LLM call). In Bench Resource Optimizer, the plan generation can trigger tool calls mid-stream for real-time data lookups; the Angular frontend handles `tool_call_start` and `tool_call_end` event types to show a "searching..." indicator while the tool executes, then resumes showing text tokens.

- What is the Angular pattern for consuming an SSE stream and updating the UI reactively?

  **Answer:** Angular `EventSource` API subscribed in a service, with incoming message data parsed and pushed to a BehaviorSubject or Signal. The template uses `async` pipe or `effect()` to reactively update as tokens arrive. On component destroy, close the EventSource to prevent memory leaks. In AstroIntel, the streaming service updates Angular Signals with each token chunk — the template renders the accumulated text reactively without manual change detection. The same pattern applies to Bench Resource Optimizer's plan generation SSE stream.

- How do you measure TTFT (time to first token) for a streaming response?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- How do you implement stream cancellation when a user navigates away?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- What are the nginx configuration requirements for SSE to work correctly?

  **Answer:** Three requirements: `proxy_buffering off` (nginx must not buffer the proxied response), `X-Accel-Buffering: no` header in the FastAPI response (overrides nginx default), and `proxy_read_timeout` increased beyond the default 60 seconds (LLM responses can take 30+ seconds to complete). Missing `proxy_buffering off` is the most common deployment failure — the client receives all tokens in a single burst at the end instead of progressively, which means SSE is silently broken in production while working fine in local development without nginx.

---

## 8. Answer Framework

Step 1 — Explain the streaming architecture:
"LLM streams tokens as Server-Sent Events. FastAPI async generator yields each token as an SSE event. Angular EventSource receives events and updates a signal — Angular's change detection handles DOM updates reactively."

Step 2 — Tool call handling:
"Tool call arguments arrive as streaming JSON fragments. I buffer all fragments until finish_reason=tool_calls, then parse the complete JSON and execute the tool."

Step 3 — From your project:
"AstroIntel uses SSE for mixed event types: agent completion events (JSON) and text tokens. The type field distinguishes them. The Angular orchestrator service routes each event to the appropriate state update."

Step 4 — Production gotchas:
"Nginx must have X-Accel-Buffering: no, or it buffers the SSE stream and the user sees nothing until the buffer fills. This is the #1 deployment gotcha with SSE."

Step 5 — Metrics:
"I track TTFT (time from request to first SSE token) as a key latency metric. TTFT > 1.5 seconds needs investigation — usually caused by slow embedding or retrieval, not the LLM itself."

---

## 10. Advanced Follow-ups

Q1: How do you measure TTFT accurately in a production system?

Answer:
TTFT = time from HTTP request received to first content token emitted.
Server-side: in the streaming generator, record the timestamp when the first content delta is yielded. Compare to the request received timestamp.
```python
async def stream_with_ttft_tracking(messages: list, request_start: float):
    first_token = True
    for chunk in openai.chat.completions.create(..., stream=True):
        if chunk.choices[0].delta.content and first_token:
            ttft_ms = (time.time() - request_start) * 1000
            metrics.histogram("llm.ttft_ms", ttft_ms)
            first_token = False
        yield format_chunk(chunk)
```
Client-side: Angular marks the time when the first `token` type SSE event is received. This captures end-to-end TTFT including network latency.
Why it matters: TTFT is the perceived response speed for users. A response with 3s TTFT feels slow even if total generation is fast. Optimizing TTFT means optimizing the retrieval and prompt assembly pipeline, not the LLM itself.

Q2: How do you implement stream cancellation server-side?

Answer:
When a user navigates away, the Angular EventSource closes the connection. The server detects this via `await request.is_disconnected()`.
```python
async def cancellable_stream(messages: list, request: Request):
    stream = openai.chat.completions.create(model="gpt-4o-mini", messages=messages, stream=True)
    try:
        for chunk in stream:
            if await request.is_disconnected():
                stream.close()  # stop the in-flight LLM call
                break
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'token': chunk.choices[0].delta.content})}\n\n"
    finally:
        stream.close()
```
Why this matters: if you don't cancel the LLM call on disconnect, it continues generating tokens that no one will read — wasting tokens and money.
The pattern is the same as cancelling a database query when a client disconnects in Spring MVC — detect disconnect, cancel downstream resource usage.

Q3: How do you handle SSE reconnection correctly with `Last-Event-ID`?

Answer:
Browser EventSource auto-reconnects after a connection drop. It sends `Last-Event-ID: N` header with the last received event ID.
Server implementation: assign sequential IDs to each SSE event. On reconnect, look up where the client left off.
For LLM streaming: the LLM may have already completed and the full response is in the database. On reconnect, replay the buffered response from the last-event-id offset.
```python
@app.get("/v1/stream/{session_id}")
async def resumable_stream(session_id: str, request: Request):
    last_event_id = int(request.headers.get("Last-Event-ID", -1))
    
    # Check if stream already completed
    completed_response = get_from_cache(session_id)
    if completed_response:
        # Replay from offset
        tokens = completed_response.split()
        for i, token in enumerate(tokens):
            if i <= last_event_id:
                continue  # skip already-received tokens
            yield f"id: {i}\ndata: {json.dumps({'token': token})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return
    
    # Stream is still in progress — reconnect to live stream
    async for event in stream_in_progress(session_id, from_offset=last_event_id + 1):
        yield event
```
This gives users a seamless experience when their connection drops mid-stream.

---

## ★ YOUR 5 PROJECTS — Token Streaming Implementation

| Project | Streams? | SSE format |
|---------|----------|-----------|
| **AstroIntel 360°** | ✓ SSE | `{type: "session", session_id}` → `{type: "token", token}` → `{type: "agent_complete", agent}` → `{type: "done"}` → `[DONE]`. Angular EventSource drives neural graph node updates. |
| **Bench Resource Optimizer** | ✓ SSE | `/generate-plan/stream`. Each task line streamed as generated. TTFT < 1.5s. Resilient: `[DONE]` always sent even on LLM failure. |
| **RunbookAI** | ✗ | SQL < 100ms — no streaming needed. Instant response. |
| **Agentic Growth OS** | ✗ (polling) | Campaign execution: job_id → poll `/status` every 2s. Progress events in CampaignState. |
| **Universal Agent** | ✓ SSE | `/agent/stream`. Locked agent: sends `{type: "locked", message}` → closes stream. No LLM call when locked — zero token cost. |

**FastAPI SSE pattern (used in AstroIntel + Bench):**
```python
@router.get("/stream/{session_id}")
async def stream(session_id: str):
    async def event_gen():
        yield f"data: {json.dumps({'type':'session','session_id':session_id})}\n\n"
        async for chunk in llm.astream(prompt):
            yield f"data: {json.dumps({'type':'token','token':chunk.content})}\n\n"
        yield f"data: {json.dumps({'type':'done'})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_gen(), media_type="text/event-stream")
```

**Interview line:** "The `[DONE]` sentinel is critical — without it, the Angular `EventSource` connection stays open indefinitely after an LLM error. I always emit `[DONE]` in a `finally` block so the client closes its connection regardless of whether the LLM call succeeded. Small detail, prevents thousands of zombie connections in production."
