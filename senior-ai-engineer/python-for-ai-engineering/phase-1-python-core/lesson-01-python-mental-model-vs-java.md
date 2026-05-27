# Python for AI Engineering — Phase 1
# Lesson 1: Python Mental Model vs Java

---

## 1. Intuition

You already think like an engineer. Python does not require you to unlearn that — it requires you to unlearn Java's ceremony.

In Java you think: "What type is this? What class does it belong to? What interface does it implement?"
In Python you think: "What can this object do right now? Does it have the method I need?"

That shift — from identity-based thinking to capability-based thinking — is the entire mental model.

---

## 2. Core Concepts

### Everything is an object
In Python, integers, strings, functions, classes, modules — all are objects with type, identity, and value.

```python
x = 42
print(type(x))       # <class 'int'>
print(id(x))         # memory address
print(x.__class__)   # <class 'int'>

def greet(): pass
print(type(greet))   # <class 'function'>
# Functions are objects — you can pass them, store them, return them
```

### Dynamic typing — type is on the value, not the variable
```python
# Java:  String name = "Ravi";   — type locked to variable
# Python:
name = "Ravi"     # str
name = 42         # now int — same variable, different type — legal
name = [1, 2, 3]  # now list — Python doesn't care
```
This is not a bug. In production AI code you use type hints (Phase 2) to add safety back.

### References, not copies
```python
a = [1, 2, 3]
b = a          # b points to the SAME list, not a copy
b.append(4)
print(a)       # [1, 2, 3, 4] — a changed too
# This is the most common Python bug for Java developers
```

### Duck typing — "if it walks like a duck..."
```python
# Java: you declare implements Serializable, implements Comparable
# Python: if the object has the method, you can call it — no declaration needed

def process(item):
    return item.to_dict()  # works for any object that has to_dict()
    # no interface required — just has to have the method
```

### First-class functions
```python
def double(x): return x * 2
def triple(x): return x * 3

operations = [double, triple]   # functions in a list
for op in operations:
    print(op(5))                # 10, then 15

# This is how decorators, callbacks, and agent tools are built
```

### Indentation is the syntax
```python
# Java uses {}
# Python uses indentation — 4 spaces, always

def classify(score):
    if score >= 80:
        return "high"
    elif score >= 50:
        return "medium"
    else:
        return "low"
# Mixing tabs and spaces causes SyntaxError — always use 4 spaces
```

### Pythonic style — the Zen of Python
```python
import this   # prints The Zen of Python — read it once

# Key principles:
# Explicit is better than implicit
# Flat is better than nested
# Readability counts
# There should be one obvious way to do it
```

---

## 3. Java vs Python Side-by-Side

| Concept | Java | Python |
|---|---|---|
| Variable declaration | `int x = 5;` | `x = 5` |
| Type checking | Compile time | Runtime (or type hints) |
| String format | `String.format("%s", name)` | `f"{name}"` |
| List | `ArrayList<String>` | `[]` |
| Map | `HashMap<String, Object>` | `{}` |
| Null | `null` | `None` |
| Print | `System.out.println()` | `print()` |
| Ternary | `x > 0 ? "pos" : "neg"` | `"pos" if x > 0 else "neg"` |
| Interface | `implements Runnable` | Just have the method (duck typing) |
| Generics | `List<T>` | `List[T]` (type hints, optional) |

---

## 4. Why This Matters in AI Engineering

**Agent tools are just functions passed as objects:**
```python
tools = [search_web, query_db, call_api]
agent.run(user_query, tools=tools)
# Each tool is a first-class function object
```

**LangChain chains use duck typing:**
```python
# Any object with .invoke() can be chained
chain = prompt | llm | output_parser
# Python does not care what class they are — it just calls .invoke()
```

**Dynamic typing enables flexible config:**
```python
config = {
    "model": "gpt-4o",
    "temperature": 0.2,
    "max_tokens": 500,
}
# Same dict structure works for any provider — no class hierarchy needed
```

---

## 5. Common Java-Developer Python Mistakes

```python
# Mistake 1: Comparing with == when you mean 'is None'
x = None
if x == None:   # works but wrong style
    pass
if x is None:   # correct Python — use 'is' for None/True/False
    pass

# Mistake 2: Forgetting mutability trap
def add_item(item, items=[]):    # WRONG — list is created once at definition
    items.append(item)
    return items

def add_item(item, items=None):  # CORRECT — create new list each call
    if items is None:
        items = []
    items.append(item)
    return items

# Mistake 3: Expecting Java-style encapsulation
class MyService:
    self.__secret = "hidden"     # name-mangled, not truly private
    # Python convention: _ prefix = "please don't touch", __ = name-mangled

# Mistake 4: Not using f-strings
name = "Ravi"
# Old:  "Hello " + name + "!"
# Old:  "Hello %s!" % name
# New:  f"Hello {name}!"    — use this always
```

---

## 6. Code Pattern: AI Engineering Context

```python
# How you'll write Python in real AI projects — first-class functions as tools

def search_knowledge_base(query: str) -> str:
    """Tool function — passed as object to agent."""
    # ... vector search logic
    return results

def call_llm(prompt: str, model: str = "gpt-4o") -> str:
    """Dynamic typing — model param can be any string."""
    # ... API call
    return response

# Building a simple agent loop — Python-style
tools = {
    "search": search_knowledge_base,
    "generate": call_llm,
}

def run_agent(query: str, tools: dict) -> str:
    context = tools["search"](query)        # function called from dict
    return tools["generate"](f"{context}\n\nAnswer: {query}")
```

---

## 7. Interview Anchor

**"How is your Python different from your Java background?"**

Say:
> "The biggest mental shift was from type-first thinking to capability-first thinking. In Java I asked 'what type is this object?' In Python I ask 'does this object have the method I need?' This is duck typing. In AI engineering it matters because LangChain chains work by calling `.invoke()` on any object — prompt templates, LLMs, output parsers — regardless of their class hierarchy. That's Python's first-class functions and duck typing working together. I lean on type hints (like Java's types) where I want safety, but I embrace Python's flexibility where it enables cleaner pipeline design."

---

## 8. Quick Reference

```python
# Python philosophy in 5 lines
everything_is_object = True
type_is_on_value_not_variable = True
functions_are_objects = True
duck_typing_not_interfaces = True
readability_over_cleverness = True

# The most Pythonic line you'll write in AI engineering:
result = [llm.invoke(prompt) for prompt in prompts if prompt.strip()]
# List comprehension + method call + filtering — all in one readable line
```
