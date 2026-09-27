# System One Engineering — Module 1
# Topic: What Is a System One Model

---

## 1. Intuition

You are writing a support system. A ticket arrives. Before anything else, you
need three facts: which team owns it, how bad it is, and whether the customer
asked for a refund.

With an LLM you write a prompt, beg for JSON, parse it, validate the category
is one you recognise, handle the case where it invented a fifth category,
handle the case where it returned prose instead of JSON, and then — with no
idea whether the model was sure or guessing — branch on it.

A System One model removes all of that. You hand it the ticket and three typed
questions. It returns a category **from your list**, a severity **on your
scale**, and a probability the customer wants a refund. In under half a second.

It cannot invent a fifth category. Not because it was told not to — because the
output space is your schema.

---

## 2. Core Concept

### The name

TypeSafe borrows from Kahneman: System 1 is fast, automatic judgement; System 2
is slow, deliberate reasoning. An LLM doing chain-of-thought is System 2 —
expensive, general, and unnecessary for "is this ticket urgent?"

Most production "AI" is a System 1 problem being solved with System 2 machinery.

### Where it sits

```
┌──────────────────────────────────────────────────┐
│  LLM            generates text, reasons, writes  │  System 2
│                 seconds · dollars · unbounded    │
├──────────────────────────────────────────────────┤
│  SYSTEM ONE     judges, classifies, scores       │  System 1
│                 milliseconds · cents · bounded   │
├──────────────────────────────────────────────────┤
│  CODE           computes, composes, executes     │  deterministic
└──────────────────────────────────────────────────┘
```

The discipline is knowing which row a given decision belongs to. Most teams
push everything to the top row because it is the one they know.

### Formal definition

> A **System One model** maps program state plus a typed question to a value
> drawn from a caller-supplied schema, accompanied by a calibrated probability
> distribution over that schema.

Three load-bearing words:

**Typed** — the answer's shape is fixed before the call. Choice returns one of
your keys. Score returns a position on your scale. Noul returns a float in
[0,1]. There is no parsing step and no validation step.

**Caller-supplied** — you define the options. The model never introduces a
value you did not enumerate, so the class of bug where a model invents a
plausible-sounding category cannot occur.

**Calibrated** — the probabilities are trained to match observed frequency.
TypeSafe calls the method **RLCD**, Reinforcement Learning for Calibrated
Decisions: probabilities optimised against outcomes rather than against human
rater preference. That last clause is the whole difference from RLHF. RLHF
optimises for answers people *like*; RLCD optimises for probabilities that are
*correct about how often they are right*.

### What it cannot do

It does not write. No summaries, no explanations, no drafted replies, no code.
If the deliverable is prose, this is the wrong model — and that is most of what
people currently use LLMs for.

It also gives no reasoning. You get a number, not an argument. When you need to
show a human *why*, you need the distribution and your own logic, not the
model's narration.

---

## 3. Worked Example

One ticket, three judgements, one call.

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

ticket = (
    "Our production API has returned HTTP 500 since this morning. "
    "About 40% of customers cannot check out. We restarted twice. "
    "This is blocking our business."
)

with TypeSafeClient() as client:
    response = client.system_one(
        state={"ticket": ticket, "customer": {"plan": "enterprise"}},
        questions={
            "team": Choice(
                instructions="Which team owns this ticket?",
                criteria={
                    "billing":   "Payments, invoices, charges, refunds.",
                    "technical": "Bugs, outages, errors, integrations.",
                    "sales":     "Pricing, plans, upgrades.",
                },
            ),
            "severity": Score(
                instructions="How severe is the customer impact?",
                criteria=[
                    "Low — little or no impact.",
                    "Moderate — some users affected, business continues.",
                    "High — major functionality unavailable.",
                    "Critical — severe production disruption.",
                ],
            ),
            "wants_refund": Noul(
                instructions="Is the customer explicitly asking for a refund?"
            ),
        },
    )

team = response.answers["team"]
print(team.choice)          # "technical"
print(team.confidence)      # 0.94
print(team.probabilities)   # {"technical": 0.96, "billing": 0.03, "sales": 0.01}

print(response.answers["severity"].score)      # 2.7 on the 0..3 scale
print(response.answers["wants_refund"].noul)   # 0.04
print(response.usage)                          # input_tokens / output_tokens
```

All three questions evaluate **in parallel against the same state**, so the
third costs almost nothing over the first.

Note `wants_refund` returning `0.04`. The customer never mentioned a refund.
An LLM asked the same question would often produce a confident "no" with no
way to distinguish it from a confident "no" about an ambiguous ticket. Here the
uncertainty is a number.

---

## 4. Why This Matters in Production

**The parse layer disappears.** No JSON mode, no schema retries, no
`ValidationError` handling, no "the model returned markdown fences again."

**Unsure becomes actionable.** The most dangerous LLM failure is fluent
confidence on a case it should have escalated. A calibrated probability turns
that into an `if`.

**The cost profile changes what you can afford to ask.** At LLM prices you ask
the minimum. At Jev's published price you can ask ten questions speculatively
and discard nine. Module 5 builds on that.

**It makes the boundary explicit.** The model judges; your code composes. Every
threshold, weight and action lives in your repository, reviewable and
diffable — not in a prompt.

---

## 5. Pitfalls

**Using it for anything generative.** It has no text output. This sounds
obvious and is the most common first mistake.

**Trusting vendor benchmarks.** 40–200× faster and 40–400× cheaper are
TypeSafe's figures from workflows TypeSafe's own team built. Plausible for
classification, unproven for yours. Module 9 measures it properly.

**Treating confidence as accuracy.** Confidence is derived from the shape of
the probability distribution — how peaked it is. A confidently wrong answer is
possible when the question is badly posed. Confidence tells you the model was
decisive, not that it was right. Module 4 is entirely about this distinction.

**Assuming calibration transfers to your domain.** Calibration was trained on
TypeSafe's data. On your tickets, at your thresholds, it must be verified.
Module 7 builds that harness.

**Forgetting it is still a model.** It is a transformer trained on synthetic
data. Schema-bounded output removes one class of error, not all of them.

---

## 6. Exercises

1. Take a place in your codebase where you call an LLM and parse JSON. Count
   the lines that exist only to defend against malformed output. That count is
   your saving.

2. List five decisions your product makes with an LLM today. Mark each as
   System 1 or System 2. Be strict: if the output is consumed by code rather
   than read by a person, it is System 1.

3. For one of them, write the `questions` dict. Do not call the API. The
   exercise is discovering how hard it is to enumerate your own categories —
   which is Module 3's subject.

4. Write down what you would need to observe to stop believing the latency
   claim. Then write down how you would measure it.

---

## 7. Further Reading

- TypeSafe AI, Jev announcement and interface documentation (15 Sep 2026)
- *Jev (AI model)*, Wikipedia — for the RLCD description and release facts
- Cloudflare AI model catalogue, `typesafe/jev` — the wire-level schema
- Kahneman, *Thinking, Fast and Slow* — where the System 1/2 framing comes from

> **Sources and their weight.** Interface details here follow TypeSafe's
> published schema and are corroborated by independent write-ups. Performance
> figures are vendor-reported. Nothing in this module rests on a year of
> production experience, because the model is weeks old.
