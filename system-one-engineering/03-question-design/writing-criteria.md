# System One Engineering — Module 3
# Topic: Question Design

---

## 1. Intuition

With an LLM, when output is wrong you edit the prompt. There is a lot of prompt
to edit: role, tone, examples, formatting rules, threats about JSON.

With Jev there is almost no prompt. There is `instructions` — one sentence —
and `criteria`, which is your taxonomy written out. That is the entire surface
you control.

So when the answer is wrong, the problem is nearly always that **your categories
do not carve the world the way you assumed**. The model is reporting a defect
in your thinking, in the form of a flat probability distribution.

This module is about writing criteria that survive contact with real data.

---

## 2. Core Concept

### The criteria text is the specification

```python
Choice(
    instructions="Which team owns this ticket?",
    criteria={
        "billing":   "Payments, invoices, charges, refunds.",
        "technical": "Bugs, outages, errors, integrations.",
    },
)
```

The keys are identifiers for your code. The **values are the entire behavioural
specification of the classifier.** Everything the model knows about what
"billing" means in your company is in that string.

Write them the way you would brief a competent new hire who knows the industry
but not your product.

### Four properties of good criteria

**Mutually exclusive.** No input should plausibly match two descriptions. When
two overlap the model splits probability and confidence drops — correct
behaviour reporting an ambiguous taxonomy.

**Collectively exhaustive.** Every realistic input matches something. In
practice this means an `"other"` key, always.

**Concrete.** "Technical issues" is weak. "Bugs, outages, errors, integrations"
is strong. Nouns the model can match against beat abstractions.

**Boundary-marking.** The valuable sentence is usually the one about the edge:
`"billing": "Payments and refunds. A failed payment caused by an API outage is
technical, not billing."` That second clause resolves a real ambiguity, and it
is the kind of thing only someone who has read a hundred real tickets knows.

### Instructions vs criteria

`instructions` states the question. `criteria` defines the answer space. Put
domain knowledge in criteria, not instructions — criteria are per-option and
that is where discrimination happens.

```python
# Weak: knowledge is in the wrong place
Choice(
    instructions=(
        "Classify the ticket. Billing is about money. Technical is about "
        "software. If a payment fails due to an outage, that is technical."
    ),
    criteria={"billing": "Billing", "technical": "Technical"},
)

# Strong: each option carries its own boundary
Choice(
    instructions="Which team owns this ticket?",
    criteria={
        "billing":   "Payments, invoices, charges, refunds. Not failures "
                     "caused by an outage — those are technical.",
        "technical": "Bugs, outages, errors, integrations, including "
                     "payment failures caused by system problems.",
    },
)
```

### Point at the state

State is structured, and instructions can reference paths into it:

```python
Score(
    instructions="How frustrated is the customer in `ticket.messages[0].text`?",
    criteria=["Calm, stating facts.", "Frustrated but civil.", "Angry."],
)
```

With a large state object this focuses the judgement. Without it, the model
weighs everything you sent — including fields you only included for logging.

---

## 3. Worked Example

An intent classifier, over three revisions.

```python
# v1 — categories that feel obvious to whoever wrote them
criteria={
    "refund":    "Customer wants money back",
    "complaint": "Customer is unhappy",
    "question":  "Customer asks something",
}
```

Field results: `"I'm furious, I was double-charged, fix this"` returns
`complaint: 0.41, refund: 0.39, question: 0.20`. Confidence ~0.12. The model is
telling you these are not three categories; they are three *aspects*, and most
angry tickets have all three.

```python
# v2 — separate the axes
questions = {
    "intent": Choice(
        instructions="What does the customer want to happen?",
        criteria={
            "refund":      "Money returned.",
            "fix":         "A technical problem resolved.",
            "information": "A question answered.",
            "other":       "Something else.",
        },
    ),
    "frustration": Score(
        instructions="How frustrated is the customer?",
        criteria=["Calm.", "Mildly annoyed.", "Angry.", "Threatening to leave."],
    ),
}
```

Same ticket: `intent.choice == "refund"` at 0.89, `frustration.score == 2.4`.
Both facts preserved, neither contaminating the other.

```python
# v3 — mark the boundary you learned from real data
"refund": "Money returned, including partial refunds and credits. "
          "Not a request to cancel a future renewal — that is 'other'.",
```

That last clause came from thirty misrouted tickets. **This is the loop:**
criteria are not written once, they accrete boundary knowledge from production.

Keep them in version control, and treat a criteria change like a schema
migration — because it is one. Every threshold you calibrated (Module 4) was
fitted against the old wording.

---

## 4. Why This Matters in Production

**Low confidence localises the bug.** With an LLM a wrong answer gives you
nothing to debug. Here, a flat distribution points at the two criteria that
overlap. The model hands you the diagnosis.

**Criteria are reviewable.** They sit in a `.py` file, they diff, and a domain
expert who cannot read Python can still review the strings. That is a real
advantage over a 2,000-token prompt.

**Changing criteria invalidates thresholds.** Any wording change means
re-running calibration. Module 4 makes this concrete; Module 7 makes it
enforced.

---

## 5. Pitfalls

**Categories that are aspects.** The v1 failure. If real inputs routinely have
several of your categories at once, they are not categories.

**Missing `"other"`.** Out-of-domain input gets forced into the nearest bucket
with high confidence, because the model is answering the question you asked —
"which of these?" — and you did not offer an exit.

**Criteria written by one person.** Whoever writes them encodes their own
mental model. Have someone who handles the real tickets read them.

**Leaking the answer.** `"critical": "Tickets from enterprise customers"` is
not a judgement, it is a database lookup. Do not ask a model what you can
compute.

**Instructions that argue.** "Be careful", "think step by step", "be accurate"
do nothing here. There is no reasoning trace to influence. Delete them.

**Unstable wording.** Rewording criteria between evaluation and production
means your measured accuracy describes a different classifier.

---

## 6. Exercises

1. Take your worst-performing LLM classifier. Write its taxonomy as `criteria`.
   Find the overlapping pair — and notice you found it by writing, before
   calling anything.

2. For each option, write one sentence naming what it is *not*. If you cannot,
   you do not have the field experience yet to close the taxonomy.

3. Run the same state through two wordings of the same question. Compare
   confidence. This is how you measure criteria quality without labels.

4. Write criteria for "should this PR be auto-merged?" Notice how much is
   deterministic (tests pass, size, files touched) and how little is actually a
   judgement. Ask the model only the judgement.

---

## 7. Further Reading

- TypeSafe AI question-design documentation
- `awesome-jev-by-typesafe` — community patterns, notably *atomic questions*:
  one narrow judgement per question
- Module 4 — Confidence and Calibration, which depends entirely on this module

> **Status of this module.** The mechanics (fields, limits, state paths) are
> documented. The design guidance — CE/ME criteria, boundary clauses, the
> revision loop — is engineering judgement carried over from classifier design
> generally, applied to an interface that is weeks old. Treat it as a starting
> discipline, not settled practice.
