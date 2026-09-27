# System One Engineering — Module 2
# Topic: Choice, Score and Noul

---

## 1. Intuition

Jev exposes exactly three question types. Not thirty. Three.

That constraint is the design. Every judgement you want from a model is one of:
*which one of these?*, *how much, on this scale?*, or *is this true?* If your
question does not fit one of the three, it is usually two questions wearing a
coat.

---

## 2. Core Concept

### Choice — pick one key

```python
Choice(
    instructions="Which team owns this ticket?",
    criteria={
        "billing":   "Payments, invoices, charges, refunds.",
        "technical": "Bugs, outages, errors, integrations.",
        "sales":     "Pricing, plans, upgrades.",
        "other":     "Anything not covered above.",
    },
)
```

Returns `.choice` (one of your keys), `.probabilities` (per key) and
`.confidence`. Up to 255 options.

The keys are for your code; the values are for the model. Write the values as
if briefing a new hire on their first day — that text is doing the real work.

### Score — position on an ordered scale

```python
Score(
    instructions="How severe is the customer impact?",
    criteria=[
        "Low — little or no impact.",
        "Moderate — some users affected, business continues.",
        "High — major functionality unavailable.",
        "Critical — severe production disruption.",
    ],
)
```

Returns `.score`, `.probabilities` per level, `.confidence`. Two to ten levels.

The list is **ordered**, and `.score` is a probability-weighted position, not
an index. Four levels give a continuous value across roughly 0..3. A ticket
that is mostly "High" with some "Critical" mass returns something like 2.7 —
information an integer label would throw away.

### Noul — probability a statement is true

```python
Noul(instructions="The customer is explicitly asking for a refund")
```

Returns `.noul`, a float in [0,1]. That is the whole answer: there is no
separate confidence field, because the probability *is* the answer.

The name is a portmanteau of *no* and *null*. Phrase it as a **statement to be
judged**, not a question — "the customer is asking for a refund", not "is the
customer asking for a refund?" Both work; the declarative form makes the
returned probability easier to reason about.

### Choosing between them

```
Is the answer one of a fixed set of labels?      → Choice
Is the answer a position on an ordered scale?    → Score
Is the answer the truth of a single statement?   → Noul
Is the answer a number you could compute?        → not a model question
Is the answer prose?                             → not this model
```

The fourth line catches more cases than you expect. "How many items in the
basket are fruit?" is arithmetic. Ask one Noul per item and `sum()` in Python —
that is Module 5's counting pattern, and it is both cheaper and correct.

---

## 3. Worked Example

The same judgement, done three ways, to show what each type throws away.

```python
# As a Choice — you get a label, and lose the gradient.
"urgency": Choice(
    instructions="How urgent is this?",
    criteria={"low": "...", "medium": "...", "high": "..."},
)
# -> choice="high", probabilities={"high": .7, "medium": .28, "low": .02}

# As a Score — you keep the gradient.
"urgency": Score(
    instructions="How urgent is this?",
    criteria=["Not urgent.", "Normal.", "Urgent.", "Critical."],
)
# -> score=2.68  (between "Urgent" and "Critical", nearer Critical)

# As a Noul — you get one bit, precisely.
"is_critical": Noul(instructions="This requires attention within the hour"),
# -> noul=0.83
```

All three are defensible. Which is right depends on what your code does next:

- Routing to one of three queues → **Choice**. You need a key.
- Sorting a backlog → **Score**. You need to order things.
- Firing a pager → **Noul**. You need one threshold on one statement.

Picking Score when you needed Choice means writing bucketing logic that the
model could have done. Picking Choice when you needed Score means discarding
the gradient and then complaining the model is coarse.

---

## 4. Why This Matters in Production

**Type choice determines your branching code.** The primitive is not a
formatting preference; it decides whether your next thirty lines are a
dictionary lookup, a comparison, or a sort.

**Probabilities are the audit trail.** Store the full distribution, not just
the winning label. When someone asks in March why a ticket was routed to
billing in January, `{"billing": 0.51, "technical": 0.49}` answers the question
and `"billing"` does not.

**Parallel questions are nearly free.** Multiple questions share one state and
one forward pass. This is why speculative fan-out works and why you should stop
rationing questions the way LLM costs taught you to.

---

## 5. Pitfalls

**Overlapping Choice criteria.** If two descriptions could both match, the
model splits probability between them and confidence collapses. That is the
model correctly reporting that *your taxonomy* is ambiguous. Fix the criteria,
not the threshold.

**No escape hatch.** Always include an `"other"` key. Without one, out-of-domain
input is forced into your nearest category with misleadingly high confidence.
This is the single most common production bug with Choice.

**Unordered Score levels.** Score assumes monotonic ordering. Passing
`["red", "green", "blue"]` produces a meaningless number. If the levels are not
a scale, it is a Choice.

**Compound Nouls.** "The customer is angry and wants a refund" cannot be
answered with one probability. Two Nouls, combined in code.

**Treating `.score` as an index.** It is a weighted position. `int(score)`
throws away exactly the information you chose Score to get.

**Too many Choice options.** The ceiling is 255; the useful number is closer to
ten. Beyond that, the criteria text gets thin and the distribution flattens.
Use a two-stage Choice — coarse, then fine — instead.

---

## 6. Exercises

1. Take a taxonomy from your codebase with more than eight categories. Write
   the `criteria` dict. Find the two that overlap. They always exist.

2. Write a Score with four levels where the gap between levels 2 and 3 is much
   larger than between 1 and 2. Predict what `.score` does to that asymmetry.
   (The scale is treated as evenly spaced — so it distorts. Decide whether that
   matters for your use, or whether you need two questions.)

3. Convert "is this ticket both urgent and from an enterprise customer?" into
   the correct primitives. The plan lookup is not a model question at all.

4. For one Choice in your design, write the `"other"` description. If you
   cannot describe what falls outside your taxonomy, your taxonomy is not
   closed and you do not yet understand the domain.

---

## 7. Further Reading

- TypeSafe AI interface documentation — primitive limits (255 options, 2–10
  score levels) and response field names
- Cloudflare AI model catalogue, `typesafe/jev` — the wire schema showing
  `answers[key]` with `type`, `choice`/`score`/`noul`, `confidence`,
  `probabilities`, `legend`

> **A note on accessors.** Some early tutorials show `response.choices[...]`,
> `response.nouls[...]` and `response.scores[...]` as typed views. The
> documented and wire-level form is `response.answers[name]`, and this
> curriculum uses it throughout. If a typed-view helper exists in your SDK
> version, it is a convenience over the same data.
