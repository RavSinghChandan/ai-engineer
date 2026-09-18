# How the numbers are produced

Every metric this app shows is a **projection**, not a measurement. Nothing here
is connected to Google Ads, Meta, or any ad account. This document states
exactly how each number is derived so the claims can be checked.

## What is real and what is simulated

| Part | Status |
|---|---|
| Agent orchestration (LangGraph, 5 nodes, state passing) | Real |
| Learning loop (stores runs, retrieves similar, applies changes) | Real |
| Ad copy generation | Real when `DEEPSEEK_API_KEY` is set; template library otherwise |
| Campaign performance metrics | **Simulated** — projected from the tables below |
| Ad platform delivery | Not implemented — nothing is ever published |

The UI labels this on every result: a `Projected — simulation model v1` badge,
the basis, and a **Show formula** toggle that prints the formula below.

## The formula

```
ctr    = baseline_ctr  x tone_ctr_lift  + audience_quality_bonus
conv   = baseline_conv x tone_conv_lift + audience_quality_bonus
clicks = budget / cpc
impressions  = clicks / (ctr / 100)
leads        = clicks x (conv / 100)
sales        = leads x lead_to_sale_rate
revenue      = sales x revenue_per_sale
gross_profit = revenue x gross_margin
roas = revenue / budget
roi  = (gross_profit - budget) / budget
```

`roi` is a **contribution** multiple, so `0` is break-even. `roas` is the gross
figure. Both are shown, because ROAS alone flatters a low-margin campaign.

## Why it is deterministic

The model previously called `random.uniform()` on every run, so the same
campaign produced a different ROI each time — one run reported +1.84x, the next
+0.55x for identical input. That makes "learning improved the campaign by X%"
meaningless, since most of the difference was noise.

Variance is still present, but it is **seeded from the campaign input**
(`sha256` of type, product, budget, audience, platform). Identical inputs now
always produce identical output, so any change in the result is caused by
something the agents actually changed.

## Tables

All values live in `backend/graph/model/simulation.py`.

- `BASELINE` — starting CTR, conversion rate and CPC per vertical.
- `TONE_LIFT` — multipliers per ad tone. The copy agent and the performance
  model read the same table, so they can never disagree.
- `LEAD_TO_SALE` — share of leads that close. Lead-gen verticals are low
  (real estate 6%); ecommerce is high (85%) because click and purchase are the
  same session.
- `GROSS_MARGIN` — margin before ad spend, used for contribution ROI.
- `AOV` — revenue per closed sale.

These are plausible Indian digital-advertising reference figures, not measured
results from any account. They are the model's assumptions, and changing them
changes every projection.

## Execution timing

The agents' own work is genuinely instant — a dictionary lookup and some
arithmetic complete in about **34ms for the whole pipeline** (verify with
`AGENT_PACE=0`). A workflow that finishes that fast looks fake, and the
frontend used to paper over it with a fixed 500ms-per-agent client-side loop
that ran whether or not the backend was reachable.

That loop is gone. The backend now streams each agent's sub-steps over
server-sent events (`POST /api/execute-workflow/stream`) and the UI renders
what the backend reports:

- 19 declared sub-steps across the 5 agents (`GET /api/workflow-steps`)
- each step carries `real_ms`, an estimate of its cost against a live LLM or
  ad-platform API — **~28s** for a full run
- `AGENT_PACE` (default `0.7`) scales those estimates, and each step is then
  floored by the time its own text takes to read — roughly a **41s run**, with
  no step shorter than 1.8s

The reading floor exists because the scaled latencies alone put several steps
at 0.18–0.45s against ~2.5s of text. The words changed before anyone could
take them in, which reads as a progress animation rather than as work. A step
now stays up for `max(scaled_latency, words / 5.5 + 0.35s, 1.5s)`.

The pacing is latency *shaping*, not a fake timer:

- a step whose work is real is never padded — the DeepSeek call inside the ad
  copy agent costs exactly what it costs, and its actual duration is credited
  against that step's shaping
- progress only advances when the backend says a step finished; if the backend
  dies mid-run, the bar stops
- `AGENT_PACE=0` removes shaping entirely for tests and benchmarking

Completed agents and their steps stay on screen in a running trail rather than
being overwritten, each finished step showing what it actually took, so the
run can be read back after it ends.

The UI states the scaling openly under the progress bar rather than implying
the agents are as fast as the demo suggests.

## Known limits

- The baselines are static. A real system would fit them from the advertiser's
  own historical data.
- Below ~10 projected sales the grade swings on a single conversion. The app
  flags this with a `low_volume` warning rather than showing a confident grade.
- The learning loop optimises against this model, so it can only prove that it
  improves *the model's* score — not real-world performance.
- The `real_ms` per-step latencies are estimates of what these calls cost in a
  deployed system, not measurements from this code.

## Enabling live ad copy

Set `DEEPSEEK_API_KEY` in the environment (or Replit Secrets). Never commit it.
Without it the app runs fully offline. With a bad key, generation fails closed
and falls back to templates; the UI shows which source was used.
