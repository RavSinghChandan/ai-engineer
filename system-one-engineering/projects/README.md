# Projects

Eight projects, building from a first API call to a production decision
service. Each is self-contained and runs offline.

| # | Project | Builds | Module |
|---|---|---|---|
| p01 | First Decisions | All three primitives against one state | 1–2 |
| p02 | Triage Router | Fan-out plus composition in code | 2, 5 |
| p03 | Confidence Gate | Stakes-based thresholds, fail-closed | 4 |
| p04 | Fan-out Batcher | Parallel questions, the counting pattern | 5 |
| p05 | Calibration Harness | Fit thresholds, lock them to criteria | 4, 7 |
| p06 | LLM/Jev Router | Route to the cheapest capable handler | 6 |
| p07 | Eval Suite | Metrics-based tests, label-free drift signals | 7 |
| p08 | Capstone | Decision service with audit and degradation | 8 |

## Running

```sh
./run-all-tests.sh          # from the curriculum root
cd projects/p01-first-decisions && python3 -m pytest -q
```

## No API key required

`fake_typesafe.py` is a deterministic offline stand-in, symlinked into each
project. It mirrors the documented response shape —
`response.answers[name].choice / .score / .noul / .confidence /
.probabilities`, plus `response.model` and `response.usage`.

**It is a test double, not a simulator.** Answers come from keyword scoring,
not from a model. It exists so you can test *your* code — composition,
thresholds, routing, degradation — which is the code you actually own. It
tells you nothing about how Jev behaves.

To run against the real API, set `TYPESAFE_API_KEY`; p01 demonstrates the
import switch.

## What the tests deliberately do not do

No test asserts a specific answer for a specific input. Tests assert
*invariants*: choices come from the schema, probabilities sum to one,
confidence stays in range, raising a threshold never increases coverage,
unknown actions never auto-execute, audit records never contain raw state.

Those hold across model versions. `assert choice == "billing"` does not, and a
test that breaks on an unrelated model update gets muted and then deleted.
