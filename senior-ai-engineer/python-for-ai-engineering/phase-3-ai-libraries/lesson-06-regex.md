# Python for AI Engineering — Phase 3
# Lesson 6: Regex

---

## 1. Intuition (Java Anchor)

Java: `java.util.regex.Pattern` + `Matcher`.
Python: built-in `re` module — same regex syntax, cleaner API.

| Java | Python |
|---|---|
| `Pattern.compile(regex)` | `re.compile(regex)` |
| `Matcher m = pattern.matcher(str)` | `pattern.search(str)` / `pattern.match(str)` |
| `m.matches()` — full string | `re.fullmatch(pattern, str)` |
| `m.find()` — first match | `re.search(pattern, str)` |
| `m.group()` | `match.group(0)` |
| `m.group(1)` — capture group | `match.group(1)` |
| `pattern.split(str)` | `re.split(pattern, str)` |
| `m.replaceAll(replacement)` | `re.sub(pattern, replacement, str)` |
| `m.replaceFirst(replacement)` | `re.sub(pattern, replacement, str, count=1)` |

As an AI engineer you use regex for:
- Parsing LLM structured output that isn't clean JSON
- Extracting emails, phones, URLs from CV text
- Sanitizing user inputs before sending to LLM
- Cleaning scraped web content for RAG ingestion

---

## 2. Core Functions

```python
import re

text = "Contact: ravi@example.com or call +91-9876543210"

# re.search — find FIRST match anywhere in string (Java: matcher.find())
match = re.search(r"[\w.-]+@[\w.-]+\.\w+", text)
if match:
    print(match.group())   # "ravi@example.com"
    print(match.start())   # 9  — start index
    print(match.end())     # 25 — end index

# re.match — match only at START of string (Java: matcher.matches() but only from start)
# Less common — use re.search unless you specifically want start-anchored
match = re.match(r"Contact", text)   # matches — starts at position 0

# re.fullmatch — entire string must match (Java: matcher.matches())
re.fullmatch(r"\d{10}", "9876543210")   # matches — entire string is 10 digits

# re.findall — ALL matches as list of strings (Java: no direct equiv — loop with find())
emails = re.findall(r"[\w.-]+@[\w.-]+\.\w+", text)
# ["ravi@example.com"]

phones = re.findall(r"\+?\d[\d\s-]{8,}", text)
# ["+91-9876543210"]

# re.finditer — iterator of match objects (lazy — good for large text)
for match in re.finditer(r"\b\w{5,}\b", text):   # words 5+ chars
    print(match.group(), match.start())
```

---

## 3. Substitution — `re.sub` (Java: `replaceAll` / `replaceFirst`)

```python
# Java: str.replaceAll(regex, replacement)  →  re.sub(pattern, replacement, str)

text = "Call me at 123-456-7890 or 987-654-3210"

# Replace all matches:
cleaned = re.sub(r"\d{3}-\d{3}-\d{4}", "[PHONE REDACTED]", text)
# "Call me at [PHONE REDACTED] or [PHONE REDACTED]"

# Replace first match only:
cleaned = re.sub(r"\d{3}-\d{3}-\d{4}", "[PHONE REDACTED]", text, count=1)

# Using a function as replacement (Java: no direct equiv):
def redact(match):
    return "*" * len(match.group())

cleaned = re.sub(r"\d{3}-\d{3}-\d{4}", redact, text)
# "Call me at ********** or **********"

# Remove extra whitespace (common in CV text cleaning):
text = "  Python   FastAPI   Docker  "
cleaned = re.sub(r"\s+", " ", text).strip()
# "Python FastAPI Docker"
```

---

## 4. Capture Groups (Java: `matcher.group(n)`)

```python
# Parentheses ( ) create capture groups — extract specific parts of a match

text = "Experience: 5 years at TechCorp (2019-2024)"

# Named groups (Java: (?<name>...) — same syntax):
pattern = re.compile(r"(?P<years>\d+) years at (?P<company>\w+)")
match = pattern.search(text)
if match:
    print(match.group("years"))    # "5"
    print(match.group("company"))  # "TechCorp"
    print(match.groupdict())       # {"years": "5", "company": "TechCorp"}

# Numbered groups:
pattern = re.compile(r"(\d+) years at (\w+)")
match = pattern.search(text)
if match:
    print(match.group(1))   # "5"
    print(match.group(2))   # "TechCorp"

# findall with groups — returns list of tuples:
text = "Skills: Python (5 yrs), FastAPI (3 yrs), Docker (2 yrs)"
matches = re.findall(r"(\w+) \((\d+) yrs\)", text)
# [("Python", "5"), ("FastAPI", "3"), ("Docker", "2")]

skills_dict = {skill: int(yrs) for skill, yrs in matches}
# {"Python": 5, "FastAPI": 3, "Docker": 2}
```

---

## 5. Compiled Patterns — Performance (Java: `Pattern.compile()`)

```python
# Java: compile once, use many times — same in Python
# Always compile if you use the same pattern multiple times

import re

# Bad — recompiles every call:
def extract_emails_bad(texts: list[str]) -> list[str]:
    return [re.findall(r"[\w.-]+@[\w.-]+\.\w+", t) for t in texts]

# Good — compile once at module level:
EMAIL_PATTERN = re.compile(r"[\w.-]+@[\w.-]+\.\w+")
PHONE_PATTERN = re.compile(r"\+?\d[\d\s()-]{8,14}\d")
URL_PATTERN   = re.compile(r"https?://\S+")

def extract_emails(texts: list[str]) -> list[list[str]]:
    return [EMAIL_PATTERN.findall(t) for t in texts]

# Flags — like Java Pattern.CASE_INSENSITIVE, Pattern.MULTILINE:
SKILL_PATTERN = re.compile(
    r"\b(python|fastapi|docker|kubernetes)\b",
    re.IGNORECASE    # case insensitive — Java: Pattern.CASE_INSENSITIVE
)

# re.MULTILINE: ^ and $ match start/end of EACH LINE (not whole string)
# re.DOTALL:    . matches newlines too
# re.VERBOSE:   allows whitespace and # comments in pattern
```

---

## 6. AI Engineering Patterns

```python
import re

# Pattern 1: Extract JSON from LLM response (LLM sometimes wraps in markdown)
JSON_BLOCK = re.compile(r"```(?:json)?\s*([\s\S]+?)\s*```")

def extract_json_from_llm(response: str) -> str:
    """Extract JSON whether it's raw or wrapped in a markdown code block."""
    match = JSON_BLOCK.search(response)
    if match:
        return match.group(1)
    return response.strip()   # assume raw JSON

# Usage:
raw = """
Here is the analysis:
```json
{"role": "Python Dev", "match": 85}
```
"""
json_str = extract_json_from_llm(raw)   # '{"role": "Python Dev", "match": 85}'
import json
data = json.loads(json_str)

# Pattern 2: Redact PII from CV text before logging or storing
PII_PATTERNS = {
    "email": re.compile(r"[\w.-]+@[\w.-]+\.\w+"),
    "phone": re.compile(r"\+?\d[\d\s()-]{8,14}\d"),
    "pan":   re.compile(r"[A-Z]{5}\d{4}[A-Z]"),     # Indian PAN card
    "aadhar": re.compile(r"\d{4}\s\d{4}\s\d{4}"),   # Aadhaar number
}

def redact_pii(text: str) -> str:
    for label, pattern in PII_PATTERNS.items():
        text = pattern.sub(f"[{label.upper()} REDACTED]", text)
    return text

# Pattern 3: Detect prompt injection attempts
INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(previous|all|above)|forget\s+instructions|you\s+are\s+now|"
    r"pretend\s+to\s+be|act\s+as\s+if|disregard\s+)",
    re.IGNORECASE
)

def check_injection(user_input: str) -> bool:
    """Returns True if injection attempt detected."""
    return bool(INJECTION_PATTERNS.search(user_input))

# Pattern 4: Parse skill years from CV text
SKILL_YEARS = re.compile(r"(?P<skill>[\w+#.]+)\s*[-–]\s*(?P<years>\d+)\+?\s*(?:years?|yrs?)")

def extract_skill_years(cv_text: str) -> dict[str, int]:
    return {
        m.group("skill"): int(m.group("years"))
        for m in SKILL_YEARS.finditer(cv_text)
    }
# "Python - 5 years, FastAPI - 3 yrs" → {"Python": 5, "FastAPI": 3}
```

---

## 7. Splitting (Java: `Pattern.split()`)

```python
# Java: pattern.split(str)
# Python: re.split(pattern, str)

# Split on multiple delimiters:
text = "Python, FastAPI; Docker  Kubernetes"
skills = re.split(r"[,;\s]+", text)
# ["Python", "FastAPI", "Docker", "Kubernetes"]

# Split but KEEP the delimiter (Java: no built-in — need lookahead):
text = "First. Second! Third? Fourth."
sentences = re.split(r"(?<=[.!?])\s+", text)   # split on whitespace AFTER punctuation
# ["First.", "Second!", "Third?", "Fourth."]

# Chunk text for RAG — split on double newline (paragraph boundary):
paragraphs = re.split(r"\n\n+", document_text)
```

---

## 8. Interview Anchor

**"How do you use regex in an AI engineering pipeline?"**

Say:
> "Three places. First, extracting JSON from LLM output — LLMs sometimes wrap JSON in markdown code blocks, so I use `re.search(r'\`\`\`json([\s\S]+?)\`\`\`', response)` to unwrap it before `json.loads`. Second, PII redaction — before logging CV text I run compiled regex patterns for emails, phone numbers, and government IDs, replacing them with `[REDACTED]` labels. Third, prompt injection detection — I check user inputs against patterns like 'ignore previous instructions' before forwarding to the LLM. All patterns are pre-compiled at module load time — same as Java `Pattern.compile()` — never re-compiled inside loops."

---

## 9. Quick Reference

```python
import re

# Core functions
re.search(pattern, string)      # first match anywhere (Java: matcher.find())
re.match(pattern, string)       # match at START only
re.fullmatch(pattern, string)   # entire string must match (Java: matcher.matches())
re.findall(pattern, string)     # all matches as list
re.finditer(pattern, string)    # iterator of match objects
re.sub(pattern, repl, string)   # replace all (Java: replaceAll)
re.sub(pattern, repl, s, count=1)  # replace first (Java: replaceFirst)
re.split(pattern, string)       # split (Java: Pattern.split)

# Match object
m = re.search(pattern, string)
m.group()    # full match (group 0)
m.group(1)   # first capture group
m.group("name")    # named group
m.groupdict()      # all named groups as dict
m.start(); m.end() # positions

# Compile (always for repeated use)
pattern = re.compile(r"\d+", re.IGNORECASE)
pattern.findall(text)
pattern.search(text)
pattern.sub("X", text)

# Flags
re.IGNORECASE   # Java: Pattern.CASE_INSENSITIVE
re.MULTILINE    # ^ $ match each line
re.DOTALL       # . matches \n too
re.VERBOSE      # allow whitespace + comments in pattern

# Java comparison
# re.search()        → matcher.find()
# re.fullmatch()     → matcher.matches()
# re.findall()       → loop with matcher.find()
# re.sub()           → str.replaceAll()
# re.compile()       → Pattern.compile()
# (?P<name>...)      → (?<name>...) — named groups, same syntax
```
