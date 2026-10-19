# FDE toolkit

The evidence layer that shows whether the AI workflow is faster, cheaper and reliable enough to trust. The same code ships in AstroIntel and Bench Resource Optimizer. **Only `config.py` differs per project.**

| Module | What it does |
|---|---|
| `ledger.py` | One stored row per task: status, time, cost, tokens, model calls, retries, human review |
| `metrics.py` | Metric registry. Every dashboard number is one `@metric` function |
| `counters.py` | Per-task counters (model calls, tokens, retries, permission checks) |
| `permissions.py` | Agent permission matrix: read / write / needs human approval (default deny) |
| `evals.py` | Reproducible model comparison → `evals/reports/*.json` + `.md` |
| `api.py` | `GET /fde/outcomes`, `/fde/permissions`, `/fde/evals/latest` |
| `config.py` | Project-specific: database, workflows and baselines, pricing, matrix, eval suite |

## Add a new parameter (the daily workflow)

1. **Record it** where the task runs. Extra fields are stored in `attrs_json`, so no migration is needed:
   ```python
   fde_ledger.current().set(my_param=value)          # inside a @tracked endpoint
   fde_ledger.record_task(..., my_param=value)       # or when recording directly
   ```
2. **Define it** with one function in `metrics.py`:
   ```python
   @metric("my_param_avg", "My parameter (avg)", unit="ratio", group="Quality",
           description="What it means and why the business cares.")
   def _my_param_avg(rows, ctx):
       return mean(r.get("my_param") for r in rows)
   ```
3. **Done.** The API and both dashboards render it automatically, overall and per workflow.

Then copy the changed `fde/*.py` (never `config.py`) to the other project and run `pytest tests/test_fde.py` in both.

Units the dashboard formats: `pct`, `ms`, `usd`, `count`, `min`, `h`, `ratio`.

## Track a new endpoint

```python
@app.post("/my-task")
@fde_ledger.tracked("my_workflow")      # add the workflow to config.WORKFLOWS for a label and baseline
async def my_task(...):
    fde_perm.authorize("my_agent", "read", "some_resource")   # add the agent to config.PERMISSION_MATRIX
    ...
```

Status: **success** (output, no errors) · **degraded** (output, but an agent failed or fell back) · **rejected** (input refused on purpose, 4xx) · **failed** (no usable output, 5xx). Exceptions are recorded and re-raised unchanged.

## Model comparison

```bash
python -m fde.evals                                   # suite and models from config.py
python -m fde.evals --models deepseek-chat,deepseek-reasoner
python -m fde.evals --offline                         # no API calls; checks the pipeline
```

Commit `evals/reports/`; the dashboard shows `<suite>_latest.json`.

## Known limits

- Counters are process-wide. Two tasks running at the same moment in one process share them (the existing token trackers have the same limit).
- Baseline minutes are assumptions until measured with the customer, and are labelled so.
- The permission audit trail lives in memory per server process; the per-task counts are stored.
