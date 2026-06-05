# Regex in Production AI Systems
### Senior AI Engineer Reference — Real Usage Across All 5 Projects

---

## Why Regex in AI Engineering

Regex appears in every production AI system:
- **LLM output parsing** — extract JSON from markdown-wrapped LLM responses
- **PII filtering** — strip emails and phones before storing or returning LLM output
- **Injection detection** — scan user input for prompt hijacking patterns
- **Conflict detection** — find numeric parameter disagreements in runbook text
- **Input validation** — OTP codes, phone numbers, email formats
- **Semantic chunking** — split on sentence boundaries, markdown headers, code fences

---

## Core Patterns Used in Production

### PII Filter — Bench G4

```python
import re

# Compiled once at module level — called on every LLM output
_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PHONE = re.compile(r'(\+?\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}')

def strip_pii(text: str) -> str:
    """Remove PII from all LLM outputs — Bench G4 guardrail."""
    text = _EMAIL.sub('[EMAIL]', text)
    text = _PHONE.sub('[PHONE]', text)
    return text
```

### JSON Extraction from LLM Output — Bench G3

```python
# G3 JSON repair cascade: direct → fence → regex key-value → LLM repair
_JSON_FENCE  = re.compile(r'```(?:json)?\s*([\s\S]*?)\s*```')
_JSON_INLINE = re.compile(r'\{[\s\S]*\}')

def extract_json(text: str) -> dict:
    # Step 1: try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Step 2: extract from markdown fence
    m = _JSON_FENCE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Step 3: find bare JSON object
    m = _JSON_INLINE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    # Step 4: LLM repair call
    return llm_repair_json(text)
```

### Injection Detection — Bench G2

```python
_INJECTION = re.compile(
    r'ignore\s+(all\s+)?previous|forget\s+(all\s+)?instructions'
    r'|you\s+are\s+now|act\s+as\s+if|pretend\s+(you\s+are|to\s+be)'
    r'|jailbreak|DAN\s+mode|developer\s+mode',
    re.IGNORECASE,
)

def check_injection(text: str) -> bool:
    """Return True if injection pattern detected."""
    return bool(_INJECTION.search(text))
```

### Numeric Conflict Detection — RunbookAI

```python
# Find numeric parameters with units — detect VALUE_CONFLICT between runbooks
_NUMERIC = re.compile(
    r'\b(\d+(?:\.\d+)?)\s*(GB|MB|KB|ms|s|%|replicas?|pods?|nodes?|cores?|CPU|RAM)\b',
    re.IGNORECASE,
)

def extract_numeric_params(step_text: str) -> list[tuple[float, str]]:
    """Extract all (value, unit) pairs from a step description."""
    return [(float(v), u.lower()) for v, u in _NUMERIC.findall(step_text)]

def detect_value_conflict(internal_step: str, official_step: str) -> bool:
    """Return True if same unit has different values in two runbook steps."""
    internal = {u: v for v, u in extract_numeric_params(internal_step)}
    official  = {u: v for v, u in extract_numeric_params(official_step)}
    shared = set(internal) & set(official)
    return any(internal[u] != official[u] for u in shared)
```

### Markdown Header Splitter — Semantic Chunking

```python
_HEADER = re.compile(r'^#{1,6}\s+.+$', re.MULTILINE)

def split_on_headers(text: str) -> list[str]:
    """Split a markdown document on section headers."""
    boundaries = [m.start() for m in _HEADER.finditer(text)]
    if not boundaries:
        return [text]
    chunks = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(text)
        chunks.append(text[start:end].strip())
    return chunks
```

### OTP Validation — AstroIntel

```python
_OTP = re.compile(r'^\d{6}$')

def validate_otp(code: str) -> bool:
    return bool(_OTP.fullmatch(code.strip()))
```

### Sentence Boundary — Chunking with Overlap

```python
_SENTENCE_END = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')

def split_sentences(text: str) -> list[str]:
    return _SENTENCE_END.split(text)
```

---

## The ReDoS Vulnerability — Real Bug from Bench

**What is ReDoS?**
A regex with nested quantifiers can take exponential time on crafted input — causing denial of service.

```python
# VULNERABLE — catastrophic backtracking on long input
import re
re.match(r'^(\w+\s*)+$', 'a' * 50 + '!')   # hangs the server

# FIXED — plain string op, same result, O(n) always
' '.join(text.split())  # no regex needed for this use case
```

**Bench SonarQube bug (rule S5852):**
- Original: `\s*` inside a user-input regex in the injection guard
- Fix: replaced with plain string `split()` and `strip()` operations
- Lesson: **never put `\s*`, `.*`, or `+` inside a group that is itself repeated (`+` or `*`) on user input**

**Safe patterns:**
```python
# SAFE — no nested quantifiers
re.match(r'^\d{6}$', otp)          # fixed repetition
re.search(r'\b\w+\b', text)        # word boundary, no nesting
re.sub(r'[^\w\s]', '', text)       # character class, no nesting

# RISKY — nested quantifiers on user input
re.match(r'(\w+\s*)+', user_text)  # ReDoS candidate
re.match(r'(.+)+', user_text)      # ReDoS candidate
```

---

## Performance Rules

| Rule | Why |
|------|-----|
| `re.compile()` at module level | Compile once, reuse many times — not inside the function |
| Use `re.search()` not `re.match()` for "contains" checks | `match()` only checks the start |
| Use `re.fullmatch()` for format validation | Ensures the entire string matches |
| Prefer `re.IGNORECASE` over `.lower()` + pattern | One operation instead of two |
| Avoid `re.DOTALL` on user input | `.` matching newlines can cause unexpected matches |
| Use raw strings `r'...'` always | Avoids double-escaping `\\d` vs `\d` confusion |

---

## Regex vs String Operations — When to Use Each

| Task | Use Regex | Use String Ops |
|------|-----------|---------------|
| Validate an email | ✓ | Complex with string ops |
| Check if string starts with "Error:" | ✗ | `text.startswith("Error:")` |
| Extract all numbers from text | ✓ | Complex with string ops |
| Strip whitespace | ✗ | `text.strip()` |
| Check word boundary match | ✓ | Hard without regex |
| Split on a fixed delimiter | ✗ | `text.split(',')` |
| Find overlapping patterns | ✓ | Impossible with string ops |
| Replace a simple substring | ✗ | `text.replace('old', 'new')` |

**Bench SonarQube rule:** Replace regex with string ops whenever possible — faster, no ReDoS risk, and more readable.

---

## Regex in Each of the 5 Projects

### AstroIntel 360°
```python
_OTP_PATTERN  = re.compile(r'^\d{6}$')
_HTML_TAGS    = re.compile(r'<[^>]+>')          # sanitise birth details input
_SCRIPT_TAGS  = re.compile(r'<script[\s\S]*?</script>', re.IGNORECASE)

# OTP validation
def validate_otp(code: str) -> bool:
    return bool(_OTP_PATTERN.fullmatch(code.strip()))

# Input sanitisation before LLM call
def sanitise_input(text: str) -> str:
    text = _SCRIPT_TAGS.sub('', text)
    return _HTML_TAGS.sub('', text)
```

### Bench Resource Optimizer
```python
# G2 — Injection detection
# G3 — JSON fence extraction, bare JSON extraction
# G4 — PII filter (email + phone)
# SonarQube fixed: replaced \s* pattern with plain string ops

# JSON fence (used in G3)
_FENCE = re.compile(r'```(?:json)?\s*([\s\S]*?)```')

# PII patterns
_PII_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PII_PHONE = re.compile(r'(\+?\d[\d\s\-().]{7,}\d)')
```

### RunbookAI
```python
# Conflict detection — VALUE_CONFLICT
_NUM_UNIT = re.compile(
    r'\b(\d+(?:\.\d+)?)\s*(GB|MB|ms|s|%|replicas?|pods?)\b', re.I
)

# Title overlap normalisation — for P3 combined panel matching
_NON_WORD = re.compile(r'[^\w\s]')

def normalise_title(title: str) -> set[str]:
    clean = _NON_WORD.sub('', title.lower())
    return set(clean.split())

def title_overlap(a: str, b: str) -> float:
    sa, sb = normalise_title(a), normalise_title(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(len(sa), len(sb))
```

### Agentic Growth OS
```python
# Extract numeric improvement from agent output
_IMPROVEMENT = re.compile(r'(\d+(?:\.\d+)?)\s*%\s*(?:improvement|increase|gain)', re.I)
_ROI_SCORE   = re.compile(r'roi[:\s]+(\d+(?:\.\d+)?)', re.I)

def extract_roi(agent_output: str) -> float | None:
    m = _ROI_SCORE.search(agent_output)
    return float(m.group(1)) if m else None
```

### Universal Agent
```python
# Tool result extraction — when LLM wraps tool output in text
_CALC_RESULT = re.compile(r'(?:result|answer|=)\s*:?\s*(-?\d+(?:\.\d+)?)', re.I)

# Session ID validation
_SESSION_ID  = re.compile(r'^[a-zA-Z0-9\-_]{8,64}$')

def validate_session_id(sid: str) -> bool:
    return bool(_SESSION_ID.fullmatch(sid))
```

---

## Interview Line

"Regex appears in every production AI system I've built — G4 PII filtering on all LLM outputs, G3 JSON repair cascades for malformed LLM responses, conflict detection in RunbookAI using numeric parameter extraction, and injection detection in Bench. I also fixed a ReDoS vulnerability that SonarQube caught — a `\s*` inside a repeated group on user input. Replaced it with plain string operations."

---

## ★ YOUR 5 PROJECTS — Regex Usage Quick Reference

| Project | Regex used for | Pattern count |
|---------|---------------|--------------|
| **AstroIntel 360°** | OTP validation `^\d{6}$`. HTML/script tag stripping. Input sanitisation before LLM. Language routing patterns. | 4 compiled patterns at module level |
| **Bench Resource Optimizer** | G2 injection detection (multi-pattern). G3 JSON fence + bare JSON extraction. G4 PII (email + phone). SonarQube ReDoS fix (S5852). | 6+ compiled patterns. Heaviest regex usage in portfolio. |
| **RunbookAI** | VALUE_CONFLICT numeric extraction `\b(\d+(?:\.\d+)?)\s*(GB|MB|ms|s|%|replicas?|pods?)\b`. ORDER_CONFLICT keyword scan. Title overlap normalisation `[^\w\s]`. | 3 compiled patterns. Critical for conflict detection. |
| **Agentic Growth OS** | ROI extraction `roi[:\s]+(\d+(?:\.\d+)?)`. Improvement % extraction. Campaign type keyword detection via `re.search`. | 2–3 compiled patterns. |
| **Universal Agent** | Calculator result extraction. Session ID validation `^[a-zA-Z0-9\-_]{8,64}$`. Input sanitisation before tool routing. | 2 compiled patterns. |

**ReDoS story (Bench — know cold):**
- SonarQube rule S5852 caught `\s*` inside a repeated group on user CV input
- Original: `re.match(r'^(\w+\s*)+$', user_input)` — hangs on `'a'*50 + '!'`
- Fix: `' '.join(text.split())` — O(n) always, no regex engine backtracking
- Lesson: static analysis catches security bugs in "utility" functions

**Interview line:** "The ReDoS vulnerability in Bench was in the injection guard — the one function that runs on every piece of user input. A malicious user could send a crafted CV string that caused the regex to take exponential time, hanging the server. SonarQube caught it before it reached production. Now all user-input regexes in my systems are reviewed for nested quantifiers before merging."
