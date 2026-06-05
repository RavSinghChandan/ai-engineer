# Senior AI Engineer — Module 2
# Topic: Prompt Engineering at Scale (System Prompts, Few-Shot, Chain-of-Thought)

---

## 1. Intuition

Prompt engineering is not writing clever instructions. At the senior level, it is software engineering applied to natural language — with versioning, testing, and regression detection.

A junior engineer tweaks a prompt until it works on 5 test cases.
A senior engineer designs a prompt that works on 500 edge cases, versions it alongside code, and detects when a model update breaks it.

---

## 2. Core Concept

### Prompt Components
- System prompt: sets the model's role, constraints, output format, and persona — applied to every request
- User message: the actual query from the user
- Assistant message (few-shot): examples of ideal input/output pairs included in the prompt
- Context injection: retrieved documents (RAG), memory summaries, tool outputs

### Key Techniques

**Zero-shot**: give the model a task with no examples
- Best for: simple, clear tasks the model handles well out of the box
- Limitation: inconsistent output format, struggles on specialized tasks

**Few-shot**: include 2-5 example input/output pairs in the prompt
- Best for: enforcing output format, specialized tasks, consistent tone
- Limitation: costs input tokens per example — each example adds to every request

**Chain-of-Thought (CoT)**: instruct the model to reason step-by-step before answering
- Best for: math, logic, multi-step reasoning, debugging
- Limitation: longer output = more tokens = more cost and latency

**Structured output (JSON schema)**: constrain the model to return a specific format
- Best for: downstream code that parses the response — never rely on free text parsing in production

**Role prompting**: "You are a senior Java engineer reviewing a pull request"
- Best for: specialized knowledge, consistent persona, domain-specific reasoning

---

## 3. Why / When to Use

| Technique | Use When | Avoid When |
|---|---|---|
| Zero-shot | Simple, clear tasks | Complex or format-sensitive tasks |
| Few-shot | Format must be exact, specialized domain | Token budget is tight |
| CoT | Multi-step reasoning, math, logic | Simple tasks — wastes tokens |
| Structured output (JSON) | Downstream parsing required | Pure conversational use |
| System prompt constraints | Always — set guardrails | Never skip guardrails |

---

## 4. How It Works (Production Prompt Architecture)

```
System Prompt (static, versioned):
  - Role definition
  - Output format specification (JSON schema if needed)
  - Constraints ("Only use provided context", "Do not invent information")
  - Tone and length guidance

Injected Context (dynamic, per request):
  - Retrieved RAG chunks
  - Conversation history (last N turns)
  - Tool outputs

User Message:
  - Actual query

Few-Shot Block (optional, static):
  - 2-3 examples of ideal answers for this task
  - Placed between system prompt and user message
```

### Prompt Versioning System:
```
prompts/
  v1/system_prompt.txt     — original
  v2/system_prompt.txt     — added CoT instruction
  v3/system_prompt.txt     — added JSON output schema
config.py → ACTIVE_PROMPT_VERSION = "v3"
```
Treat prompts like code — commit them, review them, never edit in prod without a version bump.

---

## 5. Code Skeleton (Production-Grade)

```python
import json
from pathlib import Path

# Prompt versioning — load from file, not hardcoded in logic
PROMPT_DIR = Path("prompts")
ACTIVE_VERSION = "v3"

def load_system_prompt(task: str, version: str = ACTIVE_VERSION) -> str:
    return (PROMPT_DIR / version / f"{task}_system.txt").read_text()

# Structured output enforcement
def call_with_json_output(task: str, user_message: str, context: str) -> dict:
    system_prompt = load_system_prompt(task)
    
    full_message = f"""Context:
{context}

Question: {user_message}

Respond ONLY with valid JSON matching this schema:
{{
  "answer": "string — the direct answer",
  "confidence": "HIGH | MEDIUM | LOW",
  "source_quote": "string — exact quote from context supporting the answer"
}}"""
    
    response_text = call_llm(system_prompt, full_message)
    
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        # Retry with explicit repair instruction
        repair_prompt = f"The following is not valid JSON. Fix it and return only valid JSON:\n{response_text}"
        repaired = call_llm("You are a JSON repair assistant.", repair_prompt)
        return json.loads(repaired)

# Few-shot prompt builder
def build_few_shot_prompt(task: str, examples: list[dict], user_query: str) -> str:
    examples_text = "\n\n".join([
        f"Example {i+1}:\nInput: {ex['input']}\nOutput: {json.dumps(ex['output'])}"
        for i, ex in enumerate(examples)
    ])
    return f"{examples_text}\n\nNow answer:\nInput: {user_query}\nOutput:"
```

### Chain-of-Thought trigger:

```python
COT_SYSTEM = """You are a helpful assistant. When answering questions that require reasoning:
1. First, think step by step inside <thinking> tags
2. Then provide your final answer inside <answer> tags

Example:
<thinking>
The user is asking about X. First I need to consider Y. Then Z follows because...
</thinking>
<answer>
The answer is...
</answer>"""

def parse_cot_response(response: str) -> dict:
    import re
    thinking = re.search(r'<thinking>(.*?)</thinking>', response, re.DOTALL)
    answer = re.search(r'<answer>(.*?)</answer>', response, re.DOTALL)
    return {
        "reasoning": thinking.group(1).strip() if thinking else "",
        "answer": answer.group(1).strip() if answer else response
    }
```

---

## 6. Example (From Your Projects)

**AstroIntel — per-agent prompt architecture:**

Each domain agent (Astrology, Numerology, etc.) has its own system prompt with:
- Role: "You are an expert Vedic astrologer..."
- Constraint: "Base your answer ONLY on the birth profile provided"
- Output schema: JSON with fields `insight`, `confidence`, `timing`, `remedy`
- Length constraint: max_tokens=400 enforces token budget

This is production prompt engineering:
- Structured output: downstream Meta Consensus Agent parses JSON from each agent
- Per-agent specialization: each agent's system prompt is tuned to its domain
- Versioned: if an agent's prompt needs updating, only that agent is touched
- Tested: before deploying a new system prompt, run it against 20 sample inputs and compare output quality

**AstroIntel — versioned prompt folder system (implemented):**

Refactored all hardcoded system prompt strings out of `agents/agent_prompts.py` into a versioned file structure:

```
astro-intel-backend/
  prompts/
    loader.py          ← load_system_prompt(agent, version) with LRU cache + v1 fallback
    v1/                ← warm, exploratory style (11 agents)
      astrology.txt  numerology.txt  tarot.txt  palmistry.txt  vastu.txt
      meta.txt  remedy.txt  admin_review.txt  report.txt  simplify.txt  question.txt
    v2/                ← laser-sharp, direct, conversion-focused (11 agents)
      astrology.txt  numerology.txt  meta.txt  report.txt  simplify.txt
      (+ v1 copies for agents with no v2 variant — tarot, palmistry, vastu, remedy, admin_review)
```

Version switch: `agents/prompt_config.py` → `ACTIVE_PROMPT_VERSION = "v1" | "v2"` — one line change switches all agents simultaneously. Per-agent override also supported: `AGENT_VERSION_OVERRIDES = {"meta": "v2"}`.

`prompts/loader.py` — `load_system_prompt(agent, version)`:
- Reads `prompts/{version}/{agent}.txt` from disk
- Graceful fallback: if v2 file does not exist, silently uses v1
- `@lru_cache(maxsize=64)` — file is read once at startup, cached in-process for zero disk I/O on every LLM call
- Restart server to pick up prompt edits — no code change, no redeploy of logic

`agents/agent_prompts.py` — every `"system": f"""..."""` replaced with `load_system_prompt("agent")`. All `user_template` strings (which contain `{placeholders}` for `.format()`) stay in Python — unchanged.

Agents with separate v1/v2 variants: `astrology`, `numerology`, `meta`, `report`, `simplify`.
Agents with single prompt (same in both versions): `question`, `tarot`, `palmistry`, `vastu`, `remedy`, `admin_review`.

In interview: "We did not use one generic prompt for everything. Each agent had a versioned, domain-specific system prompt. This reduced hallucination and gave us consistent JSON output the consensus layer could parse reliably. The prompts live in a versioned folder — `prompts/v1/` and `prompts/v2/` — so switching between warm exploratory tone and laser-sharp conversion tone is a one-line config change in `prompt_config.py`. Prompt edits never require a code change or logic redeploy."

**Bench Resource Optimizer — versioned prompt folder system (implemented):**

Refactored all hardcoded system prompt strings out of `utils/prompts.py` into a versioned file structure:

```
bench-resource-optimizer/backend/
  prompts/
    loader.py          ← load_system_prompt(agent, version) with LRU cache + v1 fallback
    v1/                ← baseline prompts (4 agents)
      cv_parser.txt  role_mapper.txt  hyde.txt  llm_judge.txt
    v2/                ← production-hardened prompts (4 agents)
      cv_parser.txt  role_mapper.txt
      (hyde + llm_judge are copies of v1 — no v2 variant yet)
```

Version switch: `utils/prompts.py` → `ACTIVE_VERSIONS` dict — one dict change switches any agent. Current active: `cv_parser=v2`, `role_mapper=v2`, `planner=v1`, `hyde=v1`, `llm_judge=v1`.

`prompts/loader.py` — same pattern as AstroIntel: `load_system_prompt(agent, version)` reads from disk, `@lru_cache(maxsize=32)`, graceful v1 fallback if v2 file missing. Restart server to pick up file edits — no code change, no redeploy of logic.

`utils/prompts.py` — every `system=` string in each `PromptVersion(...)` registration replaced with `load_system_prompt("agent", "v1/v2")`. All `user=` template strings (which contain `{placeholders}`) stay in Python — unchanged. The `PromptVersion` dataclass, `_REGISTRY`, `register()`, `get_prompt()`, `get_active()`, and `list_prompts()` are all untouched.

Agents with separate v1/v2 system prompts: `cv_parser` (v2 adds injection-resistance clause), `role_mapper` (v2 adds `readiness_level` field and precision instruction).
Agents with single prompt (same in both versions): `hyde`, `llm_judge`.

In interview: "In Bench Resource Optimizer, every agent prompt lives in a versioned text file — `prompts/v1/` and `prompts/v2/`. The active version per agent is set in one dict in `utils/prompts.py`. Rollback means changing one line — no code deploy. The cv_parser v2 prompt adds an explicit injection-resistance clause because users upload arbitrary PDF CVs. The role_mapper v2 adds a `readiness_level` field that feeds the training plan generator. Prompt and code changes are fully decoupled."

---

## 7. Trade-offs

Long, detailed system prompt:
+ More control, less ambiguity, fewer edge case failures
- Costs tokens on every single request — a 1,000-token system prompt × 10,000 requests = 10M tokens/day

Short system prompt:
+ Cheaper per request
- Model has less guidance, output more variable

Few-shot examples:
+ Dramatically improves format consistency and domain-specific output
- Each example adds 100-300 tokens to every request — 3 examples × 200 tokens × 10,000 requests = 6M extra tokens/day

Chain-of-Thought:
+ Better accuracy on complex tasks (up to 30% improvement on reasoning benchmarks)
- Doubles or triples output token count — 3x cost on output, 3x latency

Structured JSON output:
+ Downstream parsing is reliable, no regex hacks
- Occasionally model doesn't follow schema — need JSON repair fallback

---

## 8. Interview Questions (Senior Level)

- How do you version and test prompts in a production system?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- When would you use few-shot vs fine-tuning? What's the cost/quality trade-off?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- Your prompt works for 90% of queries but fails on edge cases. What's your debugging process?

  **Answer:** First, I log and categorize the failing cases — are they a pattern (certain question types, certain input lengths, certain languages)? Then I trace the prompt construction to see what context the model actually received for those failures. In AstroIntel, when the simplify_agent failed on edge cases, the issue was always either ambiguous birth profile data or a question outside the domain scope — fixing the input validation resolved most failures without touching the prompt itself. If the issue is genuinely in the prompt, I add a targeted few-shot example for the failure pattern and rerun the eval suite. In Bench Resource Optimizer, the edge case failure pattern in the plan generation prompt was roles with no matching candidates — the LLM would hallucinate plausible-sounding employee assignments rather than returning "no qualified candidates." The fix was an explicit prompt constraint: "If no candidate has at least 50% skill match, return 'INSUFFICIENT_CANDIDATES' — do not generate a plan."

- How do you prevent a model API update from silently breaking your prompt-dependent system?

  **Answer:** *(Already covered in Advanced Follow-ups Q3 — skipped to avoid duplication.)*

- Explain chain-of-thought and when you would NOT use it despite it improving accuracy.

  **Answer:** Chain-of-thought instructs the model to reason step-by-step before answering, which improves accuracy on reasoning tasks by up to 30%. I would NOT use it when the task is simple and the answer is direct — adding CoT to a yes/no classification question triples the output tokens with zero quality benefit. In production, CoT is also a cost and latency multiplier: if your P95 latency is already at the SLA limit, adding CoT on every request is not the right tradeoff even if accuracy improves slightly.

---

## 9. Answer Framework

Step 1 — Distinguish amateur from professional prompt engineering:
"In production, prompt engineering is not trial and error. I version prompts, test them against a regression suite, and treat prompt changes as code changes."

Step 2 — Explain your technique selection:
"For structured output I always enforce JSON schema. For complex reasoning I add CoT. For format-sensitive tasks I use few-shot examples."

Step 3 — Address cost awareness:
"Each technique has a token cost. Few-shot adds ~300 tokens per example × every request. CoT doubles output tokens. I only add these when the quality gain justifies the cost."

Step 4 — From your project:
"In AstroIntel, each agent had a specialized system prompt with a JSON output schema. The consensus layer parsed structured JSON from 5 agents — this only works if the prompts are tight and tested."

Step 5 — Monitoring:
"After any prompt change, I run the eval suite. If average faithfulness score drops or output format errors spike, I roll back."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How do you test prompts systematically?

Answer:
Build a prompt eval suite — a set of 50-100 input/expected-output pairs covering normal cases, edge cases, and known failure modes.
After any prompt change, run the suite and compare: format compliance rate (did JSON parse correctly?), semantic accuracy (did the answer match expected intent?), and faithfulness score if it's a RAG system.
Store baseline scores per prompt version. A new prompt version must meet or beat the baseline before deploying.
For LLM-evaluated metrics (relevance, faithfulness): run RAGAS on the eval suite.
For format metrics: write deterministic assertions — did output parse to valid JSON? Did response length stay under limit?
Treat prompt testing the same way you treat unit tests — no prompt ships without passing the eval suite.

---

Q2: When does few-shot fail and fine-tuning become necessary?

Answer:
Few-shot starts failing when: the task is highly specialized and 3-5 examples are not enough to anchor the model's behavior; the domain vocabulary is significantly different from training data; or you need consistent behavior across thousands of edge cases that few-shot cannot cover.
Fine-tuning is the answer when: you have 500+ high-quality training examples; the task requires deep domain adaptation (medical notes, legal documents); or you need to reduce prompt length for cost savings by baking format knowledge into the model weights.
The practical test: if your few-shot prompt needs more than 5 examples to work reliably, it is a signal that few-shot is not the right tool — consider fine-tuning.
Cost trade-off: fine-tuning has a one-time cost but eliminates per-request few-shot token cost. At high volume, fine-tuning pays for itself quickly.

---

Q3: A model provider updates their API and your prompts start failing. How do you handle this?

Answer:
This is a real production problem — it happened industry-wide with GPT-3.5 to GPT-4 migrations and Claude 2 to Claude 3 transitions.
Prevention: pin your model version in production (e.g., `gpt-4o-2024-08-06` not `gpt-4o`). API providers guarantee behavior for specific dated versions.
Detection: run your prompt eval suite daily, not just at deploy time. A model rollout by the provider does not notify you — your metrics alert does.
Response: when a new model version is released, run your eval suite against it in staging before migrating production. Treat model upgrades as a code change — they require testing.
Fallback: keep the previous model version as a fallback. If quality metrics drop after a provider update, route back to the old version while you re-tune.

---

Q4: How do you handle a prompt that works in English but fails in other languages?

Answer:
This is a real multi-language challenge — I hit it directly in AstroIntel when we added 21-language translation.
Root cause: most prompts are designed and tested in English. The model's instruction-following capability is weaker in low-resource languages.
Three approaches.
First: keep the reasoning prompt in English even if user input is in another language. Translate input to English, process, translate output back. More reliable than prompting in the target language.
Second: use a dedicated translation agent instead of asking the primary agent to translate. Separation of concerns — each agent does one thing well.
Third: few-shot examples in the target language. If the output quality in Hindi is poor, add 2-3 Hindi examples to the prompt.
In AstroIntel: we separated translation into its own agent, ran it after all English reasoning was complete, and parallelized 55 string translations with ThreadPoolExecutor. The full latency journey: 78s (sequential, GPT-4o) → 15s (parallel, GPT-4o-mini) → 4s (parallel + DeepSeek + 3-tier cache). Translation was one of three optimization rounds.

---

Q5: What is the most common production prompt engineering mistake you have seen?

Answer:
Not treating prompts as code.
The symptoms: prompts are hardcoded in business logic, not versioned, not tested, changed by one developer at 2am to "fix a bug" — and now half the system breaks.
In production AI systems, the prompt IS the logic. A change to the system prompt changes the behavior of every user-facing feature that uses it. It deserves the same rigor as a code change: version control, code review, test suite, staged rollout.
Second most common mistake: leaving max_tokens uncapped. I have seen a single developer remove a max_tokens limit "for better answers" — and the monthly LLM bill tripled before anyone noticed.
Third: using the same system prompt for radically different tasks. One prompt for customer support, invoice extraction, and sentiment analysis — each task needs its own prompt, tested independently.

---

## ★ YOUR 5 PROJECTS — Prompt Engineering in Practice

| Project | Prompt strategy | Key detail |
|---------|----------------|-----------|
| **AstroIntel 360°** | 18+ domain-specific system prompts | Language-aware templates for 23 Indian languages. Prompt style selector: Warm & Exploratory vs Laser Sharp — same question, different tone. SECURITY_HEADER + SECURITY_FOOTER injected into every agent prompt. |
| **Bench Resource Optimizer** | Versioned prompts (`prompts/loader.py`) | `cv_parser@v2`, `role_mapper@v2` tags visible in API responses. HyDE prompt versioned as `prompts/v1/hyde.txt` — A/B testable without code deploy. Injection detection runs on CV text BEFORE prompt construction. |
| **RunbookAI** | Strict JSON extraction prompt | `{"steps": [{"command": str, "description": str, "depends_on": [int]}]}` — structured output only at ingest. No natural language in extraction response. temperature=0 for deterministic extraction. |
| **Agentic Growth OS** | Per-node role prompts, learning-adaptive | Each of 5 agents has focused role prompt. Ad Copy Agent prompt adapts based on `learning_strategy` field from previous runs — prompt changes based on what worked. |
| **Universal Agent** | Full persona in YAML | Change one YAML field → change the agent's behaviour, no code change. Five pre-built configs. `extra_facts` injected as system context. |

**Interview line:** "In Bench, prompts are versioned like code — `role_mapper@v2` is tagged in every API response so you can tell exactly which prompt version generated each output. This lets you A/B test prompt changes by comparing faithfulness scores between v1 and v2 without touching code deployment."
