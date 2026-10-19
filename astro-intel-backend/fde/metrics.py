"""
Metric registry. Every number on the FDE dashboard is one function below.

To add a metric (e.g. a parameter you started recording with t.set(x=...)):

    @metric("avg_x", "Average X", unit="count", group="Quality",
            description="What X means and why the business cares.")
    def _avg_x(rows, ctx):
        return mean(r.get("x") for r in rows)

That's all — `compute()` evaluates every registered metric per workflow and
overall, and the API/dashboard render whatever is registered.

Units the dashboard understands: pct · ms · usd · count · min · h · ratio
Rows are dicts: core ledger columns + any recorded attrs (missing → None).
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional

Rows = List[Dict[str, Any]]


@dataclass
class MetricContext:
    workflow: Optional[str]          # None = all workflows together
    baseline_minutes: Optional[float]


@dataclass
class Metric:
    key: str
    label: str
    fn: Callable[[Rows, MetricContext], Any]
    unit: str = "count"
    group: str = "Outcome"
    description: str = ""
    assumption: bool = False          # shown with an "assumption" tag
    higher_is_better: Optional[bool] = None
    per_workflow_only: bool = False   # e.g. baselines differ per workflow
    order: int = field(default=0)


REGISTRY: Dict[str, Metric] = {}


def metric(key: str, label: str, *, unit: str = "count", group: str = "Outcome",
           description: str = "", assumption: bool = False,
           higher_is_better: Optional[bool] = None, per_workflow_only: bool = False):
    """Register a metric function. Keys must be unique."""
    def deco(fn: Callable[[Rows, MetricContext], Any]):
        if key in REGISTRY:
            raise ValueError(f"metric '{key}' registered twice")
        REGISTRY[key] = Metric(key, label, fn, unit, group, description, assumption,
                               higher_is_better, per_workflow_only, order=len(REGISTRY))
        return fn
    return deco


def compute(rows: Rows, ctx: MetricContext) -> List[Dict[str, Any]]:
    out = []
    for m in sorted(REGISTRY.values(), key=lambda m: m.order):
        if m.per_workflow_only and ctx.workflow is None:
            continue
        try:
            value = m.fn(rows, ctx)
        except Exception as exc:          # one bad metric must not hide the others
            value, err = None, f"{type(exc).__name__}: {exc}"
        else:
            err = None
        item = {
            "key": m.key, "label": m.label, "value": _round(value), "unit": m.unit,
            "group": m.group, "description": m.description, "assumption": m.assumption,
            "higher_is_better": m.higher_is_better,
        }
        if err:
            item["error"] = err
        out.append(item)
    return out


# ── helpers ───────────────────────────────────────────────────────────────────

def _round(v: Any) -> Any:
    return round(v, 6 if abs(v) < 1 else 2) if isinstance(v, float) else v


def _num(values: Iterable[Any]) -> List[float]:
    return [float(v) for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]


def pct(part: float, whole: float) -> Optional[float]:
    return round(part / whole * 100, 1) if whole else None


def percentile(values: List[float], p: float) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 1)


def mean(values: Iterable[Any]) -> Optional[float]:
    v = _num(values)
    return statistics.fmean(v) if v else None


def status(rows: Rows, *names: str) -> int:
    return sum(r["status"] in names for r in rows)


def attempted(rows: Rows) -> int:
    """Tasks the system was asked to complete (excludes inputs rejected on purpose)."""
    return len(rows) - status(rows, "rejected")


def total_cost(r: Dict[str, Any]) -> float:
    return float(r.get("cost_usd") or 0) + float(r.get("review_cost_usd") or 0)


def fresh(rows: Rows) -> Rows:
    return [r for r in rows if not r.get("cache_hit")]


def timed(rows: Rows) -> Rows:
    """Rows whose duration reflects real processing: not cached, not rejected up front."""
    return [r for r in fresh(rows) if r["status"] != "rejected"]


def reviewed(rows: Rows) -> Rows:
    return [r for r in rows if r.get("reviewed")]


# ══ Outcome ═══════════════════════════════════════════════════════════════════

@metric("tasks", "Tasks", group="Outcome", description="Tasks received in the window")
def _tasks(rows, ctx):
    return len(rows)


@metric("success_rate", "Success rate", unit="pct", group="Outcome", higher_is_better=True,
        description="Completed with no agent errors ÷ tasks attempted (rejected inputs excluded)")
def _success_rate(rows, ctx):
    return pct(status(rows, "success"), attempted(rows))


@metric("completion_rate", "Task completion rate", unit="pct", group="Outcome", higher_is_better=True,
        description="Produced usable output (success + degraded) ÷ tasks attempted")
def _completion_rate(rows, ctx):
    return pct(status(rows, "success", "degraded"), attempted(rows))


@metric("failure_rate", "Failure rate", unit="pct", group="Outcome", higher_is_better=False,
        description="No usable output (exception, 5xx, empty result) ÷ tasks attempted")
def _failure_rate(rows, ctx):
    return pct(status(rows, "failed"), attempted(rows))


@metric("degraded_rate", "Degraded rate", unit="pct", group="Outcome", higher_is_better=False,
        description="Output produced but an agent failed and was skipped or fell back")
def _degraded_rate(rows, ctx):
    return pct(status(rows, "degraded"), attempted(rows))


@metric("input_rejection_rate", "Inputs rejected", unit="pct", group="Outcome",
        description="Refused on purpose (validation, guardrail, 4xx) ÷ all tasks — not a failure")
def _rejection_rate(rows, ctx):
    return pct(status(rows, "rejected"), len(rows))


# ══ Speed ═════════════════════════════════════════════════════════════════════

@metric("latency_p50_ms", "Processing time P50", unit="ms", group="Speed", higher_is_better=False,
        description="Median wall-clock time of non-cached, non-rejected tasks")
def _p50(rows, ctx):
    return percentile(_num(r["duration_ms"] for r in timed(rows)), 50)


@metric("latency_p95_ms", "Processing time P95", unit="ms", group="Speed", higher_is_better=False,
        description="95th-percentile wall-clock time of non-cached, non-rejected tasks")
def _p95(rows, ctx):
    return percentile(_num(r["duration_ms"] for r in timed(rows)), 95)


@metric("cache_hit_rate", "Cache hit rate", unit="pct", group="Speed", higher_is_better=True,
        description="Tasks answered from cache (near-zero time and cost)")
def _cache_rate(rows, ctx):
    return pct(len(rows) - len(fresh(rows)), len(rows))


# ══ Cost ══════════════════════════════════════════════════════════════════════

@metric("cost_total_usd", "Total model cost", unit="usd", group="Cost",
        description="Model spend for all tasks in the window, including the review step")
def _cost_total(rows, ctx):
    return sum(total_cost(r) for r in rows)


@metric("cost_per_task_usd", "Cost per task", unit="usd", group="Cost", higher_is_better=False,
        description="Total cost ÷ tasks attempted")
def _cost_per_task(rows, ctx):
    n = attempted(rows)
    return sum(total_cost(r) for r in rows) / n if n else None


@metric("cost_per_successful_task_usd", "Cost per successful task", unit="usd", group="Cost",
        higher_is_better=False,
        description="ALL spend (failed and retried runs included) ÷ successful tasks. "
                    "The real unit cost: failures and retries burn money too.")
def _cost_per_success(rows, ctx):
    ok = status(rows, "success")
    return sum(total_cost(r) for r in rows) / ok if ok else None


# ══ Model usage ═══════════════════════════════════════════════════════════════

@metric("model_calls_per_task", "Model calls per task", unit="ratio", group="Model usage",
        higher_is_better=False, description="LLM API calls ÷ tasks attempted")
def _calls_per_task(rows, ctx):
    n = attempted(rows)
    return sum(int(r.get("model_calls") or 0) for r in rows) / n if n else None


@metric("tokens_per_task", "Tokens per task", unit="count", group="Model usage", higher_is_better=False,
        description="Prompt + completion tokens ÷ tasks attempted")
def _tokens_per_task(rows, ctx):
    n = attempted(rows)
    tok = sum(int(r.get("prompt_tokens") or 0) + int(r.get("completion_tokens") or 0) for r in rows)
    return tok / n if n else None


@metric("retries_per_task", "Retries per task", unit="ratio", group="Model usage", higher_is_better=False,
        description="Automatic retries (API errors, invalid output) ÷ tasks attempted")
def _retries_per_task(rows, ctx):
    n = attempted(rows)
    return sum(int(r.get("retries") or 0) for r in rows) / n if n else None


@metric("retry_rate", "Tasks needing a retry", unit="pct", group="Model usage", higher_is_better=False,
        description="Share of attempted tasks with at least one retry")
def _retry_rate(rows, ctx):
    return pct(sum(int(r.get("retries") or 0) > 0 for r in rows if r["status"] != "rejected"),
               attempted(rows))


# ══ Human in the loop ═════════════════════════════════════════════════════════

@metric("review_coverage", "Reviewed by a human", unit="pct", group="Human in the loop",
        description="Completed tasks that went through the human review step")
def _review_cov(rows, ctx):
    done = [r for r in rows if r["status"] in ("success", "degraded")]
    return pct(len(reviewed(done)), len(done))


@metric("intervention_rate", "Human intervention rate", unit="pct", group="Human in the loop",
        higher_is_better=False,
        description="Reviewed tasks where the reviewer rejected or edited at least one item")
def _intervention(rows, ctx):
    rv = reviewed(rows)
    return pct(sum(r["items_rejected"] > 0 or r["items_edited"] > 0 for r in rv), len(rv))


@metric("item_rejection_rate", "Items rejected in review", unit="pct", group="Human in the loop",
        higher_is_better=False, description="Rejected items ÷ items reviewed")
def _item_reject(rows, ctx):
    rv = reviewed(rows)
    return pct(sum(r["items_rejected"] for r in rv),
               sum(r["items_approved"] + r["items_rejected"] for r in rv))


@metric("review_minutes_p50", "Review time (median)", unit="min", group="Human in the loop",
        higher_is_better=False, description="Output ready → approved, capped at 4 h")
def _review_min(rows, ctx):
    v = _num(r["review_seconds"] for r in reviewed(rows) if r["review_seconds"])
    return round(statistics.median(v) / 60, 1) if v else None


# ══ Business impact (assumption-based until measured with the customer) ═══════

def _assisted_minutes(rows: Rows) -> Optional[float]:
    p50 = percentile(_num(r["duration_ms"] for r in timed(rows)), 50) or 0.0
    rv = _num(r["review_seconds"] for r in reviewed(rows) if r["review_seconds"])
    return p50 / 60000 + (statistics.median(rv) / 60 if rv else 0.0)


@metric("baseline_minutes", "Manual baseline per task", unit="min", group="Business impact",
        assumption=True, per_workflow_only=True,
        description="Minutes a person needs for the same task without the system (config)")
def _baseline(rows, ctx):
    return ctx.baseline_minutes


@metric("minutes_saved_per_task", "Time saved per task", unit="min", group="Business impact",
        assumption=True, per_workflow_only=True, higher_is_better=True,
        description="Baseline − (processing P50 + median review time)")
def _saved(rows, ctx):
    if ctx.baseline_minutes is None or not rows:
        return None
    return max(0.0, ctx.baseline_minutes - _assisted_minutes(rows))


@metric("hours_saved_total", "Hours saved", unit="h", group="Business impact",
        assumption=True, per_workflow_only=True, higher_is_better=True,
        description="Time saved per task × completed tasks")
def _hours(rows, ctx):
    if ctx.baseline_minutes is None or not rows:
        return None
    done = status(rows, "success", "degraded")
    return max(0.0, ctx.baseline_minutes - _assisted_minutes(rows)) * done / 60


# ══ Safety / governance ═══════════════════════════════════════════════════════

@metric("permission_denials", "Permission denials", unit="count", group="Governance",
        higher_is_better=False,
        description="Agent actions blocked by the permission matrix")
def _denials(rows, ctx):
    return sum(int(r.get("permission_denials") or 0) for r in rows)


@metric("approvals_requested", "Human approvals requested", unit="count", group="Governance",
        description="Actions the permission matrix routed to a human")
def _approvals(rows, ctx):
    return sum(int(r.get("approvals_requested") or 0) for r in rows)
