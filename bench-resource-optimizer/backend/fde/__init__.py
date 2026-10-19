"""
FDE toolkit — the evidence layer a Forward Deployed Engineer needs to prove an
AI workflow works for the business, not just that it runs.

  fde.ledger       one persisted row per task (status, time, cost, model usage, human review)
  fde.metrics      metric REGISTRY — every dashboard number is one registered function
  fde.counters     per-task counters (model calls, retries, permission checks, ...)
  fde.permissions  agent permission matrix: read / write / needs human approval
  fde.evals        reproducible model-comparison evaluation → JSON + Markdown report
  fde.api          FastAPI router exposing all of the above

Only fde/config.py is project-specific. Everything else is identical across
projects, so a fix or a new metric can be copied as-is.

Adding a new parameter (the daily workflow):
  1. Record it:  t.set(my_param=value)   inside a `with ledger.track(...) as t:` block
                 (stored in attrs_json — no schema migration needed)
  2. Define it:  add one @metric(...) function in fde/metrics.py
  3. Done:       the API and the dashboard pick it up automatically.
"""
