# Python for AI Engineering — Phase 1
# Lesson 2: Variables + Mutability

---

## 1. Intuition (Java Anchor)

In Java: a variable is a **typed box**. `String name = "Ravi"` — the box is labelled `String`, can only ever hold a String.
In Python: a variable is a **label stuck on an object**. The label can be peeled off and stuck on any other object.

```java
// Java — type is on the variable
String name = "Ravi";
name = 42;             // compile error — box is typed
```
```python
# Python — type is on the VALUE, not the label
name = "Ravi"          # label 'name' points at a str object
name = 42              # label 're-pointed' at an int object — legal
name = [1, 2, 3]       # now points at a list — Python doesn't care
```

The dangerous part: when **two labels point at the same mutable object** — changing via one label changes what the other label sees. This is the #1 source of silent bugs in AI data pipelines.

---

## 2. Mutable vs Immutable (Java Analogy)

| Immutable (like Java `final` + value type) | Mutable (like Java reference types) |
|---|---|
| int, float, bool | list → like `ArrayList` |
| str → like Java `String` (immutable) | dict → like `HashMap` |
| tuple → like Java `final` array | set → like `HashSet` |
| frozenset | custom objects |

```python
# Immutable — reassignment creates a NEW object (just like Java String)
a = "hello"
b = a
b = b + " world"   # creates a new str, re-points b at it
print(a)           # "hello" — unchanged (same as Java String)
print(b)           # "hello world"

# Mutable — both labels point at the SAME object in heap
# Java analogy: two references pointing at the same ArrayList
x = [1, 2, 3]
y = x              # y is NOT a copy — same list in memory
y.append(4)
print(x)           # [1, 2, 3, 4] — x changed too!
print(y)           # [1, 2, 3, 4]
```

Java equivalent of this exact bug:
```java
List<Integer> x = new ArrayList<>(List.of(1, 2, 3));
List<Integer> y = x;   // NOT a copy — same reference
y.add(4);
System.out.println(x); // [1, 2, 3, 4] — same bug exists in Java too
```
The difference: in Java you're used to seeing `new` — it reminds you of allocation.
In Python there's no `new` keyword, so it's easy to forget `y = x` is a reference, not a copy.

---

## 3. `is` vs `==` (Java's `==` vs `.equals()`)

This is a direct mapping to Java:

| Java | Python | Meaning |
|---|---|---|
| `==` on primitives | `==` | value equality |
| `==` on objects | `is` | same reference / identity |
| `.equals()` | `==` | value equality on objects |

```python
a = [1, 2, 3]
b = [1, 2, 3]
print(a == b)    # True  — same values (like .equals())
print(a is b)    # False — different objects (like Java == on objects)

c = a
print(a is c)    # True  — same object (like Java == on same reference)

# Rule: use 'is' ONLY for None, True, False
x = None
if x is None:    # correct — idiomatic Python
    pass
if x == None:    # works but lint will warn you
    pass
```

Integer caching (CPython detail — like Java's `Integer` cache for -128 to 127):
```python
a = 256
b = 256
print(a is b)   # True  — CPython caches ints -5 to 256 (like Java Integer cache)
a = 257
b = 257
print(a is b)   # False — outside cache, different objects
# Java equivalent: Integer.valueOf(127) == Integer.valueOf(127) → true (cached)
#                  Integer.valueOf(128) == Integer.valueOf(128) → false (not cached)
```

---

## 4. Truthy / Falsy (No Java Equivalent — Learn This Fresh)

Java requires explicit boolean expressions. Python coerces many types to bool automatically.

```python
# Falsy values — all evaluate to False in boolean context:
False, None, 0, 0.0, "", [], {}, set(), ()

# Everything else is truthy

# Java style (don't do this in Python):
if len(results) > 0:      # works but un-Pythonic
    process(results)

# Python style:
if results:               # empty list is falsy — clean and idiomatic
    process(results)

if not user_input:        # empty string is falsy
    raise ValueError("Input required")

# AI engineering usage — checking LLM response:
response = llm.invoke(prompt)
if response and response.content:      # None is falsy, empty string is falsy
    return response.content.strip()
return "No response generated"
```

---

## 5. Default Mutable Argument Bug (No Java Equivalent)

Java does not have this — default parameter values don't exist in Java the same way.
Python evaluates default values **once at function definition time**, not each call.

```python
# WRONG — the list [] is created ONCE when Python loads this function
def add_message(msg, history=[]):
    history.append(msg)
    return history

print(add_message("hello"))   # ["hello"]
print(add_message("world"))   # ["hello", "world"] — BUG: same list reused!
print(add_message("test"))    # ["hello", "world", "test"] — grows forever

# CORRECT — None as sentinel, create fresh object each call
def add_message(msg, history=None):
    if history is None:
        history = []
    history.append(msg)
    return history

print(add_message("hello"))   # ["hello"]
print(add_message("world"))   # ["world"] — fresh list each time
```

This bug at scale — agent memory:
```python
# WRONG — all Agent instances share the SAME list from class definition
class ConversationAgent:
    def __init__(self, memory=[]):    # shared across all instances!
        self.memory = memory

# CORRECT
class ConversationAgent:
    def __init__(self, memory=None):
        self.memory = memory if memory is not None else []
```

Java analogy: imagine if `new ArrayList()` in a method signature created only ONE ArrayList shared across all calls — that's this bug.

---

## 6. Unpacking (Java Has No Direct Equivalent)

```python
# Basic unpacking — like Java destructuring but more powerful
a, b, c = [1, 2, 3]

# Spread operator — like JavaScript ... but in Python it's *
first, *rest = [1, 2, 3, 4, 5]       # first=1, rest=[2,3,4,5]
*init, last = [1, 2, 3, 4, 5]        # init=[1,2,3,4], last=5
first, *middle, last = [1,2,3,4,5]   # first=1, middle=[2,3,4], last=5

# Swap — no temp variable needed (Java needs temp)
# Java: int temp = a; a = b; b = temp;
a, b = b, a   # Python — one line

# Dict unpacking — like Java's Map spread into method params
config = {"model": "gpt-4o", "temperature": 0.2, "max_tokens": 500}

def call_llm(model, temperature, max_tokens):
    pass

call_llm(**config)    # unpacks dict as keyword arguments
# equivalent to: call_llm(model="gpt-4o", temperature=0.2, max_tokens=500)
```

---

## 7. Copy vs Deep Copy (Java: shallow clone vs deep clone)

```python
import copy

# Java analogy:
# .copy() / .clone() = shallow copy (top level new, nested shared)
# copy.deepcopy() = deep clone (everything recursively new)

original = {"name": "Ravi", "skills": ["Python", "FastAPI"]}

# Shallow copy — top-level dict is new, but nested list is still shared
shallow = original.copy()           # like Java's clone()
shallow["name"] = "Chandan"         # original unchanged
shallow["skills"].append("Docker")  # original["skills"] ALSO gets Docker!

# Deep copy — everything is recursively new
deep = copy.deepcopy(original)      # like Apache SerializationUtils.clone()
deep["skills"].append("Kubernetes") # original untouched

# When this matters in AI engineering:
# - Agent state branching (trying two strategies from same state)
# - RAG context copies per parallel retrieval path
# - Prompt template variations — always deepcopy before modifying
```

---

## 8. AI Engineering Patterns

```python
# Pattern 1: Safe agent state initialization
class RAGAgent:
    def __init__(self):
        self.conversation_history: list = []    # fresh per instance
        self.retrieved_chunks: list = []        # fresh per instance
        self.config: dict = {}                  # fresh per instance
        self.token_count: int = 0               # int is immutable — safe

# Pattern 2: Immutable constants (tuple instead of list — can't be mutated)
# Java: static final List<String> — but ArrayList can still be mutated via reference
# Python: tuple is truly immutable
SUPPORTED_MODELS: tuple = ("gpt-4o", "gpt-4o-mini", "claude-sonnet-4-6")
# SUPPORTED_MODELS.append("x")  → AttributeError — tuples have no append

# Pattern 3: Unpacking LLM structured output
import json

def parse_role_mapping(response: str) -> tuple:
    data = json.loads(response)
    return data["role"], data["match_percentage"], data["missing_skills"]

role, match, gaps = parse_role_mapping(llm_response)
# Cleaner than: result = parse_...; role = result[0]; match = result[1]

# Pattern 4: Truthy check for optional LLM content
def safe_content(response) -> str:
    content = getattr(response, "content", None)  # None if attr missing
    return content.strip() if content else ""      # empty string if falsy
```

---

## 9. Interview Anchor

**"Tell me about a Python bug you've encountered in a production AI system."**

Say:
> "A classic one that bit us: mutable default arguments. In our agent pipeline we had `def __init__(self, history=[])` — every Agent instance shared the same list created at class definition time, not a fresh one per instance. Users' conversation history was leaking into other users' sessions. The fix is always to default to `None` and create a new object in the body. As a Java developer this felt strange — in Java `new ArrayList()` in a constructor always creates a fresh list. In Python the default value is evaluated once, not per call. That's a fundamental difference worth knowing cold."

---

## 10. Quick Reference

```python
# Mutability
immutable = (42, "str", 3.14, True, None, (1,2))   # safe to share
mutable   = ([1,2], {"k":"v"}, {1,2})               # copy before modifying

# Safe defaults (never use mutable as default arg)
def fn(items=None):
    if items is None:
        items = []

# Identity vs equality (Java == vs .equals())
x is None       # identity — use for None/True/False only
x == "value"    # equality — use for everything else

# Unpacking
a, b = b, a                     # swap
first, *rest = some_list        # head + tail
fn(**config_dict)               # dict → keyword args

# Copy
import copy
shallow = obj.copy()            # like Java clone()
deep    = copy.deepcopy(obj)    # like deep clone
```
