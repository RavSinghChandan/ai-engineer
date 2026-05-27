# Python for AI Engineering — Phase 1
# Lesson 3: Core Collections

---

## 1. Intuition (Java Anchor)

You already know Java collections. Python collections map directly — but with cleaner syntax and more built-in power.

| Python | Java Equivalent | Key Difference |
|---|---|---|
| `list` | `ArrayList` | Literal syntax `[]`, mixed types allowed |
| `tuple` | `final` unmodifiable list | Truly immutable, hashable |
| `dict` | `HashMap` | Literal syntax `{}`, ordered since Python 3.7 |
| `set` | `HashSet` | Literal syntax `{1,2,3}` |
| `deque` | `ArrayDeque` | Efficient head/tail ops |
| `Counter` | No direct equiv | Frequency counting in 1 line |
| `defaultdict` | `computeIfAbsent` pattern | Auto-initializes missing keys |

---

## 2. List (Java: ArrayList)

```python
# Creation
skills = ["Python", "FastAPI", "Docker"]
mixed  = [1, "hello", 3.14, True]     # Java would need List<Object> — messy

# Access
skills[0]     # "Python"  — like Java .get(0)
skills[-1]    # "Docker"  — last element (no Java equivalent without .size()-1)
skills[-2]    # "FastAPI" — second to last

# Slicing — no Java equivalent (Java needs subList)
skills[0:2]   # ["Python", "FastAPI"]  — index 0 to 1 (end exclusive)
skills[1:]    # ["FastAPI", "Docker"]  — from index 1 to end
skills[:2]    # ["Python", "FastAPI"]  — from start to index 1
skills[::2]   # every 2nd element
skills[::-1]  # reversed — like Java Collections.reverse() but non-mutating

# Mutating
skills.append("Redis")              # like Java .add()
skills.extend(["Kafka", "K8s"])     # like Java .addAll()
skills.insert(1, "LangChain")       # insert at index
skills.remove("Redis")              # remove by value
skills.pop()                        # remove and return last (like Java Deque)
skills.pop(0)                       # remove and return at index

# Useful list methods
len(skills)                         # like Java .size()
"Python" in skills                  # like Java .contains()
skills.index("FastAPI")             # like Java .indexOf()
skills.sort()                       # in-place sort — like Java Collections.sort()
sorted(skills)                      # returns NEW sorted list — non-mutating
skills.reverse()                    # in-place reverse
list(reversed(skills))              # non-mutating reverse
```

---

## 3. Tuple (Java: No Direct Equivalent)

```python
# Tuple = immutable list — use when data should NOT change
point = (3, 5)
rgb   = (255, 128, 0)
model_config = ("gpt-4o", 0.2, 500)    # model, temperature, max_tokens

# Access — same as list
point[0]    # 3
point[-1]   # 5

# Can NOT mutate
point[0] = 10    # TypeError: 'tuple' object does not support item assignment

# Tuples are hashable — can be used as dict keys (lists cannot)
cache = {}
cache[(user_id, query_hash)] = response    # tuple as key — valid
# cache[[user_id, query_hash]] = response  # TypeError — list is not hashable

# Unpacking (tuples are made for this)
x, y = point
model, temp, tokens = model_config

# Named tuple — like a lightweight Java record/POJO
from collections import namedtuple
LLMConfig = namedtuple("LLMConfig", ["model", "temperature", "max_tokens"])
config = LLMConfig("gpt-4o", 0.2, 500)
print(config.model)          # "gpt-4o" — named access
print(config.temperature)    # 0.2
```

---

## 4. Dict (Java: HashMap — but better)

```python
# Creation
user = {"user_id": "ravi", "role": "admin", "score": 85}

# Access
user["role"]               # "admin" — like Java .get("role") but raises KeyError if missing
user.get("role")           # "admin" — safe, returns None if key missing
user.get("age", 0)         # 0 — default value if missing (like Java getOrDefault)

# Mutating
user["score"] = 90         # update
user["email"] = "r@x.com"  # add new key
del user["email"]          # delete key
user.pop("score")          # remove and return value

# Checking keys
"role" in user             # True — like Java .containsKey()
"age" in user              # False

# Iteration — Java: for (Map.Entry<K,V> e : map.entrySet())
for key in user:                       # iterate keys
    pass
for key, value in user.items():        # iterate key-value pairs
    print(f"{key}: {value}")
for key in user.keys():                # keys only
    pass
for value in user.values():            # values only
    pass

# Dict merging (Python 3.9+)
defaults = {"temperature": 0.2, "max_tokens": 500}
overrides = {"temperature": 0.7}
merged = defaults | overrides          # {"temperature": 0.7, "max_tokens": 500}
# Java: defaults.putAll(overrides) — but mutates defaults. Python | creates new dict.

# Dict comprehension (covered in Lesson 6 — preview)
scores = {"ravi": 85, "priya": 72, "amit": 91}
high_scorers = {k: v for k, v in scores.items() if v >= 80}
# {"ravi": 85, "amit": 91}
```

---

## 5. Set (Java: HashSet)

```python
# Creation
skills = {"Python", "FastAPI", "Docker"}
unique = set([1, 2, 2, 3, 3, 3])    # {1, 2, 3} — deduplication

# Operations — same as Java Set
skills.add("Redis")          # .add()
skills.remove("Docker")      # removes, raises KeyError if missing
skills.discard("Docker")     # removes, NO error if missing (Java has no direct equiv)
"Python" in skills           # True — O(1) lookup like HashSet

# Set operations — Java: retainAll, removeAll, addAll
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}
a | b    # union       {1,2,3,4,5,6} — Java: addAll
a & b    # intersection {3,4}        — Java: retainAll
a - b    # difference   {1,2}        — Java: removeAll
a ^ b    # symmetric diff {1,2,5,6} — elements in one but not both

# AI engineering: deduplication of retrieved chunks
chunks = retrieve_from_faiss(query) + retrieve_from_bm25(query)
unique_chunks = list(set(chunk.id for chunk in chunks))  # deduplicate by ID
```

---

## 6. Slicing (No Java Equivalent)

```python
# Syntax: collection[start:stop:step]
# start = inclusive, stop = exclusive (like Java subList)

items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

items[2:5]     # [2, 3, 4]       — index 2 to 4
items[:3]      # [0, 1, 2]       — first 3
items[-3:]     # [7, 8, 9]       — last 3
items[::2]     # [0, 2, 4, 6, 8] — every 2nd
items[::-1]    # [9,8,7,...,0]   — reversed

# String slicing — same syntax
text = "Hello World"
text[:5]       # "Hello"
text[-5:]      # "World"
text[::2]      # "HloWrd"

# AI engineering: windowing conversation history
MAX_HISTORY = 10
trimmed_history = conversation_history[-MAX_HISTORY:]   # last 10 messages
# Java: history.subList(Math.max(0, history.size()-10), history.size())
```

---

## 7. enumerate and zip (Java: No Direct Equivalent)

```python
# enumerate — index + value together
# Java: for (int i = 0; i < list.size(); i++) { String s = list.get(i); }
skills = ["Python", "FastAPI", "Docker"]
for i, skill in enumerate(skills):
    print(f"{i}: {skill}")   # 0: Python, 1: FastAPI, 2: Docker

for i, skill in enumerate(skills, start=1):   # start from 1
    print(f"{i}. {skill}")   # 1. Python, 2. FastAPI, 3. Docker

# zip — parallel iteration
# Java: iterate two lists with same index
models = ["gpt-4o", "claude-3", "deepseek"]
costs  = [0.01, 0.008, 0.001]
for model, cost in zip(models, costs):
    print(f"{model}: ${cost}")

# zip to create dict
config = dict(zip(models, costs))
# {"gpt-4o": 0.01, "claude-3": 0.008, "deepseek": 0.001}
```

---

## 8. Counter (Java: No Direct Equivalent)

```python
from collections import Counter

# Frequency counting in 1 line — Java needs 10+ lines with HashMap
skills = ["Python", "FastAPI", "Python", "Docker", "Python", "FastAPI"]
counts = Counter(skills)
# Counter({"Python": 3, "FastAPI": 2, "Docker": 1})

counts["Python"]       # 3
counts.most_common(2)  # [("Python", 3), ("FastAPI", 2)]

# AI engineering: analyze skill frequencies across CV uploads
def top_skills(all_cvs: list[dict], n: int = 10) -> list:
    all_skills = [skill for cv in all_cvs for skill in cv["skills"]]
    return Counter(all_skills).most_common(n)
```

---

## 9. defaultdict (Java: computeIfAbsent)

```python
from collections import defaultdict

# Java pattern:
# map.computeIfAbsent(key, k -> new ArrayList<>()).add(value)

# Python with regular dict — KeyError if key missing:
groups = {}
for skill in ["Python", "FastAPI", "Python"]:
    if skill not in groups:
        groups[skill] = []
    groups[skill].append(skill)   # verbose

# Python with defaultdict — auto-creates missing keys:
groups = defaultdict(list)        # default factory is list
for skill in ["Python", "FastAPI", "Python"]:
    groups[skill].append(skill)   # no KeyError, no if-check

# Other factories
counter = defaultdict(int)        # default 0 for missing keys
counter["hits"] += 1              # no init needed

# AI engineering: grouping agents by capability
agent_registry = defaultdict(list)
for agent in agents:
    agent_registry[agent.capability].append(agent)
# agent_registry["search"] = [SearchAgent1, SearchAgent2]
```

---

## 10. deque (Java: ArrayDeque)

```python
from collections import deque

# deque = double-ended queue — O(1) append/pop at both ends
# list.pop(0) is O(n) — deque.popleft() is O(1)

history = deque(maxlen=10)       # auto-discards oldest when full
history.append("msg1")           # add to right
history.append("msg2")
history.appendleft("system")     # add to left
history.popleft()                # remove from left — O(1)
history.pop()                    # remove from right — O(1)

# AI engineering: sliding window conversation history with auto-eviction
class ConversationBuffer:
    def __init__(self, max_messages: int = 20):
        self.buffer = deque(maxlen=max_messages)

    def add(self, role: str, content: str):
        self.buffer.append({"role": role, "content": content})

    def get_context(self) -> list:
        return list(self.buffer)   # last 20 messages, oldest auto-dropped
```

---

## 11. Interview Anchor

**"Which Python collection would you use to deduplicate LLM-retrieved chunks from two retrieval paths?"**

Say:
> "I'd use a `set` for deduplication by chunk ID — O(1) lookup, automatic uniqueness. But since chunks need ordering (by relevance score), I'd collect IDs into a set for the dedup check, then return the original list filtered by that set — preserving order without duplicates. In Java this is the `LinkedHashSet` pattern — Python doesn't have a direct equivalent so you combine `set` and `list` comprehension: `seen = set(); [c for c in chunks if not (c.id in seen or seen.add(c.id))]`."

---

## 12. Quick Reference

```python
# Creation
lst  = [1, 2, 3]              # ArrayList
tpl  = (1, 2, 3)              # immutable list
dct  = {"k": "v"}             # HashMap
st   = {1, 2, 3}              # HashSet

# Slicing
lst[-3:]                       # last 3 (Java: subList(size-3, size))
lst[::-1]                      # reversed

# Enumerate / zip
for i, v in enumerate(lst):    # index + value
for a, b in zip(l1, l2):       # parallel iteration

# Counter
Counter(list).most_common(5)   # top 5 frequencies

# defaultdict
d = defaultdict(list)          # auto-creates [] for new keys

# deque
dq = deque(maxlen=N)           # sliding window, O(1) both ends
```
