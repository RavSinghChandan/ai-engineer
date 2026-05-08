# Senior AI Engineer — Module 4
# Topic: Agent State Management — Memory Types and Persistence (Senior-Only Topic)

---

## 1. Intuition

Stateless agents forget everything between calls. That is fine for single-turn Q&A.
For anything that resembles a real assistant — one that knows who you are, what you discussed last week, what tasks are in progress — you need a memory architecture.

Senior engineers design memory systems the same way they design database schemas: with explicit types, clear retention policies, and defined access patterns.

---

## 2. Core Concept

### Four Memory Types

**In-context memory (working memory):**
Everything in the current conversation's context window.
- Scope: current session only
- Capacity: limited by context window (128K tokens = ~100,000 words)
- Persistence: none — cleared when session ends
- Use: conversation history, current task state, retrieved RAG context

**External short-term memory (episodic):**
Recent conversations or events stored in a fast-access store (Redis, DB).
- Scope: recent N sessions or last M days
- Capacity: unlimited (external storage)
- Persistence: days to weeks
- Use: remember what user said in the last 5 conversations, recent task history

**External long-term memory (semantic):**
Summarized facts about the user, preferences, domain knowledge learned over time.
- Scope: permanent or very long retention
- Capacity: unlimited
- Persistence: months to years
- Use: user preferences, frequently accessed domain facts, personalization

**Procedural memory:**
Instructions and workflows the agent has learned to execute.
- Scope: system-level, shared across users
- Capacity: prompt library, tool registry
- Use: reusable task templates, learned best practices

### State in LangGraph
In LangGraph, agent state is the Python TypedDict that flows through the graph.
It represents in-context memory: everything the agent knows for this run.
External memory is accessed through tools or at graph initialization.

---

## 3. Why / When It Matters

Without external memory:
- User explains their context at the start of every conversation
- Agent cannot learn from past interactions
- No personalization — every user gets the same generic response

With proper memory architecture:
- Agent picks up where last session left off
- Agent knows user preferences without being told repeatedly
- Long-running tasks can be resumed after interruption

---

## 4. How It Works (Memory Architecture)

```
Session Start:
  Load user's long-term memory → inject as system context
  Load recent conversation summaries → inject as context

During Session:
  All messages stored in in-context memory (conversation history)
  Periodically: compress old history to free context space

Session End:
  Extract key facts from this session → update long-term memory
  Store full conversation (or summary) → short-term episodic store

Cross-session retrieval:
  User asks "what did we discuss about the project last week?"
  → search episodic store by embedding similarity or date filter
  → retrieve relevant past conversation
  → inject into context
```

---

## 5. Code Skeleton (Production-Grade)

```python
from datetime import datetime, timedelta
import json

# Memory manager
class AgentMemoryManager:
    def __init__(self, user_id: str, redis_client, vector_store):
        self.user_id = user_id
        self.redis = redis_client
        self.vector_store = vector_store
    
    # In-context: conversation history management
    def get_recent_history(self, max_tokens: int = 4000) -> list[dict]:
        history = self.redis.lrange(f"history:{self.user_id}", 0, -1)
        messages = [json.loads(m) for m in reversed(history)]
        
        total_tokens = 0
        trimmed = []
        for msg in reversed(messages):
            msg_tokens = count_tokens(msg["content"])
            if total_tokens + msg_tokens > max_tokens:
                break
            trimmed.insert(0, msg)
            total_tokens += msg_tokens
        return trimmed
    
    def add_message(self, role: str, content: str):
        message = {"role": role, "content": content, "timestamp": datetime.utcnow().isoformat()}
        self.redis.rpush(f"history:{self.user_id}", json.dumps(message))
        self.redis.expire(f"history:{self.user_id}", 7 * 24 * 3600)  # 7-day TTL
    
    # Long-term: user facts and preferences
    def get_user_profile(self) -> dict:
        profile = self.redis.get(f"profile:{self.user_id}")
        return json.loads(profile) if profile else {}
    
    def update_user_profile(self, new_facts: dict):
        profile = self.get_user_profile()
        profile.update(new_facts)
        self.redis.set(f"profile:{self.user_id}", json.dumps(profile))
    
    # Episodic: semantic search over past conversations
    def store_conversation_summary(self, summary: str, session_id: str):
        vector = embed_text(summary)
        self.vector_store.add(
            id=session_id,
            text=summary,
            vector=vector,
            metadata={
                "user_id": self.user_id,
                "timestamp": datetime.utcnow().isoformat(),
                "session_id": session_id
            }
        )
    
    def recall_relevant_memory(self, query: str, top_k: int = 3) -> list[str]:
        query_vector = embed_text(query)
        results = self.vector_store.search(
            query_vector, top_k=top_k,
            filter={"user_id": self.user_id}  # only this user's memories
        )
        return [r["text"] for r in results]
    
    # Session end: extract and store facts
    def close_session(self, conversation: list[dict]):
        summary = call_llm(
            "Extract key facts, decisions, and preferences from this conversation as a concise summary.",
            "\n".join([f"{m['role']}: {m['content']}" for m in conversation])
        )
        
        # Extract structured facts for user profile
        facts_json = call_llm(
            "Extract any user preferences or personal facts as JSON. Return {} if none found.",
            f"Conversation summary: {summary}"
        )
        try:
            facts = json.loads(facts_json)
            if facts:
                self.update_user_profile(facts)
        except json.JSONDecodeError:
            pass
        
        import uuid
        self.store_conversation_summary(summary, session_id=str(uuid.uuid4()))

# Stateful agent with memory
class MemoryAwareAgent:
    def __init__(self, user_id: str):
        self.memory = AgentMemoryManager(user_id, redis_client, vector_store)
    
    def respond(self, user_message: str) -> str:
        # Build context from memory
        user_profile = self.memory.get_user_profile()
        recent_history = self.memory.get_recent_history()
        relevant_memories = self.memory.recall_relevant_memory(user_message)
        
        system_prompt = f"""You are a helpful assistant.
        
User profile: {json.dumps(user_profile) if user_profile else 'New user'}

Relevant past context: {chr(10).join(relevant_memories) if relevant_memories else 'No prior context'}"""
        
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(recent_history)
        messages.append({"role": "user", "content": user_message})
        
        response = call_llm_messages(messages)
        
        # Store this exchange
        self.memory.add_message("user", user_message)
        self.memory.add_message("assistant", response)
        
        return response
```

---

## 6. Example (From Your Projects — Senior Framing)

**AstroIntel — stateless agents with stateful session:**

Domain agents are stateless — they receive inputs, produce outputs, and retain nothing.
But the session has state: birth profile, user question, and all 5 agent outputs flow through the LangGraph state object.

If I were to add persistent memory:
- Short-term: store the last 5 analyses for a user in Redis with 30-day TTL. When the user returns, show them "Based on your previous consultation on March 15..."
- Long-term: extract key life themes from past analyses (relationship focus, career concerns) and personalize new analyses based on these themes.
- Procedural: store domain-specific interpretation rules that improve over time based on admin review feedback.

In interview: "AstroIntel agents are stateless within their execution, but I designed the LangGraph state object to carry all necessary context. For a production version with returning users, I would add Redis-backed session memory and vector-based episodic memory for cross-session personalization."

---

## 7. Trade-offs

In-context only:
+ Simplest, no external storage, consistent within session
- Forgets everything on session end, context grows and becomes expensive

Redis short-term:
+ Fast retrieval, simple, good for recent history
- TTL means data expires, not suitable for long-term facts

Vector-based episodic:
+ Semantic retrieval of relevant memories, scalable
- More complex, storage cost, privacy considerations for sensitive conversations

---

## 8. Interview Questions (Senior Level)

- How do you design a memory system for an AI assistant that serves the same user over months?
- What are the privacy implications of storing user conversation history and how do you handle them?
- How do you prevent the context window from growing unbounded in a long-running conversation?
- How does agent memory in LangGraph work at a technical level?
- When would you use vector-based episodic memory vs simple key-value storage for user preferences?

---

## 9. Answer Framework

Step 1 — Name the four memory types:
"Agent memory has four types: in-context (current session), external short-term episodic (recent conversations), long-term semantic (persistent user facts), and procedural (system-level learned behaviors)."

Step 2 — Map to storage technology:
"In-context = conversation object. Short-term = Redis with TTL. Long-term facts = Redis or DB. Episodic retrieval = vector store with user_id filter."

Step 3 — From your project:
"AstroIntel agents are stateless. The LangGraph state object holds in-context memory for the current run. For persistent memory across sessions, I would add Redis for recent history and a vector store for episodic recall."

Step 4 — Privacy:
"User conversation history is sensitive. I apply retention policies: short-term history expires after 7 days, long-term facts are anonymized and non-conversational, and users can delete their history via a GDPR-compliant endpoint."

Step 5 — Context management:
"History grows without bound in long conversations. I apply token-budget trimming: keep the most recent exchanges, compress older history to a summary, and always maintain the user profile at the top of the context."

---

## 10. Advanced Follow-ups

Q1: How do you handle memory in a multi-user, multi-tenant system?

Answer:
Strict isolation at every level.
Key structure: all memory is namespaced by user_id and tenant_id. `history:{tenant_id}:{user_id}` in Redis, `filter: {tenant_id: X, user_id: Y}` in vector store queries.
No cross-user memory: an agent running for User A must never load User B's memory. This is enforced by passing the user_id and tenant_id from the authenticated request context — never from user input.
Authorization: the memory manager receives its scope at instantiation time from the authenticated session. It cannot be overridden by what the user says in the conversation.
Audit: every memory read and write is logged with user_id, tenant_id, and timestamp for compliance and debugging.

---

Q2: How do you decide what facts to extract and store in long-term memory?

Answer:
Not everything the user says should be stored as a permanent fact.
Signals that something should be stored long-term: the user explicitly states a preference ("I prefer responses in bullet points"), the user provides stable personal context ("I'm a Java developer working on microservices"), or a fact is referenced multiple times across conversations.
What should NOT be stored: opinions expressed in a frustrated moment, sensitive personal details not relevant to the assistant's function, anything that would feel creepy to the user if revealed later ("I noticed you mentioned 3 months ago that you were stressed about a project").
Implementation: run an extraction prompt at session end that specifically targets preference and context signals, not conversational details. Ask: "What persistent facts about this user's preferences or context would help a future session?" Only store the structured output.
User control: provide a "memory" page in your application where users can view and delete stored facts. This is both good UX and GDPR-required.

---

Q3: How does LangGraph handle checkpointing and state persistence?

Answer:
LangGraph supports checkpointing through a Checkpointer — an interface for saving and loading graph state between node executions.
Built-in checkpointers: MemorySaver (in-memory, ephemeral), SqliteSaver (file-based, persistent), and custom implementations for Redis or PostgreSQL.
How it works: after each node completes, LangGraph saves the current state to the checkpointer. If the graph is interrupted or restarted, it loads the last checkpoint and continues from that node.
For multi-session continuity: use a persistent checkpointer (Sqlite, Postgres) keyed by thread_id (user session ID). When the user returns, load their thread's last state and resume the conversation.
This is exactly what enables "human in the loop" interruptions: the agent can pause mid-run, wait for human input, and resume when the human responds — the state is preserved across the pause.

---

Q4: What are the privacy and compliance implications of agent memory?

Answer:
Four compliance concerns.
First, GDPR right to erasure: if your agent stores user conversation history, users have the right to request deletion. Build a delete_user_memory endpoint that wipes all keys for that user across all memory stores.
Second, data minimization: store only what is necessary for the assistant's function. Do not store sensitive personal data (health info, financial details) unless explicitly required and consented to.
Third, retention policies: implement automatic TTL on all conversational memory. Short-term history: 7-30 days. Long-term facts: user-controlled with a default of 1 year.
Fourth, access logging: log every memory read with user_id, timestamp, and what data was accessed. This is your audit trail for compliance review.
From a Java/Spring perspective: the same data handling patterns you apply to a user profile database apply to agent memory. Memory stores are just another data store — treat them with the same rigor as your user_profiles table.

---

Q5: How do you prevent memory from becoming stale or contradictory over time?

Answer:
Three mechanisms.
First, fact confidence scoring: when extracting facts to long-term memory, score them with high/medium/low confidence. A single mention = medium. User explicitly stated = high. Inferred from behavior = low.
Second, fact reconciliation: when adding a new fact that contradicts a stored fact, do not silently overwrite. Flag the contradiction and use the newer fact (more recent is more accurate) while logging the change.
Third, periodic refresh: for long-term users, run a periodic review of stored facts. Ask the LLM to evaluate whether stored preferences still seem consistent with recent conversation style. Facts with no supporting signal from recent sessions get a lower confidence score over time.
The anti-pattern: blindly accumulating facts without validation. A user who said "I prefer bullet points" 2 years ago and has since switched to preferring paragraphs will have an outdated preference causing frustrating responses. Recency-weighted confidence prevents this.
