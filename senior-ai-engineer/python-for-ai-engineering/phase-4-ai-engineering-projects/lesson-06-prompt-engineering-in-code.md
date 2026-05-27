# Python for AI Engineering — Phase 4
# Lesson 6: Prompt Engineering in Code — Templating, Builders, Validation, Structured Prompts

---

## 1. Intuition (Java Anchor)

Java: `String.format()`, `StringBuilder`, Thymeleaf/Freemarker templates for dynamic content.
Prompt engineering in code is the same idea — build a string dynamically from variables — but the output drives an LLM, so structure, tone, and instruction placement matter for correctness.

| Java Pattern | Prompt Engineering Equivalent |
|---|---|
| `String.format("Hello %s", name)` | f-string prompt: `f"Analyze: {cv_text}"` |
| `StringBuilder.append()` | `PromptBuilder` class with chained methods |
| Freemarker/Thymeleaf template | Jinja2 / Python string template |
| `@NotNull` on DTO field | Validate prompt inputs before LLM call |
| Spring `@Value("${prompt.system}")` | Load prompts from config / files |
| Enum for action types | Enum for prompt variants / strategies |
| Unit test for service output | Evaluate prompt output against expected structure |

---

## 2. Basic Prompt Construction

```python
# Level 1: simple f-string (fine for small prompts)
def build_cv_analysis_prompt(cv_text: str, target_role: str) -> str:
    return f"""You are a senior recruiter. Analyze the following CV for the role: {target_role}

CV:
{cv_text}

Return JSON with: role, match_percentage (0-100), matched_skills (list), missing_skills (list), recommendation (string)."""

# Level 2: multi-part prompt with clear sections
def build_structured_prompt(cv_text: str, role: str, company_context: str = "") -> dict:
    """Returns system + user messages — more maintainable than one long string."""
    system = (
        "You are a senior technical recruiter for a software consulting firm. "
        "Your job is to objectively match candidate CVs to job roles. "
        "Always return valid JSON only — no markdown, no explanation."
    )
    user_parts = [
        f"Target Role: {role}",
        f"CV Text:\n{cv_text}",
    ]
    if company_context:
        user_parts.insert(1, f"Company Context: {company_context}")

    user = "\n\n".join(user_parts) + "\n\nReturn JSON matching the schema: {role, match_percentage, matched_skills, missing_skills, recommendation}"

    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]
```

---

## 3. Prompt Builder — Fluent Interface

```python
# Java: StringBuilder with method chaining → same pattern in Python
# Use when the prompt structure varies significantly by context

from dataclasses import dataclass, field
from typing import Optional

@dataclass
class PromptBuilder:
    """Fluent builder for structured prompts."""
    _system: str = ""
    _sections: list[tuple[str, str]] = field(default_factory=list)
    _output_schema: str = ""
    _examples: list[dict] = field(default_factory=list)
    _temperature: float = 0.2

    def system(self, text: str) -> "PromptBuilder":
        self._system = text
        return self

    def section(self, label: str, content: str) -> "PromptBuilder":
        if content.strip():   # skip empty sections
            self._sections.append((label, content))
        return self

    def output_schema(self, schema: str) -> "PromptBuilder":
        self._output_schema = schema
        return self

    def few_shot(self, input_text: str, output_text: str) -> "PromptBuilder":
        self._examples.append({"input": input_text, "output": output_text})
        return self

    def temperature(self, t: float) -> "PromptBuilder":
        self._temperature = t
        return self

    def build(self) -> dict:
        """Returns dict with messages + temperature."""
        user_parts = []

        # Few-shot examples (improves output quality significantly)
        for ex in self._examples:
            user_parts.append(f"Example Input:\n{ex['input']}\nExample Output:\n{ex['output']}")

        # Main content sections
        for label, content in self._sections:
            user_parts.append(f"{label}:\n{content}")

        if self._output_schema:
            user_parts.append(f"Output Schema:\n{self._output_schema}")

        return {
            "messages": [
                {"role": "system", "content": self._system},
                {"role": "user",   "content": "\n\n---\n\n".join(user_parts)},
            ],
            "temperature": self._temperature,
        }


# Usage:
prompt = (
    PromptBuilder()
    .system("You are a senior technical recruiter. Return JSON only.")
    .few_shot(
        input_text="CV: Python 3yr, FastAPI 2yr\nRole: Senior Python Dev",
        output_text='{"match_percentage": 75, "matched_skills": ["Python", "FastAPI"]}',
    )
    .section("Target Role", "Senior Python Developer — 5yr Python, FastAPI, Docker required")
    .section("Candidate CV", cv_text)
    .section("Additional Context", company_context)
    .output_schema('{"match_percentage": int, "matched_skills": list, "missing_skills": list, "recommendation": str}')
    .temperature(0.0)
    .build()
)

response = await client.chat.completions.create(
    model="gpt-4o",
    **prompt,
)
```

---

## 4. Prompt Templates — Load from Files

```python
# Hard-coding prompt strings in Python files makes them hard to iterate
# Better: load from .txt or .yaml files — easy to edit without touching code
# Java: like loading SQL from .sql files or message bundles from .properties

from pathlib import Path
from string import Template   # built-in: $variable substitution

PROMPTS_DIR = Path(__file__).parent / "prompts"

def load_prompt(name: str, **variables) -> str:
    """Load prompt from file and substitute variables."""
    template_text = (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")
    return Template(template_text).substitute(**variables)

# prompts/cv_analysis.txt:
# You are a senior recruiter analyzing CVs for $company.
# Target Role: $role
# CV: $cv_text
# Return JSON with match_percentage, matched_skills, missing_skills.

prompt = load_prompt("cv_analysis", company="TechCorp", role="Python Dev", cv_text=cv)

# Jinja2 for complex logic in templates (pip install jinja2):
from jinja2 import Environment, FileSystemLoader

env = Environment(loader=FileSystemLoader(str(PROMPTS_DIR)))
template = env.get_template("cv_analysis.j2")

# cv_analysis.j2 can have conditionals:
# Analyze the CV for role: {{ role }}
# {% if include_salary %}Salary range: {{ salary_range }}{% endif %}
# CV: {{ cv_text }}

prompt = template.render(role="Python Dev", cv_text=cv, include_salary=True, salary_range="$80k-$100k")
```

---

## 5. Prompt Input Validation

```python
# Never send unvalidated user input to the LLM
# Java: @Valid on @RequestBody — validate before the service layer runs

from pydantic import BaseModel, Field, field_validator
import re

class CVAnalysisInput(BaseModel):
    cv_text: str = Field(min_length=50, max_length=50_000)
    target_role: str = Field(min_length=3, max_length=200)
    company_name: str = Field(default="", max_length=100)

    @field_validator("cv_text")
    @classmethod
    def no_prompt_injection(cls, v: str) -> str:
        INJECTION = re.compile(
            r"(ignore\s+(previous|all|above)|forget\s+instructions|you\s+are\s+now|"
            r"pretend\s+to\s+be|act\s+as\s+if|system\s*:)",
            re.IGNORECASE,
        )
        if INJECTION.search(v):
            raise ValueError("Input contains disallowed patterns")
        return v

    @field_validator("cv_text")
    @classmethod
    def strip_html(cls, v: str) -> str:
        return re.sub(r"<[^>]+>", " ", v).strip()   # remove HTML tags

def build_safe_prompt(raw_input: dict) -> list[dict]:
    validated = CVAnalysisInput.model_validate(raw_input)   # raises ValidationError if invalid
    return build_structured_prompt(validated.cv_text, validated.target_role, validated.company_name)
```

---

## 6. Prompt Versioning

```python
# Prompts change as you tune them — version them like code
# Java: no direct equivalent, but think: API versioning or feature flags

from enum import Enum

class PromptVersion(str, Enum):
    V1 = "v1"
    V2 = "v2"   # added few-shot examples
    V3 = "v3"   # added company context

def get_cv_analysis_prompt(
    cv_text: str,
    role: str,
    version: PromptVersion = PromptVersion.V3,
) -> list[dict]:
    if version == PromptVersion.V1:
        return [{"role": "user", "content": f"Analyze CV: {cv_text} for role: {role}"}]

    elif version == PromptVersion.V2:
        return (
            PromptBuilder()
            .system("You are a technical recruiter. Return JSON only.")
            .few_shot("CV: Python 5yr\nRole: Python Dev", '{"match_percentage": 90}')
            .section("CV", cv_text)
            .section("Role", role)
            .build()["messages"]
        )

    else:   # V3 — default
        return build_structured_prompt(cv_text, role)

# Log which version was used for evaluation:
import logging
logger = logging.getLogger(__name__)

async def analyze_with_versioned_prompt(cv_text: str, role: str) -> dict:
    version = PromptVersion(os.getenv("PROMPT_VERSION", "v3"))
    messages = get_cv_analysis_prompt(cv_text, role, version)
    response = await client.chat.completions.create(model="gpt-4o", messages=messages)
    logger.info("prompt_version=%s tokens=%d", version, response.usage.total_tokens)
    return json.loads(response.choices[0].message.content)
```

---

## 7. Chain-of-Thought Prompting

```python
# Tell the LLM to reason step by step before answering
# Improves accuracy on complex matching/reasoning tasks
# Java analogy: breaking a complex calculation into documented intermediate steps

def build_cot_prompt(cv_text: str, role: str) -> list[dict]:
    """Chain-of-thought prompt for more accurate role matching."""
    system = (
        "You are a technical recruiter. Think step by step:\n"
        "1. List the skills and experience in the CV\n"
        "2. List the requirements of the target role\n"
        "3. Compare them — what matches, what's missing\n"
        "4. Calculate match percentage\n"
        "5. Return ONLY the final JSON — no other text\n\n"
        "JSON schema: {reasoning_steps: list[str], match_percentage: int, "
        "matched_skills: list[str], missing_skills: list[str], recommendation: str}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": f"Target Role: {role}\n\nCV:\n{cv_text}"},
    ]

# When to use CoT:
# - Complex multi-step reasoning (role fit assessment)
# - When you need the intermediate steps for explainability
# - When match_percentage is frequently wrong without reasoning
# When NOT to use:
# - Simple extraction tasks (name, email, years of experience)
# - High-volume low-cost scenarios (CoT uses more tokens)
```

---

## 8. Interview Anchor

**"How do you manage prompts in a production AI system?"**

Say:
> "Four principles. First, never hardcode prompts as bare f-strings scattered across the codebase — I keep them in a dedicated `prompts/` directory as text files or Jinja2 templates, loaded at startup. That way a recruiter or PM can iterate the prompt without touching Python code. Second, I build prompts via a `PromptBuilder` class — it separates system instructions, few-shot examples, content sections, and output schema into distinct concerns rather than one giant string. Third, I version prompts the same way I version APIs — a `PromptVersion` enum in config means I can A/B test v2 vs v3 in production and log which version produced which output. Fourth, I validate inputs before building the prompt — Pydantic strips HTML, checks length, and detects prompt injection patterns before any text reaches the LLM. The injection check is: compile a regex of `ignore previous instructions`, `you are now`, `act as if` — if it matches, reject the request at the validation layer, not at the LLM layer."

---

## 9. Quick Reference

```python
# Basic prompt
messages = [
    {"role": "system", "content": "You are a recruiter. Return JSON only."},
    {"role": "user",   "content": f"Analyze: {cv_text}\nRole: {role}"},
]

# Prompt builder
prompt = (
    PromptBuilder()
    .system("...")
    .few_shot(input_text, output_text)
    .section("CV", cv_text)
    .section("Role", role)
    .output_schema('{"match_percentage": int, ...}')
    .temperature(0.0)
    .build()
)
# prompt["messages"] → list of message dicts
# prompt["temperature"] → float

# Load from file
text = (Path("prompts") / "cv_analysis.txt").read_text()
prompt = Template(text).substitute(cv_text=cv, role=role)

# Validate input
class PromptInput(BaseModel):
    cv_text: str = Field(min_length=50, max_length=50_000)
    @field_validator("cv_text")
    @classmethod
    def no_injection(cls, v): ...

# Prompt versions
class PromptVersion(str, Enum):
    V1 = "v1"; V2 = "v2"; V3 = "v3"

# Java comparison
# f"Hello {name}"               → String.format("Hello %s", name)
# PromptBuilder                 → StringBuilder with method chaining
# Template(text).substitute()   → String.format() / Freemarker
# PromptVersion enum            → API version enum / feature flag
# Pydantic input validation     → @Valid on @RequestBody
# prompts/ directory            → resources/templates/ in Spring
```
