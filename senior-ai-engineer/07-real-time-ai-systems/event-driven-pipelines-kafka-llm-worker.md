# Senior AI Engineer — Module 7
# Topic: Event-Driven AI Pipelines — Kafka + LLM Worker Pattern

---

## 1. Intuition

Not every AI task needs a synchronous response. Batch document processing, background analysis, scheduled report generation — these are async tasks.

Your Kafka/event-driven background is directly applicable here. The pattern is identical: producer → topic → consumer → output. The LLM is just a step in the consumer.

---

## 2. Core Concept

### Why Event-Driven for AI?

**Problem with synchronous LLM processing:**
A user uploads 500 documents. Processing each takes 3 seconds. Total: 25 minutes. Synchronous = user waits or times out.

**Event-driven solution:**
- User uploads → emit event → return immediately ("processing started")
- Kafka consumers pick up events → process documents asynchronously
- Completion event triggers notification → user sees results when ready

### Pattern: Event-Driven RAG Ingestion

```
Document Upload API
    ↓
Emit: {event: "document_uploaded", doc_id, s3_key, tenant_id}
    ↓ Kafka Topic: document-events
    ↓
Ingestion Consumer Group
  ├── Consumer 1: extracts text, chunks, embeds doc_001
  ├── Consumer 2: extracts text, chunks, embeds doc_002
  └── Consumer 3: extracts text, chunks, embeds doc_003
    ↓ Kafka Topic: ingestion-complete-events
    ↓
Notification Consumer: notify user "document ready"
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Producers                                                       │
│  Document upload API → document-events topic                    │
│  User query → query-events topic (for async analysis)           │
│  Admin trigger → batch-reindex topic                            │
└─────────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Kafka Topics                                                    │
│  document-events: {doc_id, s3_key, tenant_id, priority}        │
│  query-events: {query_id, query, user_id, doc_filter}          │
│  llm-results: {query_id, answer, tokens, cost}                  │
└─────────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Consumer Groups (horizontally scalable workers)                │
│  ingestion-workers: text extract → chunk → embed → vector store │
│  llm-workers: retrieve → LLM call → store result               │
│  notification-workers: send webhook / websocket update          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Code Skeleton (Production-Grade)

```python
from confluent_kafka import Producer, Consumer, KafkaError
import json

# Producer — emit document event on upload
class DocumentEventProducer:
    def __init__(self, bootstrap_servers: str):
        self.producer = Producer({"bootstrap.servers": bootstrap_servers})
    
    def emit_document_uploaded(self, doc_id: str, s3_key: str, tenant_id: str):
        event = {
            "event_type": "document_uploaded",
            "doc_id": doc_id,
            "s3_key": s3_key,
            "tenant_id": tenant_id,
            "timestamp": time.time()
        }
        self.producer.produce(
            topic="document-events",
            key=doc_id,  # partition by doc_id for ordering
            value=json.dumps(event).encode(),
            callback=self._delivery_report
        )
        self.producer.flush()
    
    def _delivery_report(self, err, msg):
        if err:
            logger.error(f"Event delivery failed: {err}")

# Consumer — ingestion worker
class IngestionWorker:
    def __init__(self, bootstrap_servers: str, group_id: str = "ingestion-workers"):
        self.consumer = Consumer({
            "bootstrap.servers": bootstrap_servers,
            "group.id": group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False  # manual commit for at-least-once semantics
        })
        self.consumer.subscribe(["document-events"])
    
    def run(self):
        logger.info("Ingestion worker started")
        while True:
            msg = self.consumer.poll(timeout=1.0)
            
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error(f"Consumer error: {msg.error()}")
                continue
            
            event = json.loads(msg.value().decode())
            
            try:
                self.process_event(event)
                self.consumer.commit(asynchronous=False)  # only commit on success
            except Exception as e:
                logger.error(f"Failed to process {event['doc_id']}: {e}")
                # Don't commit — message will be reprocessed
                # After max retries, goes to dead letter topic
    
    def process_event(self, event: dict):
        doc_id = event["doc_id"]
        s3_key = event["s3_key"]
        tenant_id = event["tenant_id"]
        
        logger.info(f"Processing document: {doc_id}")
        
        # Download
        pdf_bytes = s3_client.get_object(Bucket="documents", Key=s3_key)["Body"].read()
        
        # Extract + chunk + embed
        text = extract_text_from_pdf(pdf_bytes)
        chunks = chunk_document_standard(text)
        embeddings = embed_batch(chunks)
        
        # Upsert to vector store
        vector_store.upsert_batch(doc_id, chunks, embeddings, {"tenant_id": tenant_id})
        
        # Update status
        db.execute("UPDATE documents SET status='ready' WHERE doc_id=?", (doc_id,))
        
        # Emit completion event
        completion_producer.emit({
            "event_type": "ingestion_complete",
            "doc_id": doc_id,
            "tenant_id": tenant_id,
            "num_chunks": len(chunks)
        })
        
        logger.info(f"Document ingested: {doc_id}, {len(chunks)} chunks")

# Dead Letter Queue handling
def process_dead_letter(event: dict, error: str):
    db.execute("""
        INSERT INTO dead_letter_events (event_data, error_message, received_at)
        VALUES (?, ?, NOW())
    """, (json.dumps(event), error))
    
    alert_engineering(f"Dead letter event: doc_id={event.get('doc_id')} error={error}")
```

---

## 5. Example (From Your Projects — Senior Framing)

**AstroIntel — Enterprise Event-Driven Kafka Pipeline (actually implemented):**

AstroIntel's event-driven async pipeline is built and live, not a planned upgrade.

**Producer (`pipeline_queue/producer.py`) — enterprise features:**
```python
# Thread-safe singleton producer
_producer_lock = threading.Lock()

# Enterprise config
KafkaProducer(
    acks="all",                    # wait for all replicas — no data loss
    compression_type="gzip",       # reduce network payload
    request_timeout_ms=5000,
    max_block_ms=5000,
)

# Retry with exponential backoff + jitter
for attempt in range(1, KAFKA_MAX_RETRIES + 1):
    try:
        _producer.send(topic, key=job_id, value=message)
        _producer.flush(timeout=5)
        return True                # Kafka delivery confirmed
    except Exception:
        _reset_producer()          # reset on any failure
        wait = KAFKA_RETRY_BACKOFF * (2 ** (attempt - 1)) * (0.8 + random() * 0.4)
        sleep(wait)
# All retries exhausted → send to DLQ, fall back to inline
```

**Consumer (`pipeline_queue/consumer.py`) — enterprise features:**
```python
# Multi-worker consumer group
KAFKA_CONSUMER_WORKERS = 3   # 3 threads, Kafka distributes 3 partitions

KafkaConsumer(
    enable_auto_commit=False,  # manual commit after processing
    max_poll_records=1,        # one message per poll — no partial batches
    session_timeout_ms=30000,
    heartbeat_interval_ms=10000,
)

# Per-message retry loop
for attempt in range(1, KAFKA_MAX_RETRIES + 1):
    try:
        result = _execute_job(payload)
        mark_done(job_id, result)
        break
    except Exception as e:
        increment_retry(job_id)
        if attempt < KAFKA_MAX_RETRIES:
            sleep(backoff_with_jitter(attempt))

if not success:
    mark_failed(job_id, last_error)
    _send_to_dlq(dlq_producer, job_id, payload, last_error)

consumer.commit()  # only after processing complete
```

**Graceful shutdown:**
```python
_stop_event = threading.Event()   # signal all workers to drain and exit
atexit.register(stop_consumer)    # called on process exit
```

**Docker Compose — full enterprise stack:**
- `zookeeper` + `kafka` (confluentinc/cp-kafka:7.6.0) with 3 partitions
- `kafka-ui` at :8090 — message browser
- `redis` 7.2-alpine — cache DB0 + job store DB1
- `redis-commander` at :8091 — key browser for both DBs

In interview: "My Kafka experience from Java microservices maps directly. The consumer group pattern is identical — 3 worker threads each own 1 Kafka partition. Manual offset commit means no message is acknowledged until fully processed. DLQ routing after retry exhaustion is the same pattern as Java's @KafkaListener with a @RetryableTopic. The LLM pipeline is just another consumer payload type — all the durability and reliability patterns are the same."

**LangChain Service — batch re-indexing:**

If the document corpus needs re-indexing (new embedding model), an event-driven approach is ideal:
- Emit one `reindex_requested` event per document
- Consumer group processes them at max throughput
- Dead letter queue catches failures
- Progress tracked in DB

In interview: "My Kafka experience maps directly here. Document ingestion workers are Kafka consumer groups — same concept as processing payment events or order events in Java microservices. I scale the consumer group based on queue depth, and the dead letter queue handles failures. The LLM is just another I/O call within the consumer."

---

## 6. Trade-offs

Synchronous (simple):
+ Immediate response, simpler error handling, easier to debug
- Blocks user, timeouts on large tasks, single-server bottleneck

Event-driven (Kafka):
+ Scales horizontally, durable, handles spikes via queue buffering
- More complex, delayed response requires polling/webhook, Kafka operational overhead

RQ / Celery (simpler queue):
+ Easier to operate than Kafka, good enough for most teams
- Less durable, no replay, weaker delivery guarantees

---

## 7. Interview Questions (Senior Level)

- How does your Kafka experience apply to AI pipeline design?

  **Answer:** Directly — document upload triggers a Kafka event, a consumer group picks it up, runs the ingestion pipeline (chunk → embed → upsert), and emits a completion event. The LLM is just a new type of I/O call within the consumer. All the patterns I applied in Java (manual offset commit, idempotency via deduplication, dead letter queue for permanent failures, consumer group scaling) apply identically to AI pipelines. In Bench Resource Optimizer, CV upload events flow through a queue to ingestion workers — the same architecture I would use with Kafka, just implemented with Celery+Redis for operational simplicity at current scale.

- How do you handle message replay for an AI ingestion pipeline?

  **Answer:** Kafka's offset reset capability (`--from-beginning` or to a specific offset) enables replay of the full ingestion event stream. Before replaying, clear the affected tenant's vectors from the vector store and reset their metadata DB status to `pending`. Then reset the consumer group offset to the replay point — consumers will re-process all events from that point. The ingestion consumers must be idempotent (upsert, not insert, by doc_id + chunk_index) so replay doesn't create duplicate vectors. This is the standard pattern for recovering from a bad embedding model migration or a corrupted index.

- What is the dead letter queue pattern and when does it trigger?

  **Answer:** After a consumer exhausts its retry limit (e.g., 3 attempts with backoff) on a message that keeps failing, the message is moved to a dead letter topic (e.g., `document-events-dlq`) instead of being discarded. The DLQ accumulates messages that require human investigation — a monitor alert fires when DLQ depth grows. The root causes are typically: malformed document the parser can't handle, embedding API returning 400 errors for specific content, or a schema mismatch between producer and consumer. DLQ messages are inspected manually, the root cause is fixed, and messages are replayed after the fix.

- How do you scale Kafka consumers for LLM workloads?

  **Answer:** Add consumer instances up to the number of topic partitions (you can't have more active consumers than partitions in a consumer group). Scale based on consumer lag (queue depth) as the autoscaling signal — if lag grows past 1,000 messages, add consumers. For LLM-bound consumers (where the bottleneck is the LLM API latency, not CPU), you often hit LLM rate limits before partition limits — scale horizontally within your API rate limit, use separate API keys per consumer instance if needed to increase the effective rate limit across the pool.

- How do you implement at-least-once vs exactly-once semantics for document ingestion?

  **Answer:** At-least-once: set `enable.auto.commit=false`, manually commit offsets only after successful processing. Failed processing = no commit = message redelivered on consumer restart. Idempotent processing (upsert by doc_id + chunk_index) makes at-least-once safe — duplicate delivery produces the same result. Exactly-once requires Kafka Transactions: the consumer reads, the producer writes (to a result topic or transactional DB), and both operations are committed atomically. For document ingestion into a vector store, at-least-once with idempotent upserts is the practical choice — exactly-once adds significant complexity and most vector stores don't support distributed transactions anyway.

---

## 8. Answer Framework

Step 1 — Connect to your background:
"Event-driven AI pipelines are the same architecture I built in Java microservices with Kafka. Document upload → event → consumer group → LLM processing → completion event. The LLM is just a new type of I/O."

Step 2 — Explain the pattern:
"Producer emits document event. Ingestion consumer group picks up the event, processes asynchronously. Completion event triggers notification. User sees results when ready."

Step 3 — Reliability:
"Manual offset commit: only commit after successful processing. Failed processing = no commit = message reprocessed. After N retries, message goes to dead letter queue for investigation."

Step 4 — Scaling:
"Scale consumer group by adding more instances. Queue depth is the autoscaling signal: if document-events has > 1000 messages, add more ingestion workers."

Step 5 — Bridge:
"The discipline I apply to Kafka consumer design — idempotency, dead letter handling, offset management — all applies directly. I do not need to learn new patterns, just apply known patterns to AI workloads."

---

## 10. Advanced Follow-ups

Q1: How do you ensure idempotency in an LLM-based Kafka consumer?

Answer:
If a message is reprocessed (consumer restart, rebalance), the same document should not create duplicate vectors.
Implementation: before processing, check if the document already has status='ready' in the metadata DB. If yes, this is a duplicate delivery — skip processing and commit the offset.
For partial processing: use the chunk index as a deduplication key. Upsert by (doc_id, chunk_index) instead of insert — re-running the embedding produces the same vector (same text, same model), so upserting is safe.
LLM calls are harder to make idempotent because they are probabilistic. For document ingestion: the key insight is that the deterministic output (vectors) is what we store. The LLM call is for text extraction/summarization — if needed, cache by content hash.
This is identical to how you handle idempotency in Spring Batch job steps — check if the step already ran, skip if yes, upsert if uncertain.

Q2: How would you design the Kafka topic structure for a multi-tenant AI platform?

Answer:
Option 1: one topic per event type, tenant_id in the message payload, consumers filter by tenant.
Pros: simple topology. Cons: consumers process all tenants' messages, must filter in code.
Option 2: one topic per tenant per event type (`tenant-{id}-document-events`).
Pros: strict isolation, easy to scale per tenant.
Cons: topic proliferation at scale (1000 tenants = 1000 topics), management overhead.
Option 3 (recommended for most teams): shared topics with tenant_id as the partition key. All documents for the same tenant go to the same partition → ordered processing per tenant. Consumers partition-aware: can reserve partitions for high-priority tenants.
Partition by tenant_id ensures that all events for a tenant are processed in order by the same consumer — important if document ingestion must happen before queries are answered.

Q3: How do you handle back-pressure when the LLM API is slower than events are arriving?

Answer:
This is the classic producer/consumer speed mismatch — I handle it the same way as any overloaded downstream service.
First, Kafka provides natural buffering: events pile up in the topic, consumers process at the LLM API's sustainable rate. The queue depth increases but messages are not lost.
Second, consumer lag monitoring: track consumer group lag (how many messages are behind). Alert if lag exceeds a threshold (e.g., > 10 minutes of processing backlog).
Third, dynamic scaling: if lag is high, add more consumer instances. But be careful — more consumers = more concurrent LLM API calls = more likely to hit rate limits.
Fourth, rate limiter in consumer: implement a token bucket rate limiter in each consumer so that even at full concurrency, you stay within the LLM API's rate limit.
The LLM API rate limit is the bottleneck — the system is designed to buffer traffic from producers until the LLM API can process it. Kafka is the buffer.
