# System One Engineering — Module 6
# Topic: Jev Inside an Agent Harness

---

## 1. Intuition

If you have built an agent harness, you have a loop: assemble context, call the
model, validate the proposed action, authorise it, execute, observe, repeat.

Several steps in that loop are *decisions about the agent's own behaviour* —
should this tool call be allowed, is the task finished, is this request even in
scope. Today they are either brittle heuristics or an extra LLM call that costs
a second and a cent.

They are System 1 problems, and they are the natural place for Jev.

---

## 2. Core Concept

### Where it fits

```
  assemble context
        │
        ▼
  ┌───────────────┐
  │ SCOPE CHECK   │ ◄── Jev: is this request in scope?      (~100ms)
  └───────────────┘
        │
        ▼
  ┌───────────────┐
  │ ROUTE         │ ◄── Jev: which model class handles it?  (~100ms)
  └───────────────┘
        │
        ▼
     call LLM  ─────────────────────────────── seconds, dollars
        │
        ▼
  ┌───────────────┐
  │ RISK GATE     │ ◄── Jev: is this tool call dangerous?   (~100ms)
  └───────────────┘
        │
        ▼
     execute · observe · loop
        │
        ▼
  ┌───────────────┐
  │ DONE?         │ ◄── Jev: is the task complete?          (~100ms)
  └───────────────┘
```

Four Jev calls costing ~400ms and a fraction of a cent surround one LLM call
costing seconds and cents. The cheap model guards the expensive one.

### The risk gate

The pattern LangChain's `AutoModeMiddleware` demonstrates: evaluate a proposed
tool call before it runs.

```python
RISK = {
    "destructive": Noul(
        instructions="The proposed command deletes, overwrites or "
                     "irreversibly modifies data"
    ),
    "scope": Choice(
        instructions="Does the command stay within the stated task?",
        criteria={
            "in_scope":   "Clearly part of the task the user asked for.",
            "adjacent":   "Related but not requested.",
            "unrelated":  "Nothing to do with the task.",
        },
    ),
}

def authorise(command, task):
    r = client.system_one(
        state={"command": command, "task": task}, questions=RISK
    )
    if r.answers["destructive"].noul > 0.3:      # low bar: err toward asking
        return "confirm"
    if r.answers["scope"].choice == "unrelated":
        return "block"
    return "allow"
```

Note the asymmetric threshold. For a destructive-action check, a false positive
costs one confirmation prompt; a false negative costs a deleted database. Set
the bar where the asymmetry says, not at 0.5.

This complements a permission system; it does not replace one. Static
allow/deny lists remain the primary control — Jev catches what enumeration
misses. **Never let a probabilistic check be the only thing between an agent
and `rm -rf`.**

### Termination

"Is the task done?" is the classic runaway-loop bug. A Noul answers it directly:

```python
done = client.system_one(
    state={"task": task, "transcript": tail(transcript)},
    questions={"complete": Noul(instructions="The task has been completed")},
)
if done.answers["complete"].noul > 0.85:
    break
```

Keep the hard iteration cap. This is a second signal, not a replacement — a
probabilistic check can fail, and the cap is what stops the bill.

---

## 3. Worked Example

Model routing: send each request to the cheapest thing that can handle it.

```python
ROUTE = {
    "kind": Choice(
        instructions="What kind of work does this request require?",
        criteria={
            "lookup":    "A fact retrievable from a database or index.",
            "classify":  "A judgement over a fixed set of options.",
            "generate":  "Writing prose, code, or a summary.",
            "reason":    "Multi-step analysis with intermediate conclusions.",
        },
    ),
}

HANDLER = {
    "lookup":   run_query,        # no model at all
    "classify": run_system_one,   # Jev
    "generate": run_llm_small,
    "reason":   run_llm_large,
}

r = client.system_one(state={"request": text}, questions=ROUTE)
kind, conf = r.answers["kind"].choice, r.answers["kind"].confidence

# Ambiguous routing escalates upward: being too capable is cheap,
# being under-powered produces a wrong answer.
handler = HANDLER[kind] if conf >= 0.7 else run_llm_large
return handler(text)
```

The `"lookup"` branch is the valuable one. It routes to **no model at all** —
the cheapest call is the one you avoid, and a 100ms classifier that diverts 30%
of traffic to a SQL query pays for itself immediately.

---

## 4. Why This Matters in Production

**Guards become affordable.** A safety check that costs a second gets skipped
under latency pressure. One that costs 100ms survives review.

**The expensive model is called less.** Routing is where the money is.

**Decisions become loggable.** Every gate produces a distribution you can store
and later audit — far better than a heuristic nobody wrote down.

**Termination gets a real signal** instead of only a counter.

---

## 5. Pitfalls

**Replacing your permission system.** Jev augments static controls. It is not
an authorisation boundary.

**Symmetric thresholds on asymmetric risks.** 0.5 for "is this destructive?" is
wrong. Price the two error types and set the bar accordingly.

**Dropping the iteration cap** because termination detection works in testing.

**Adding latency you did not measure.** Four gates at 100ms is 400ms. Fine
around a 3s LLM call; not fine around a 200ms lookup. Measure the whole path.

**Routing on confidence you never calibrated.** The 0.7 above is illustrative.
Fit it (Module 4) before shipping it.

---

## 6. Exercises

1. Instrument your harness. Log wall time for every step. Find the steps that
   are decisions rather than work — those are the Jev candidates.

2. Implement the risk gate for one destructive tool. Run it in shadow mode:
   log the verdict, do not enforce. Compare against what humans approved.

3. Add termination detection alongside your iteration cap. Measure how often
   they disagree, and which was right.

4. Build the router. Measure what fraction of traffic reaches the "no model at
   all" branch. That number is your saving.

---

## 7. Further Reading

- LangChain, *Building a harness with Jev* — `ModelRouterMiddleware` and
  `AutoModeMiddleware`
- Your own `harness-engineering/05-permissions-and-safety` — the static
  controls this module sits on top of

> **Status.** The middleware patterns are documented by LangChain. The specific
> thresholds are illustrative and must be fitted per Module 4. Shadow-mode
> deployment before enforcement is a strong recommendation, not vendor guidance.
