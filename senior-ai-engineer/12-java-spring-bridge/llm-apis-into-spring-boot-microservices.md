# Senior AI Engineer — Module 12
# Topic: Integrating LLM APIs into Spring Boot Microservices

---

## 1. Intuition

This module is your competitive differentiator. Most AI engineers come from Python-only backgrounds. You come from Java/Spring Boot with production microservices experience.

This means you can bridge AI capabilities into enterprise Java systems — the dominant architecture in large Indian tech companies (TCS, Infosys, Wipro, Paytm, PhonePe, Flipkart backend).

---

## 2. Core Concept

### What Spring Boot Teams Need from AI Engineers

When a Java shop wants to add LLM capabilities, they face:
1. How do we call OpenAI from our Java service? (No Java LangChain equivalent at scale)
2. How do we make these calls resilient? (Our Java devs don't know LLM failure modes)
3. How do we manage cost? (LLM calls are expensive vs REST calls they're used to)
4. How do we integrate with our existing auth, logging, and observability?
5. How do we avoid blocking our Spring threads on slow LLM calls?

You answer all five. That's the value of your background.

---

## 3. Spring Boot AI Integration Patterns

### Pattern 1: Dedicated AI Service (recommended)

Keep the LLM calls in a dedicated Python FastAPI microservice. Spring Boot calls it via REST.

```
Spring Boot Service (Java)
    ↓ REST call to /v1/ai/analyze
AI Gateway Service (Python FastAPI)
    ↓
LLM API (OpenAI/Anthropic)
    ↓
Spring Boot receives structured response
```

**Advantages:**
- Java devs don't need to learn Python LLM patterns
- AI service scales independently
- Language-appropriate: Python has better LLM tooling
- Clean separation of concerns

**When to use:** Most enterprise integrations. Keep the Python AI layer thin (no business logic), let Spring Boot own business logic.

### Pattern 2: Spring AI (Java native)

Spring AI (from Pivotal) provides Java-native LLM integration. Direct OpenAI calls from Spring Boot.

```
@Service
public class DocumentAnalysisService {
    @Autowired
    private ChatClient chatClient;  // Spring AI
    
    public String analyze(String document, String question) {
        return chatClient.prompt()
            .user(u -> u.text(question).media(document))
            .call()
            .content();
    }
}
```

**When to use:** Simpler integrations, teams that want zero Python dependency, Spring-native AI agents.

### Pattern 3: Java OpenAI Client (raw SDK)

Direct OpenAI Java SDK calls — most control, no Spring AI abstraction.

---

## 4. Code Skeleton (Production-Grade Spring Boot + AI Integration)

### Java — AI Service Client with Resilience4j

```java
// pom.xml dependencies:
// spring-boot-starter-web, resilience4j-spring-boot2, 
// spring-boot-starter-webflux (for async), 
// com.fasterxml.jackson.core:jackson-databind

package com.company.ai;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.concurrent.CompletableFuture;
import java.util.Map;
import java.util.List;

@Service
public class AIGatewayClient {
    
    private final WebClient webClient;  // non-blocking HTTP client
    
    @Value("${ai.gateway.base-url}")
    private String aiGatewayBaseUrl;
    
    @Value("${ai.gateway.api-key}")
    private String apiKey;
    
    public AIGatewayClient(WebClient.Builder builder) {
        this.webClient = builder
            .baseUrl(aiGatewayBaseUrl)
            .defaultHeader("X-API-Key", apiKey)
            .build();
    }
    
    /**
     * Async LLM call — non-blocking.
     * Resilience4j handles retry + circuit breaker at the method level.
     * TimeLimiter ensures we never wait more than 30s for an AI call.
     */
    @CircuitBreaker(name = "ai-gateway", fallbackMethod = "aiCallFallback")
    @Retry(name = "ai-gateway")
    @TimeLimiter(name = "ai-gateway")
    public CompletableFuture<AIAnalysisResponse> analyzeDocument(
            String documentId, 
            String query, 
            String tenantId
    ) {
        AIAnalysisRequest request = AIAnalysisRequest.builder()
            .documentId(documentId)
            .query(query)
            .tenantId(tenantId)
            .build();
        
        return webClient.post()
            .uri("/v1/analyze")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .retrieve()
            .onStatus(HttpStatusCode::is5xxServerError, response -> 
                Mono.error(new AIServiceException("AI service 5xx: " + response.statusCode())))
            .onStatus(status -> status.value() == 429, response -> 
                Mono.error(new RateLimitException("AI service rate limited")))
            .bodyToMono(AIAnalysisResponse.class)
            .toFuture();
    }
    
    /**
     * Fallback when circuit is open or all retries exhausted.
     * Returns a degraded response rather than failing the user request.
     */
    public CompletableFuture<AIAnalysisResponse> aiCallFallback(
            String documentId, String query, String tenantId, Exception ex
    ) {
        log.warn("AI call fallback triggered for tenant={}, cause={}", tenantId, ex.getMessage());
        
        return CompletableFuture.completedFuture(
            AIAnalysisResponse.builder()
                .answer("AI analysis is temporarily unavailable. Please try again in a moment.")
                .degraded(true)
                .fallbackReason(ex.getMessage())
                .build()
        );
    }
}
```

### Resilience4j Configuration (application.yml)

```yaml
resilience4j:
  circuitbreaker:
    instances:
      ai-gateway:
        registerHealthIndicator: true
        slidingWindowSize: 10
        minimumNumberOfCalls: 5
        permittedNumberOfCallsInHalfOpenState: 3
        automaticTransitionFromOpenToHalfOpenEnabled: true
        waitDurationInOpenState: 60s
        failureRateThreshold: 50
        eventConsumerBufferSize: 10
  
  retry:
    instances:
      ai-gateway:
        maxAttempts: 3
        waitDuration: 2s
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
        retryExceptions:
          - com.company.ai.RateLimitException
          - java.net.SocketTimeoutException
        ignoreExceptions:
          - com.company.ai.BadRequestException
          - com.company.ai.AuthException
  
  timelimiter:
    instances:
      ai-gateway:
        timeoutDuration: 30s
        cancelRunningFuture: true
```

### Python FastAPI AI Gateway (the Python side)

```python
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
import openai
import logging
from typing import Optional

app = FastAPI(title="AI Gateway", version="1.0.0")
logger = logging.getLogger(__name__)

class AnalysisRequest(BaseModel):
    document_id: str
    query: str
    tenant_id: str

class AnalysisResponse(BaseModel):
    answer: str
    sources: list[str]
    tokens_used: int
    cost_usd: float
    model: str
    degraded: bool = False

@app.post("/v1/analyze", response_model=AnalysisResponse)
async def analyze_document(
    request: AnalysisRequest,
    api_key: str = Depends(verify_api_key)
):
    # Retrieve context
    chunks = retrieve_context(request.query, request.tenant_id, request.document_id)
    
    if not chunks:
        raise HTTPException(404, f"No content found for document {request.document_id}")
    
    context = "\n\n".join([c.text for c in chunks[:4]])
    
    # LLM call with full resilience
    response = llm_client.complete([
        {"role": "system", "content": "Answer questions using only the provided context."},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {request.query}"}
    ])
    
    cost = (response.prompt_tokens * 0.00015 + response.completion_tokens * 0.0006) / 1000
    
    return AnalysisResponse(
        answer=response.content,
        sources=[c.metadata.get("source", "") for c in chunks[:4]],
        tokens_used=response.prompt_tokens + response.completion_tokens,
        cost_usd=cost,
        model=response.model
    )

@app.get("/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}
```

### Async Document Processing (Spring Batch → Celery analogy)

```java
// In Spring Boot: submit async AI task and poll
@Service
public class AsyncAIProcessor {
    
    @Autowired
    private AIGatewayClient aiClient;
    
    @Autowired
    private TaskRepository taskRepository;
    
    // Submit — returns immediately with task ID
    public String submitAnalysis(String documentId, String query, String tenantId) {
        String taskId = UUID.randomUUID().toString();
        
        taskRepository.save(AITask.builder()
            .taskId(taskId)
            .documentId(documentId)
            .query(query)
            .tenantId(tenantId)
            .status("QUEUED")
            .createdAt(Instant.now())
            .build());
        
        // Non-blocking AI call
        aiClient.analyzeDocument(documentId, query, tenantId)
            .thenAccept(result -> {
                taskRepository.updateResult(taskId, result.getAnswer(), "COMPLETED");
            })
            .exceptionally(ex -> {
                taskRepository.updateStatus(taskId, "FAILED", ex.getMessage());
                return null;
            });
        
        return taskId;
    }
    
    // Poll — Spring controller calls this
    public TaskStatus getTaskStatus(String taskId, String tenantId) {
        AITask task = taskRepository.findByTaskIdAndTenantId(taskId, tenantId)
            .orElseThrow(() -> new TaskNotFoundException(taskId));
        
        return TaskStatus.builder()
            .taskId(taskId)
            .status(task.getStatus())
            .result(task.getStatus().equals("COMPLETED") ? task.getResult() : null)
            .error(task.getStatus().equals("FAILED") ? task.getError() : null)
            .build();
    }
}
```

---

## 5. Example (From Your Projects)

**Bridge Scenario:** Enterprise client runs Spring Boot microservices. They want to add document Q&A to their customer portal. They don't want to rewrite their Java backend in Python.

Architecture:
1. Customer portal (Angular) → Spring Boot API Gateway
2. Spring Boot calls Python AI Gateway (FastAPI) with Resilience4j circuit breaker
3. Python AI Gateway handles LLM calls, RAG, cost tracking
4. Result flows back: FastAPI → Spring Boot → Angular

Your value: you can design, build, and explain both sides. You understand Spring Boot's threading model, Resilience4j patterns, and WebClient async calls. AND you can build the FastAPI AI Gateway.

In interview: "In an enterprise Java shop, I'd implement LLM integration as a dedicated FastAPI AI Gateway called from Spring Boot via WebClient. Resilience4j provides circuit breaker and retry at the Spring Boot layer — the same patterns I use for any downstream service call. The FastAPI layer handles LLM-specific concerns: rate limiting, model fallback, cost tracking. This keeps AI complexity isolated from the Java business logic."

---

## 6. Trade-offs

Dedicated AI microservice (Python FastAPI):
+ Separation of concerns, Python AI tooling, independent scaling
- Network hop, operational complexity of two services

Spring AI (Java native):
+ No Python dependency, Spring native DI, single codebase
- Less mature ecosystem, fewer tools than Python LangChain

Direct OpenAI Java SDK:
+ Maximum control, no abstraction overhead
- More boilerplate, limited to what the Java SDK provides

---

## 7. Interview Questions (Senior Level)

- How would you integrate LLM APIs into an existing Spring Boot microservice?

  **Answer:** Two approaches: (1) Sidecar/internal service — call a FastAPI Python service from Spring Boot via WebClient. Spring handles business logic, auth, DB; FastAPI handles LLM orchestration, RAG, and agent logic. Clean separation, team specialization, independent scaling. (2) Direct Java SDK — use the OpenAI Java SDK or Spring AI to call the LLM API directly from Spring Boot. Simpler deployment, no second service, but sacrifices the Python LLM ecosystem (LangGraph, RAGAS, etc.). For AstroIntel-level complexity (multi-agent, LangGraph state machine), the sidecar pattern is clearly better. For simple single LLM calls (classify a support ticket, generate an email draft), direct Java SDK is sufficient.

- How does Resilience4j circuit breaker apply to LLM API calls?

  **Answer:** Apply `@CircuitBreaker` on the method that calls the LLM API. Configure failure rate threshold (e.g., 50% failures in a 10-call sliding window triggers OPEN state), wait duration in OPEN (60 seconds), and permitted calls in HALF_OPEN (2 probe calls). The fallback method returns a cached response, a static default, or a "service temporarily unavailable" message. For token-specific errors (rate limit 429), use `@Retry` with exponential backoff before the circuit breaker evaluates — retried calls that ultimately succeed don't count as failures. This is identical to Resilience4j protecting any slow or fallible downstream service — the LLM API is just another external dependency.

- Why use WebClient (reactive) instead of RestTemplate for LLM calls?

  **Answer:** LLM calls take 2-30 seconds — blocking a thread for that duration with RestTemplate ties up a thread from Spring's thread pool for the entire wait. Under concurrent load (20 users × 15-second LLM calls = 20 blocked threads), this exhausts a typical thread pool quickly. WebClient with Project Reactor doesn't block threads — the call is registered as a future and the thread is released to handle other requests. When the LLM responds, Reactor picks up any available thread to process the result. For SSE streaming from the LLM: WebClient's `.bodyToFlux(String.class)` streams each token as it arrives, which RestTemplate cannot do. WebClient is the Spring-native approach for any IO-bound call that might be slow.

- How do you handle long-running AI tasks in a Spring Boot endpoint?

  **Answer:** `@Async` with a `CompletableFuture` return type, backed by a dedicated thread pool (`ThreadPoolTaskExecutor`). The HTTP endpoint accepts the request, submits the task to the async executor, and returns immediately with a `202 Accepted` and a `task_id`. A separate `GET /tasks/{task_id}/status` endpoint polls the result stored in Redis by the async worker. This is equivalent to Python's Celery + FastAPI pattern — the conceptual model is identical, just different language. For streaming progress back to the client: use Spring's `SseEmitter` — the async worker emits events as each stage completes, and the client receives them via SSE without polling.

- What's the Spring Boot equivalent of Python's async/await for LLM calls?

  **Answer:** Project Reactor's `Mono` and `Flux` are the Spring Boot equivalent. `Mono<String>` = a single async value (like Python's `Awaitable[str]`). `Flux<String>` = a stream of values (like Python's `AsyncGenerator[str]`). `WebClient` returns `Mono` or `Flux` natively. To run parallel LLM calls (like `asyncio.gather`): `Mono.zip(agent1Call, agent2Call, agent3Call)` runs all three in parallel and combines results when all complete — equivalent to `asyncio.gather(coro1, coro2, coro3)`. Virtual threads in Java 21+ (Project Loom) offer a third option: write blocking code that runs on virtual threads, similar to Python's async/await in behavior without the explicit reactive syntax. In Python, Bench Resource Optimizer uses `asyncio.gather` to fire 30 day-plan LLM calls simultaneously — in Java this exact pattern would be `Flux.merge(List.of(dayPlan1, dayPlan2, ..., dayPlan30))` collecting into a list when all complete, with `WebClient` as the non-blocking HTTP client for each call.

---

## 8. Answer Framework

Step 1 — Architecture choice:
"For an enterprise Java shop, I'd implement AI as a dedicated Python FastAPI service called from Spring Boot via WebClient. Python has superior LLM tooling. Spring Boot owns business logic. Clean separation."

Step 2 — Resilience pattern:
"LLM calls get the same Resilience4j treatment as any external service: @CircuitBreaker opens after 50% failure rate in a 10-call window, @Retry with exponential backoff for 429/500 errors, @TimeLimiter at 30 seconds. Never let an LLM call block indefinitely."

Step 3 — Async:
"WebClient + CompletableFuture makes LLM calls non-blocking. The Spring thread isn't tied up waiting 3-10 seconds for an LLM response. For long-running analysis jobs, I use the submit-and-poll pattern: return a task_id immediately, the CompletableFuture runs in the background, client polls for completion."

Step 4 — Bridge value:
"My Java background means I can design the Spring Boot integration correctly — non-blocking WebClient, Resilience4j, @Async — which a pure Python AI engineer wouldn't know. And I can build the FastAPI AI gateway, which a pure Java engineer couldn't. That's the value of the full-stack AI engineer role."
