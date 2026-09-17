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

## Known limits

- The baselines are static. A real system would fit them from the advertiser's
  own historical data.
- Below ~10 projected sales the grade swings on a single conversion. The app
  flags this with a `low_volume` warning rather than showing a confident grade.
- The learning loop optimises against this model, so it can only prove that it
  improves *the model's* score — not real-world performance.

## Enabling live ad copy

Set `DEEPSEEK_API_KEY` in the environment (or Replit Secrets). Never commit it.
Without it the app runs fully offline. With a bad key, generation fails closed
and falls back to templates; the UI shows which source was used.
