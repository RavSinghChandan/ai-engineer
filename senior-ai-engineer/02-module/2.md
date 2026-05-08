# Senior AI Engineer — Module 2
# Topic: Context Window — Engineering Around Limits

---

## 1. Intuition

The context window is the LLM's working memory. It is finite.
Junior engineers hit the limit and get confused. Senior engineers design systems that never hit it — or handle it gracefully when they do.

Context management is one of the most common real-world engineering challenges in production LLM systems.

---

## 2. Core Concept

- Context window: the maximum number of tokens the model can process in a single request (input + output combined)
- GPT-4o: 128K tokens | Claude Sonnet 3.5: 200K tokens | Gemini 1.5 Pro: 1M tokens
- Everything you send — system prompt, conversation history, RAG context, user message — consumes context

Why it matters in production:
- Long conversations accumulate history until they exceed the limit
- Large documents cannot be sent in a single call
- RAG systems must balance chunk size vs context budget
- Each extra token costs money and adds latency

### Context budget anatomy (typical RAG chat):
```
Total context: 128K tokens
  System prompt: ~500 tokens (3.9%)
  Conversation history: ~2,000 tokens (1.6%)
  Retrieved RAG context: ~6,000 tokens (4.7%)
  User query: ~100 tokens (0.1%)
  Reserved for output: ~1,000 tokens (0.8%)
  Buffer headroom: ~118,400 tokens unused
```
For most use cases, 128K is more than enough — BUT chat history grows without bound if not managed.

---

## 3. Why / When It Matters

Context limit becomes a production problem when:
- Long multi-turn conversations exceed history limit
- Summarization or analysis of large documents (annual reports, legal contracts)
- Batch processing with large accumulated context
- RAG that retrieves too many chunks

Signs your system is hitting limits:
- `context_length_exceeded` API errors
- Sudden quality degradation in long conversations (model "forgets" earlier context)
- Latency spike after many conversation turns (more tokens = slower TTFT)

---

## 4. How It Works (Context Management Strategies)

```
Strategy 1 — Sliding Window
  Keep only last N turns of conversation
  Simple, predictable — loses early context

Strategy 2 — Summarization Memory
  When history reaches threshold, summarize old turns with LLM
  Keeps key facts, discards verbatim history
  Costs one extra LLM call but compresses context dramatically

Strategy 3 — Token Budget Management
  Measure token count before every call
  Dynamically truncate history to fit within budget
  Always preserve: system prompt + latest user message + critical context

Strategy 4 — Chunking + Map-Reduce for large documents
  Split document into chunks
  Summarize each chunk independently (map)
  Combine summaries with final LLM call (reduce)
  Handles documents of any size
```

---

## 5. Code Skeleton (Production-Grade)

```python
import tiktoken

def count_tokens(text: str, model: str = "gpt-4o") -> int:
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

# Sliding window with token budget enforcement
def trim_history_to_budget(
    history: list[dict],
    system_prompt: str,
    user_message: str,
    max_context_tokens: int = 100_000,
    reserve_output_tokens: int = 1_000
) -> list[dict]:
    budget = max_context_tokens - reserve_output_tokens
    used = count_tokens(system_prompt) + count_tokens(user_message)
    
    trimmed = []
    # Walk history newest-first, add until budget is consumed
    for turn in reversed(history):
        turn_tokens = count_tokens(turn["content"])
        if used + turn_tokens > budget:
            break
        trimmed.insert(0, turn)
        used += turn_tokens
    
    return trimmed

# Summarization memory — compress old history when it grows too large
def compress_history(history: list[dict], threshold_tokens: int = 8_000) -> list[dict]:
    total_tokens = sum(count_tokens(t["content"]) for t in history)
    
    if total_tokens < threshold_tokens:
        return history
    
    # Summarize the older half
    mid = len(history) // 2
    old_turns = history[:mid]
    recent_turns = history[mid:]
    
    summary_prompt = "Summarize this conversation concisely, preserving key facts:\n\n"
    summary_prompt += "\n".join([f"{t['role']}: {t['content']}" for t in old_turns])
    
    summary = call_llm("You are a conversation summarizer.", summary_prompt)
    
    summary_message = {"role": "system", "content": f"[Earlier conversation summary]: {summary}"}
    return [summary_message] + recent_turns

# Map-Reduce for large documents
def summarize_large_document(document: str, chunk_size: int = 4000) -> str:
    enc = tiktoken.encoding_for_model("gpt-4o")
    tokens = enc.encode(document)
    
    chunks = [enc.decode(tokens[i:i+chunk_size]) for i in range(0, len(tokens), chunk_size)]
    
    # Map: summarize each chunk
    chunk_summaries = [
        call_llm("Summarize this section concisely.", chunk)
        for chunk in chunks
    ]
    
    # Reduce: combine summaries
    combined = "\n\n".join(chunk_summaries)
    final_summary = call_llm(
        "You are synthesizing a final summary from section summaries.",
        f"Section summaries:\n{combined}\n\nProvide a comprehensive final summary."
    )
    return final_summary
```

---

## 6. Example (From Your Projects)

**AstroIntel — context budget per agent:**

Each domain agent received:
- System prompt: ~400 tokens (role + output schema)
- Birth profile (user input): ~200 tokens
- User question: ~50 tokens
- Total input: ~650 tokens, well within any model's context window

The design decision: each agent operated independently with a small, focused context.
No agent accumulated conversation history — they were stateless analytical agents, not chat agents.
This is an important architectural point: not all LLM components need conversation history. Analytical agents can be stateless.

**Chat-style systems (the harder case):**
For a chatbot that remembers conversation, the standard production pattern is:
- Keep last 10 turns in raw history (~2,000 tokens)
- Summarize older turns and store the summary as a system message
- Add a nightly job that compresses summaries older than 7 days to a user profile fact sheet

In interview: "We avoided the context limit problem in AstroIntel by designing stateless agents. For chat systems, I use summarization memory to compress history when it exceeds 6,000 tokens."

---

## 7. Trade-offs

Sliding window (keep last N):
+ Simple, predictable, zero extra cost
- Loses early context — model forgets decisions made in turn 1 by turn 50

Summarization memory:
+ Preserves key facts across long conversations
- Costs one extra LLM call per compression event, summary may lose important detail

Larger context window model:
+ No management needed for most use cases
- More expensive per request (larger context = higher price tier), slower TTFT

Map-Reduce for documents:
+ Handles unlimited document size
- Multiple LLM calls per document, information in different chunks may not cross-reference well

---

## 8. Interview Questions (Senior Level)

- How do you handle a user conversation that has grown to 200 turns in your chatbot?
- Design a system to summarize a 500-page legal document using an LLM with a 128K token context.
- What happens to LLM quality when you approach the context limit?
- How do you manage context when running multiple agents that need to share state?
- Why is a 1M token context window not the solution to all context management problems?

---

## 9. Answer Framework

Step 1 — Acknowledge the constraint:
"Context window is the LLM's working memory — it is finite and every token in it costs money."

Step 2 — Explain your management strategy:
"I manage context at three levels: token budget enforcement before each call, sliding window for conversation history, and summarization compression when history exceeds threshold."

Step 3 — Address the document case:
"For large documents I use map-reduce: chunk the document, summarize each chunk independently, then combine summaries in a final call."

Step 4 — From your project:
"In AstroIntel, agents were designed stateless — no conversation history. Each call had a fixed, bounded context. This eliminated context management complexity entirely at the agent level."

Step 5 — Scale consideration:
"At scale, I track average context size per request as a metric. If it grows over time, it signals either conversation history accumulation or prompt bloat — both need attention before they become cost or quality problems."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: A 1M token context window exists. Why not just dump everything in?

Answer:
Three reasons.
First, cost: 1M tokens in = 1M tokens billed. For a typical RAG query where only 5,000 tokens are relevant, sending 1M is paying 200x for unnecessary context.
Second, the "lost in the middle" problem: research shows LLMs perform better when relevant information is near the beginning or end of the context. Information buried in the middle of a 1M token context is effectively invisible to the model — quality degrades without a clear error signal.
Third, latency: TTFT scales with input size. A 1M token context has 10-20 second TTFT on current models. That is not acceptable for interactive use cases.
The right approach is still targeted retrieval — only put what the model needs in the context, not everything you have.

---

Q2: How do you share context between multiple agents without duplicating it?

Answer:
Use a shared state object that each agent reads from and writes to, rather than passing the full context to each agent.
In LangGraph, this is the graph state — a dictionary that flows through all nodes. Each agent receives only the keys it needs, not the full state.
For the AstroIntel architecture: the birth profile and user question are in shared state. Each domain agent reads them but does not copy the full conversation history into its own context — it only gets what it needs.
For cross-agent communication: agents write their outputs back to state with specific keys. The next agent reads those outputs, not the entire previous agent's prompt + response.
This keeps per-agent context small and avoids the O(n²) context explosion you get if each agent naively accumulates all previous agents' full outputs.

---

Q3: How do you handle a user who pastes a 50-page document into your chat interface?

Answer:
Never process it in a single context window — even if the model supports it, it is wasteful and slow.
Detect large input at the API layer: if input exceeds 10,000 tokens, route to the document processing pipeline.
Chunk the document (e.g., 1,000 tokens with 200-token overlap for continuity).
Index chunks into the vector store for this session — create an ephemeral, session-scoped RAG index.
From that point, treat it as a RAG query: user asks questions, retrieve relevant chunks, generate answers.
This approach: scales to any document size, only charges for relevant context per query, and responds in seconds instead of minutes.
Edge case: if the user asks for a full summary, use map-reduce. If they ask specific questions, use RAG. The routing logic decides which path to take.

---

Q4: What is the "lost in the middle" problem and how do you mitigate it?

Answer:
Research from Stanford (Liu et al., 2023) showed that LLMs recall information much better when it appears near the beginning or end of the context. Information in the middle of a long context is frequently ignored or misremembered.
This has direct implications for RAG: if you retrieve 10 chunks and dump them in order, the most relevant chunk may land in the middle and be effectively invisible.
Mitigation strategies:
First, reranking: after retrieval, rerank chunks by relevance and put the highest-scored chunks at the start and end of the context, not in the middle.
Second, fewer, better chunks: top-3 highly relevant chunks outperforms top-10 mixed quality chunks. Less is more.
Third, context compression: summarize or extract key sentences from each chunk before inserting — reduces padding and keeps the relevant signal density high.
In production: I always rerank before context assembly and limit to top-3 to top-5 chunks. This is one of the highest-ROI RAG improvements with minimal added complexity.

---

Q5: How do you handle context window limits in a multi-turn agentic workflow?

Answer:
Agentic workflows accumulate context fast: initial prompt + tool outputs + reasoning + tool results + more reasoning.
Three patterns I use.
First, scratchpad vs long-term memory separation: agents write reasoning to a scratchpad that is compacted after each step. Only key decisions and facts are written to long-term state.
Second, tool result summarization: when a tool returns a large result (e.g., a database query returning 200 rows), the agent summarizes it before adding to state — not the raw result.
Third, checkpoint compression: at defined checkpoints in a long workflow, the accumulated state is summarized and the raw history is discarded. The agent continues with the summary, not the full trace.
In LangGraph terms: this is a node that runs "state compression" periodically — same as the summarization memory pattern in chat, applied to agent state.
Without this, long agentic workflows hit context limits and fail mid-task — which is worse than failing immediately because you have already consumed significant compute.
