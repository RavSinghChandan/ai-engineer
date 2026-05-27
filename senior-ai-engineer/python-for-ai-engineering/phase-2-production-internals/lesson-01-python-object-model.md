# Python for AI Engineering — Phase 2
# Lesson 1: Python Object Model

---

## 1. Intuition (Java Anchor)

In Java, the JVM manages object lifecycle. You create objects with `new`, the GC collects them, and the runtime tracks type through the class hierarchy.

In Python, **everything is an object** — including classes themselves. Every object has three properties:
- **Identity** — `id(obj)` → memory address (like Java `System.identityHashCode()`)
- **Type** — `type(obj)` → the class (like Java `obj.getClass()`)
- **Value** — the data the object holds

Understanding this is what separates a Python scripter from a Python engineer.

---

## 2. Identity, Type, Value

```python
# Java:
# int x = 42;           — primitive (not an object)
# Integer x = 42;       — boxed object: identity + type + value
# x.getClass()          — type
# System.identityHashCode(x) — identity

# Python — everything is an object, including int:
x = 42
print(id(x))       # identity — memory address (like Java identityHashCode)
print(type(x))     # <class 'int'>
print(isinstance(x, int))    # True — like Java instanceof

# Even functions and classes are objects:
def my_fn(): pass
print(type(my_fn))    # <class 'function'>
print(id(my_fn))      # has a memory address

class MyClass: pass
print(type(MyClass))  # <class 'type'> — classes are instances of 'type'!
print(id(MyClass))    # classes live in memory too
```

---

## 3. Object Lifecycle: `__new__` and `__init__`

```python
# Java constructor does two things: allocate + initialize
# Python splits this into two methods:
# __new__  → allocates the object (like Java's memory allocation before constructor body)
# __init__ → initializes the object (like Java constructor body)

class Singleton:
    """Classic singleton using __new__ — like Java double-checked locking."""
    _instance = None

    def __new__(cls, *args, **kwargs):
        # Called BEFORE __init__ — allocates the object
        if cls._instance is None:
            cls._instance = super().__new__(cls)   # allocate
        return cls._instance   # return existing if already created

    def __init__(self, config: dict):
        # Called AFTER __new__ — initialize (only meaningful first time)
        if not hasattr(self, "_initialized"):
            self.config = config
            self._initialized = True

a = Singleton({"model": "gpt-4o"})
b = Singleton({"model": "claude"})
print(a is b)    # True — same object
print(a.config)  # {"model": "gpt-4o"} — first init wins

# In practice: use module-level instances instead of __new__ for singletons
# __new__ is mainly needed for immutable type subclassing
```

---

## 4. `__dict__` — Instance Attributes (Java: Reflection `getDeclaredFields`)

```python
# Java: field inspection requires reflection — obj.getClass().getDeclaredFields()
# Python: every instance has a __dict__ — the attribute store

class LLMConfig:
    def __init__(self, model: str, temperature: float):
        self.model = model
        self.temperature = temperature

config = LLMConfig("gpt-4o", 0.2)
print(config.__dict__)
# {"model": "gpt-4o", "temperature": 0.2}

# Add attribute dynamically (not possible in Java without reflection):
config.max_tokens = 500
print(config.__dict__)
# {"model": "gpt-4o", "temperature": 0.2, "max_tokens": 500}

# This is how frameworks like Pydantic and dataclasses work internally
# They inspect and manipulate __dict__ to build validation, serialization, etc.
```

---

## 5. Dunder (Magic) Methods — The Python Protocol

```python
# Java: you implement specific interfaces (Comparable, Iterable, etc.)
# Python: you implement __dunder__ methods — Python calls them automatically

# Key dunders and their Java equivalents:

class RAGResult:
    def __init__(self, query: str, answer: str, score: float):
        self.query = query
        self.answer = answer
        self.score = score

    # __repr__ → Java toString() (for devs/logs)
    def __repr__(self) -> str:
        return f"RAGResult(score={self.score:.2f})"

    # __str__ → Java toString() (for end users)
    def __str__(self) -> str:
        return f"Q: {self.query} | A: {self.answer}"

    # __eq__ → Java equals()
    def __eq__(self, other) -> bool:
        if not isinstance(other, RAGResult):
            return NotImplemented
        return self.query == other.query and self.score == other.score

    # __hash__ → Java hashCode() — needed if __eq__ defined and want use in set/dict
    def __hash__(self) -> int:
        return hash((self.query, self.score))

    # __lt__ → Java Comparable.compareTo() — enables sorted(), min(), max()
    def __lt__(self, other) -> bool:
        return self.score < other.score

    # __len__ → Java Collection.size()
    def __len__(self) -> int:
        return len(self.answer.split())

    # __contains__ → Java Collection.contains() — enables 'in' operator
    def __contains__(self, item) -> bool:
        return item in self.answer

results = [RAGResult("q1", "ans1", 0.9), RAGResult("q2", "ans2", 0.7)]
results.sort()           # uses __lt__
best = max(results)      # uses __lt__
print("Python" in best)  # uses __contains__
len(best)                # uses __len__
```

---

## 6. Attribute Lookup Chain (Java: Field + Method Resolution)

```python
# When you access obj.attr, Python searches in this order:
# 1. obj.__dict__   (instance attributes)
# 2. type(obj).__dict__  (class attributes and methods)
# 3. parent classes (MRO — Method Resolution Order)

class Base:
    class_var = "base"    # class attribute — shared by all instances

    def __init__(self):
        self.instance_var = "instance"   # instance attribute — per instance

class Child(Base):
    class_var = "child"    # overrides Base.class_var for Child instances

obj = Child()
print(obj.instance_var)   # "instance" — found in obj.__dict__
print(obj.class_var)      # "child"    — found in Child.__dict__
print(obj.class_var)      # searches: obj.__dict__ → Child.__dict__ (found)

# getattr / setattr / hasattr — like Java reflection
print(getattr(obj, "class_var"))             # "child"
print(getattr(obj, "missing", "default"))    # "default" if not found
setattr(obj, "new_attr", 42)                 # obj.new_attr = 42
print(hasattr(obj, "instance_var"))          # True — like Java field != null check

# AI engineering use: dynamic model config
config = LLMConfig(...)
param = "temperature"
value = getattr(config, param, None)   # safe attribute access by string name
```

---

## 7. MRO — Method Resolution Order (Java: Single Inheritance Chain)

```python
# Java: single inheritance — clear chain
# Python: multiple inheritance — MRO determines which method is called

class Retriever:
    def fetch(self): return "Retriever.fetch"

class Cacher:
    def fetch(self): return "Cacher.fetch"

class CachedRetriever(Cacher, Retriever):   # Cacher listed first
    pass

obj = CachedRetriever()
print(obj.fetch())   # "Cacher.fetch" — Cacher is checked first

# See the full MRO:
print(CachedRetriever.__mro__)
# (<class 'CachedRetriever'>, <class 'Cacher'>, <class 'Retriever'>, <class 'object'>)

# Rule: left-to-right in class definition, depth-first, then object
# In AI engineering: rarely use multiple inheritance — use composition instead
# Know MRO for interviews and when debugging framework code (LangChain uses it)
```

---

## 8. Classes Are Objects (Metaclasses — Know Conceptually)

```python
# In Python, classes themselves are instances of 'type'
# type is the metaclass — the class of all classes
# Java equivalent: Class<T> is the runtime representation of a class

print(type(int))          # <class 'type'>
print(type(str))          # <class 'type'>
print(type(list))         # <class 'type'>

# You can create classes dynamically (like Java Class.forName + reflection):
MyDynamicClass = type("MyDynamicClass", (object,), {"x": 42, "greet": lambda self: "hi"})
obj = MyDynamicClass()
print(obj.x)        # 42
print(obj.greet())  # "hi"

# You rarely write metaclasses directly
# But frameworks like Pydantic, SQLAlchemy, Django ORM use them internally
# Knowing they exist helps when you debug cryptic framework errors
```

---

## 9. AI Engineering Patterns

```python
# Pattern 1: Dynamic config object from dict
class DynamicConfig:
    """Allows attribute access on a dict — like JavaScript object notation."""
    def __init__(self, data: dict):
        for key, value in data.items():
            setattr(self, key, value)   # sets self.key = value for each

    def __repr__(self):
        return f"DynamicConfig({self.__dict__})"

cfg = DynamicConfig({"model": "gpt-4o", "temperature": 0.2})
print(cfg.model)          # "gpt-4o" — attribute access instead of dict["model"]
print(cfg.temperature)    # 0.2

# Pattern 2: Registering agent tools by inspecting callables
def register_tools(tool_fns: list) -> dict:
    """Build a tool registry from a list of functions."""
    return {
        fn.__name__: {
            "fn": fn,
            "doc": fn.__doc__ or "",
            "args": fn.__code__.co_varnames[:fn.__code__.co_argcount],
        }
        for fn in tool_fns
    }

def search_web(query: str) -> str: """Search the web.""" ...
def query_db(sql: str) -> list: """Query the database.""" ...

registry = register_tools([search_web, query_db])
# {"search_web": {"fn": ..., "doc": "Search the web.", "args": ("query",)}, ...}
```

---

## 10. Interview Anchor

**"Explain Python's object model compared to Java."**

Say:
> "In Python, everything is an object — integers, strings, functions, and classes themselves are all instances of some class. Every object has three things: identity (memory address via `id()`), type (via `type()`), and value. Unlike Java where primitives aren't objects, Python has no primitives. Classes are instances of `type`, which is the metaclass. The practical impact in AI engineering: I can inspect any object at runtime using `__dict__`, use `getattr` for dynamic config access, implement `__dunder__` methods to make custom classes work with Python operators and built-ins — instead of implementing Java's `Comparable` or `Iterable` interfaces. The MRO determines method lookup in multiple inheritance — I use this knowledge when debugging LangChain's chain composition which uses multiple inheritance internally."

---

## 11. Quick Reference

```python
# Object properties
id(obj)           # identity — memory address (Java: identityHashCode)
type(obj)         # type — the class (Java: obj.getClass())
isinstance(obj, T) # type check (Java: obj instanceof T)

# Object inspection
obj.__dict__      # instance attribute store (Java: getDeclaredFields reflection)
obj.__class__     # same as type(obj)
obj.__doc__       # docstring

# Dynamic attribute access
getattr(obj, "attr", default)   # safe get (Java: reflection + null check)
setattr(obj, "attr", value)     # set by name
hasattr(obj, "attr")            # check existence

# Key dunders and Java equivalents
__init__      → constructor body
__new__       → memory allocation
__repr__      → toString() for devs
__str__       → toString() for users
__eq__        → equals()
__hash__      → hashCode()
__lt__        → compareTo() for <
__len__       → size()
__contains__  → contains()
__iter__      → iterator()

# MRO
ClassName.__mro__   # see method resolution order
```
