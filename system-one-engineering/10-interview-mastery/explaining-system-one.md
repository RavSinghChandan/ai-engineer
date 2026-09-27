# System One Engineering — Module 10
# Topic: Interview Mastery

---

## 1. Intuition

This subject is weeks old. In an interview that cuts both ways: almost nobody
has deep experience, so demonstrating that you understand *where it fits* and
*what is still unknown* beats reciting the marketing.

The strongest signal you can send is calibrated confidence about a model whose
selling point is calibrated confidence.

---

## 2. Core Concept

### The thirty-second answer

> Jev is a System One model — it does not generate text. You send it state and
> typed questions, and it returns a value from a schema you defined, with a
> calibrated probability. Because the answer space is your schema, it cannot
> hallucinate a category, and because the probability is calibrated you can set
> thresholds and branch on them. It is for the classification and judgement
> layer of a system, not the generative layer.

Then stop. The follow-up question tells you what they actually care about.

### The four questions you will get

**"How is this different from an LLM with JSON mode?"**

> Three ways. Schema-bounded output means an invalid value is impossible rather
> than unlikely, so the parse-and-validate layer disappears. Calibrated
> confidence gives you a number to threshold on — JSON mode gives you a value
> with no reliable sense of how sure the model was. And the latency is ~100ms
> instead of ~2s, which is what makes it viable inside a request path.

**"When would you not use it?"**

> Anything generative — summaries, code, replies. Anything needing a reasoning
> trace you show a human. Anything where you cannot enumerate the answer space,
> which is the real constraint: if you cannot write the criteria, it is not a
> System One problem. And anything a database query answers, which is more
> cases than people expect.

**"How do you know it is working?"**

> A labelled golden set, asserting precision *and* coverage at a fitted
> threshold — never asserting a single answer, because that test goes flaky and
> gets deleted. Then distribution monitoring in production, which needs no
> labels: mean confidence, the `other` rate, class mix. If confidence rises
> while precision falls, the model changed under me.

**"What worries you about it?"**

> Calibration is trained on the vendor's distribution, not mine, so I verify it
> with a reliability curve before trusting thresholds. The benchmark numbers
> come from workflows the vendor's own team built, so I measure my own. And the
> model is weeks old, so nobody has long-run drift data — which is exactly why
> I would pin the version and monitor from day one.

That last answer is usually the one that lands, because it demonstrates you
evaluate tools rather than adopt them.

---

## 3. Worked Example

**"Design ticket triage for 50,000 tickets a month."**

Structure the answer around the boundary between model and code.

> **Decisions, not prose.** Department, severity, refund request, churn risk,
> legal mention. All System 1: consumed by code, not read by a person. One
> fan-out call, five questions, one state.
>
> **Criteria are the real work.** Mutually exclusive, collectively exhaustive,
> with an explicit `other`. The boundary sentences come from reading real
> tickets — "a payment failure caused by an outage is technical, not billing."
> I'd expect to revise these against production misroutes.
>
> **Composition in code.** Weighted priority from normalised answers. Weights in
> version control, not in a prompt, so they are reviewable and testable without
> an API key.
>
> **Thresholds by blast radius.** Auto-routing is reversible, so ~0.75. Auto-
> refunding is not, so ~0.95 or a human. Fitted on labelled dev data, verified
> on held-out, written to a lock file keyed by a hash of the criteria text — so
> CI fails if someone edits criteria without refitting.
>
> **Degradation.** API down, fail to the human queue. Never fail to a guess.
>
> **Evaluation.** 200-case golden set including out-of-domain, asserting
> precision and coverage. Distribution monitoring in production.
>
> **The number I'd report.** "We automate 63% at 95% precision" — and I'd flag
> that if coverage drops versus the current system, total cost can rise even
> though cost per decision fell.

That last line is what separates a senior answer from a competent one.

### Questions to ask them

- What happens today when your classifier is unsure? (If the answer is
  "nothing", the calibration argument is your whole pitch.)
- Do you have labelled data? (No labels means no thresholds means no
  automation, and that is the first thing to fix.)
- What is the cost of a false positive versus a false negative? (This sets
  every threshold in the design.)

---

## 4. Why This Matters

**It is a differentiator right now.** Few candidates can discuss this
coherently in late 2026.

**It demonstrates judgement, not recall.** Knowing when *not* to use something
is the harder and more valuable signal.

**It shows you read primary sources.** Citing TypeSafe's own benchmark caveat
tells an interviewer you read the documentation rather than a thread.

---

## 5. Pitfalls

**Quoting 200× as fact.** Say "vendor-reported, from their own workflows, and
I'd measure my own." Every experienced interviewer is testing for this.

**Calling it an LLM replacement.** It replaces one layer. Saying otherwise
reveals you have not built with it.

**Confusing confidence with accuracy.** Fatal in a senior interview.

**Pretending to production experience.** The model is weeks old. Say "I've
built with it, here is what I measured" or "I've read the interface carefully,
here is how I'd approach it." Both are respectable; a fabricated war story is
not, and it is trivially exposed by one follow-up.

**Forgetting `other`.** If your whiteboard taxonomy has no escape hatch, expect
to be asked what happens to an out-of-domain input.

---

## 6. Exercises

1. Deliver the thirty-second answer out loud, timed. If it runs past forty
   seconds, cut it.

2. Whiteboard the triage design in ten minutes. Practise saying which parts are
   code and which are the model.

3. Prepare one honest number from your own measurement. One real figure beats
   any amount of vendor recall.

4. Write your answer to "what worries you about it?" — three specific
   technical concerns, each with the mitigation you would implement.

5. Practise saying "I don't know, and here is how I'd find out" about long-run
   calibration drift. It is the correct answer and most candidates will bluff.

---

## 7. Further Reading

- Every prior module in this curriculum
- TypeSafe AI primary documentation — read it rather than summaries
- `harness-engineering/10-interview-mastery` — the general discipline

> **Status.** Interview framings are judgement. The technical claims referenced
> trace to the earlier modules and their sources.
