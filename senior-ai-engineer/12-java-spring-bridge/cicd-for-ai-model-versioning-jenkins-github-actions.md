# Senior AI Engineer — Module 12
# Topic: CI/CD for AI Systems — Model Versioning in Jenkins/GitHub Actions

---

## 1. Intuition

AI systems have a different CI/CD challenge than standard software: the model itself is a versioned artifact. A code deployment that changes the prompt or model can silently degrade quality — it passes unit tests but produces worse answers.

Senior AI engineers build CI/CD pipelines that validate model quality, not just code correctness.

---

## 2. Core Concept

### How AI CI/CD Differs from Standard CI/CD

| Standard CI/CD | AI CI/CD |
|---|---|
| Tests validate: code correctness | Tests validate: code + model output quality |
| Breaking change: crashes or wrong output | Breaking change: subtly worse answers (no crash) |
| Rollback trigger: error rate spike | Rollback trigger: quality metric regression |
| Versioned artifact: Docker image | Versioned artifact: Docker image + prompt version + model ID |
| Deploy confidence: tests pass | Deploy confidence: tests pass + eval score above threshold |

### What Gets Versioned in an AI System

```
Git repo:
  - Application code
  - Prompt templates (prompts/v{N}/*.txt)
  - RAG pipeline configuration
  - Evaluation test suite

Model registry (S3 / HuggingFace Hub / MLflow):
  - Fine-tuned model adapters (LoRA weights)
  - Embedding model checkpoints
  - FAISS indexes (if pre-built)

Database:
  - Prompt version history
  - Evaluation run results
  - Model deployment audit log
```

---

## 3. CI/CD Pipeline Design

### Pipeline Stages for an AI Service

```
Stage 1: Code Quality
├── Unit tests (pytest)
├── Type checking (mypy)
├── Linting (ruff/flake8)
└── Security scan (bandit)

Stage 2: Integration Tests
├── RAG pipeline smoke test (known Q&A pairs)
├── Agent tool execution test
└── Streaming endpoint test

Stage 3: AI Evaluation (the critical stage)
├── Run RAGAS eval on test set
├── Compare faithfulness, relevancy vs baseline
├── Check cost-per-query estimate
└── GATE: fail if any metric < threshold

Stage 4: Build + Push
├── Build Docker image
├── Tag with: git-sha + prompt-version + model-version
└── Push to container registry

Stage 5: Deploy (Blue-Green or Canary)
├── Deploy new version alongside current
├── Route 10% traffic to new version
├── Monitor quality metrics for 30 minutes
└── GATE: promote to 100% if metrics stable, rollback if degraded
```

---

## 4. Code Skeleton (GitHub Actions + Eval Gate)

### GitHub Actions Workflow

```yaml
# .github/workflows/ai-service-ci.yml
name: AI Service CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/ai-service
  EVAL_THRESHOLD_FAITHFULNESS: "0.85"
  EVAL_THRESHOLD_RELEVANCY: "0.80"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio mypy ruff ragas
      
      - name: Lint and type check
        run: |
          ruff check .
          mypy src/ --ignore-missing-imports
      
      - name: Unit tests
        run: pytest tests/unit/ -v --tb=short
      
      - name: Integration tests (no LLM calls)
        run: pytest tests/integration/ -v --tb=short -m "not llm"

  evaluate:
    runs-on: ubuntu-latest
    needs: test
    # Only run eval on main branch pushes (expensive)
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"
      
      - name: Install dependencies
        run: pip install -r requirements.txt ragas datasets
      
      - name: Run AI evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          python scripts/run_eval.py \
            --test-set tests/eval/test_questions.jsonl \
            --output eval_results.json \
            --threshold-faithfulness ${{ env.EVAL_THRESHOLD_FAITHFULNESS }} \
            --threshold-relevancy ${{ env.EVAL_THRESHOLD_RELEVANCY }}
      
      - name: Upload eval results
        uses: actions/upload-artifact@v3
        with:
          name: eval-results-${{ github.sha }}
          path: eval_results.json
      
      - name: Check eval gate
        run: |
          python scripts/check_eval_gate.py \
            --results eval_results.json \
            --fail-on-regression

  build-push:
    runs-on: ubuntu-latest
    needs: evaluate
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Get version info
        id: version
        run: |
          PROMPT_VERSION=$(cat prompts/CURRENT_VERSION)
          MODEL_VERSION=$(cat config/model_version.txt)
          echo "prompt_version=$PROMPT_VERSION" >> $GITHUB_OUTPUT
          echo "model_version=$MODEL_VERSION" >> $GITHUB_OUTPUT
          echo "short_sha=${GITHUB_SHA::8}" >> $GITHUB_OUTPUT
      
      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.short_sha }}-p${{ steps.version.outputs.prompt_version }}-m${{ steps.version.outputs.model_version }}
          build-args: |
            PROMPT_VERSION=${{ steps.version.outputs.prompt_version }}
            MODEL_VERSION=${{ steps.version.outputs.model_version }}

  deploy-canary:
    runs-on: ubuntu-latest
    needs: build-push
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
      - name: Deploy canary (10% traffic)
        run: |
          # Update Kubernetes deployment with new image
          kubectl set image deployment/ai-service-canary \
            ai-service=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.build-push.outputs.tag }}
          
          # Wait for rollout
          kubectl rollout status deployment/ai-service-canary --timeout=300s
      
      - name: Monitor canary for 10 minutes
        run: |
          python scripts/monitor_canary.py \
            --duration-minutes 10 \
            --fail-on-degradation
      
      - name: Promote to full traffic
        run: |
          kubectl set image deployment/ai-service \
            ai-service=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.build-push.outputs.tag }}
```

### Eval Gate Script

```python
# scripts/run_eval.py
import json
import argparse
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from datasets import Dataset

def run_evaluation(test_set_path: str, output_path: str) -> dict:
    """Run RAGAS evaluation against test question set."""
    
    # Load test questions
    with open(test_set_path) as f:
        test_cases = [json.loads(line) for line in f]
    
    # Build evaluation dataset
    questions = []
    answers = []
    contexts = []
    ground_truths = []
    
    from src.pipeline import rag_pipeline  # your RAG pipeline
    
    for case in test_cases:
        # Get actual RAG answer for the question
        result = rag_pipeline.query(case["question"], tenant_id="eval")
        
        questions.append(case["question"])
        answers.append(result["answer"])
        contexts.append(result["source_chunks"])
        ground_truths.append(case["ground_truth"])
    
    eval_dataset = Dataset.from_dict({
        "question": questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths
    })
    
    # Run RAGAS
    results = evaluate(
        eval_dataset,
        metrics=[faithfulness, answer_relevancy, context_precision]
    )
    
    output = {
        "faithfulness": float(results["faithfulness"]),
        "answer_relevancy": float(results["answer_relevancy"]),
        "context_precision": float(results["context_precision"]),
        "num_questions": len(test_cases),
        "commit_sha": os.getenv("GITHUB_SHA", "local")
    }
    
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    
    return output


def check_eval_gate(results_path: str, thresholds: dict) -> bool:
    """Return True if all metrics pass thresholds."""
    with open(results_path) as f:
        results = json.load(f)
    
    passed = True
    for metric, threshold in thresholds.items():
        actual = results.get(metric, 0)
        if actual < threshold:
            print(f"FAIL: {metric} = {actual:.3f} < threshold {threshold}")
            passed = False
        else:
            print(f"PASS: {metric} = {actual:.3f} >= threshold {threshold}")
    
    return passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-set", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--threshold-faithfulness", type=float, default=0.85)
    parser.add_argument("--threshold-relevancy", type=float, default=0.80)
    parser.add_argument("--fail-on-regression", action="store_true")
    args = parser.parse_args()
    
    results = run_evaluation(args.test_set, args.output)
    
    if args.fail_on_regression:
        passed = check_eval_gate(args.output, {
            "faithfulness": args.threshold_faithfulness,
            "answer_relevancy": args.threshold_relevancy
        })
        if not passed:
            print("Eval gate FAILED — blocking deployment")
            exit(1)
        print("Eval gate PASSED — deployment proceeding")
```

### Prompt Version Tracking

```python
# prompts/version_manager.py
import os
import json
from pathlib import Path

PROMPTS_DIR = Path("prompts")

def get_current_prompt_version() -> int:
    version_file = PROMPTS_DIR / "CURRENT_VERSION"
    if version_file.exists():
        return int(version_file.read_text().strip())
    return 1

def load_prompt(name: str, version: int = None) -> str:
    if version is None:
        version = get_current_prompt_version()
    
    prompt_path = PROMPTS_DIR / f"v{version}" / f"{name}.txt"
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt {name} version {version} not found")
    
    return prompt_path.read_text()

def bump_prompt_version(change_reason: str, author: str) -> int:
    current = get_current_prompt_version()
    new_version = current + 1
    
    # Create new version directory (copy from current)
    src = PROMPTS_DIR / f"v{current}"
    dst = PROMPTS_DIR / f"v{new_version}"
    import shutil
    shutil.copytree(src, dst)
    
    # Update version file
    (PROMPTS_DIR / "CURRENT_VERSION").write_text(str(new_version))
    
    # Record change
    changelog = PROMPTS_DIR / "CHANGELOG.json"
    history = json.loads(changelog.read_text()) if changelog.exists() else []
    history.append({
        "version": new_version,
        "reason": change_reason,
        "author": author,
        "timestamp": datetime.utcnow().isoformat()
    })
    changelog.write_text(json.dumps(history, indent=2))
    
    return new_version
```

---

## 5. Example (From Your Projects)

**AstroIntel CI/CD design:**

AstroIntel's 6-agent pipeline needs to validate that changes to any domain agent's system prompt don't degrade output quality.

CI pipeline:
1. Unit tests: each agent node function in isolation with mock LLM
2. Eval gate: 20 test birth_profile + question pairs with known expected domains and quality scores
3. RAGAS faithfulness check: agent outputs must cite birth data points
4. Docker build tagged with git-sha + prompt-v{N}
5. Canary deploy: new version handles 10% of analyses, monitored for 15 minutes before full promote

In interview: "My Jenkins/GitHub Actions background means I know how to build an eval gate that blocks deployments when quality regresses. For AstroIntel, a prompt change to the Career Agent gets validated against 20 test cases before it ever reaches production. If faithfulness drops below 0.85, the pipeline fails and the change doesn't deploy. This is the same rigor I applied to Spring Boot integration test gates — just different validation logic."

---

## 6. Trade-offs

No eval gate:
+ Faster deployments
- Quality regressions deploy silently, detected only via user complaints

Eval gate with small test set (20 cases):
+ Fast (~2 minutes), catches major regressions
- May miss edge cases, expensive LLM calls in CI

Eval gate with large test set (200+ cases):
+ Thorough quality validation
- 15-30 minutes CI time, $2-5 per eval run

Shadow evaluation (eval after deploy):
+ No deployment delay
- Regression already in production before detected

---

## 7. Interview Questions (Senior Level)

- How does your Jenkins/GitHub Actions experience apply to AI CI/CD?

  **Answer:** The pipeline structure transfers directly: lint → unit test → build → deploy. The AI-specific addition is an eval gate between build and deploy — instead of just code coverage, I add a RAGAS quality gate that runs 20-50 known test queries through the pipeline and validates faithfulness and answer relevancy against thresholds. Secrets management is the same: OpenAI API keys in GitHub Secrets, injected as environment variables, never in code or Docker images. Rollback is the same: if the eval gate fails, the PR is blocked; if a production canary degrades, roll back to the previous image tag. The discipline is identical — what changes is the test assertions.

- What is an eval gate and why does AI deployment need one?

  **Answer:** An eval gate is a CI step that runs automated quality evaluation on the AI pipeline before allowing a deployment to proceed. Traditional code tests verify correctness via assertions — an AI eval gate verifies quality via RAGAS metrics or LLM-as-judge scores on a fixed test set. AI needs this because prompt changes, model version updates, and document changes can silently degrade output quality without triggering any unit test or type checker. A change that looks correct in code review (rewording a system prompt for clarity) can drop faithfulness from 0.92 to 0.78 — invisible without the eval gate. In CI, I run 30-50 fixed question-answer pairs through the pipeline and fail the build if RAGAS faithfulness drops below 0.85. In Bench Resource Optimizer, the eval gate uses LLM-as-judge rather than RAGAS (no ground-truth answers for workforce plans exist), running 20 sample CV-role pairs through the full pipeline and checking that the average judge score across all four dimensions stays above 3.5/5 — if a prompt change drops plan quality below that, the deployment is blocked.

- How do you version prompts and model IDs in a production system?

  **Answer:** Prompts as text files in the repository under `prompts/v{N}/task_name_system.txt`. The active version is a config value (`PROMPT_VERSION = "v2"`), not hardcoded in business logic. Model IDs pinned to dated versions (`gpt-4o-mini-2024-07-18`, never `gpt-4o-mini`). Docker image tag encodes all three: `{service}:{git-sha}-p{prompt_version}-m{model_date}`. This means any production issue is traceable to a specific code commit, prompt version, and model version. Rolling back is a matter of deploying the previous image tag — no separate config change needed.

- What is a canary deployment for an AI service?

  **Answer:** Route a small percentage (5-10%) of live traffic to the new version while the remaining 90-95% stays on the stable version. Monitor quality metrics (faithfulness score, RAGAS relevancy, user thumbs-up rate) on both canary and stable for 24-48 hours. If canary metrics are equal to or better than stable, promote to 100%. If canary degrades, shift 100% back to stable. The key difference from a traditional service canary: latency and error rate are not sufficient signals — a prompt change can produce 200 OK responses at the same latency while silently degrading answer quality. You need quality metrics (faithfulness, user satisfaction) as the canary success criteria, not just infrastructure metrics.

- How do you test an LLM-based service without making real API calls in CI?

  **Answer:** Three techniques: (1) Mock the LLM client — inject a mock that returns pre-recorded responses for known test prompts. This tests all application logic (chunking, retrieval, prompt construction, response parsing) without API costs. (2) Recorded responses (VCR pattern) — record real API responses once, replay them in subsequent test runs. Tests are deterministic and fast. (3) Local model for integration tests — run Ollama with a small model (Llama 3.2 3B) as a test-time LLM. Responses aren't GPT-4o quality but the pipeline behavior is testable end-to-end. For the eval gate specifically: use real API calls on a nightly schedule (not every PR) to control cost while still catching quality regressions regularly.

---

## 8. Answer Framework

Step 1 — Connect to your CI/CD background:
"My Jenkins and GitHub Actions experience transfers directly. The pipeline structure is the same: lint → test → build → deploy. The difference is stage 3: instead of test coverage gate, I add an eval gate — RAGAS faithfulness and relevancy must pass before the build proceeds."

Step 2 — Eval gate:
"The eval gate runs 20-50 known test questions through the RAG pipeline and validates RAGAS scores against thresholds (faithfulness > 0.85, relevancy > 0.80). If a prompt change silently degrades quality, the gate fails the build. Same concept as a mutation testing gate in Java CI."

Step 3 — Versioning:
"I version three things independently: code (git), prompts (prompts/v{N}/ directory with CURRENT_VERSION file), and model IDs (pinned in config). The Docker image tag includes all three: git-sha-p2-m20241106. If there's a regression, I can roll back to any combination."

Step 4 — Canary:
"AI service changes go canary before full promote. 10% of traffic routes to the new version for 15 minutes. I monitor faithfulness scores from real queries via Prometheus. If anything degrades, automatic rollback. This is the same zero-downtime deployment pattern I used for Spring Boot services."
