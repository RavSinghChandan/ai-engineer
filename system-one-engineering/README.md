# System One Engineering

**Building software on models that decide instead of models that write.**

On 15 September 2026 TypeSafe AI released **Jev**, the first of what it calls
*System One models*. Jev does not generate text. You hand it state and typed
questions; it returns choices, scores and calibrated probabilities that code
branches on directly.

That difference is not a feature. It changes what the surrounding software has
to do — and most of what you know about prompting does not transfer.

---

## Who this is for

Engineers who already build with LLMs and now have a second kind of model to
place correctly. If you have written an agent harness, this is the companion
discipline: the harness decides *when* to call a model, and System One
engineering decides *which kind* and *how to trust the answer*.

Assumes: Python, HTTP, JSON. No ML background needed.

---

## Why a separate discipline

An LLM returns text you must parse, validate and defend against. A System One
model returns a value from a set you defined, with a number attached saying how
sure it is.

| | LLM | System One (Jev) |
|---|---|---|
| Output | free text or coaxed JSON | typed value from your schema |
| Can invent a value | yes | **no — schema-bounded** |
| Confidence | absent, or a guess | calibrated, first-class |
| Latency | seconds | 70–500 ms |
| Failure mode | plausible wrong prose | low confidence you can act on |

The last row matters most. An LLM that is unsure produces confident text. Jev
that is unsure produces a low number — and **a number your code can branch on
is worth more than prose no function can read.**

---

## What is actually verified here

This curriculum was written days after Jev's release, so it states its sources.

**Verified against TypeSafe's published interface and independent write-ups:**
the three primitives, the `state` + `questions` request shape, the
`response.answers[name]` accessor, field names (`choice`, `score`, `noul`,
`confidence`, `probabilities`, `usage`), and the single endpoint.

**Vendor claims, repeated as claims:** 40–200× faster and 40–400× cheaper than
frontier LLMs. TypeSafe acknowledges these came from workflows its own team
built. Treat them as an upper bound and measure your own.

**Open questions, flagged in place:** long-term calibration drift, behaviour on
genuinely out-of-domain state, and how confidence behaves under distribution
shift. Nobody has a year of production data on a model released this month.

Where a lesson teaches a pattern rather than a documented fact, it says so.

---

## The ten modules

| # | Module | The question it answers |
|---|---|---|
| 1 | What Is a System One Model | Why a model that cannot talk is useful |
| 2 | The Three Primitives | Choice, Score, Noul — and when each is wrong |
| 3 | Question Design | Why your criteria, not the model, decide accuracy |
| 4 | Confidence and Calibration | What the number means and how to set a threshold |
| 5 | Routing and Composition | Combining answers without letting the model compose |
| 6 | Jev in a Harness | Where it sits in an agent loop you already have |
| 7 | Evaluation and Drift | Proving it works, and noticing when it stops |
| 8 | Production Patterns | Retries, async, versioning, audit |
| 9 | Cost and Latency | Measuring the claims yourself |
| 10 | Interview Mastery | Explaining all of it under questioning |

## Projects

| # | Project | Builds |
|---|---|---|
| p01 | First Decisions | All three primitives against one state |
| p02 | Triage Router | Ticket classification with real branching |
| p03 | Confidence Gate | Stakes-based thresholds, human escalation |
| p04 | Fan-out Batcher | Speculative parallel questions |
| p05 | Calibration Harness | Fit thresholds on labelled data, lock them |
| p06 | LLM/Jev Router | Decide which model class handles a request |
| p07 | Eval Suite | Regression tests for a probabilistic component |
| p08 | Capstone | A decision service with audit and drift alerts |

Every project runs offline against a recorded-response fake, so the suite
passes without an API key. Set `TYPESAFE_API_KEY` to run them live.

```sh
./run-all-tests.sh
```
