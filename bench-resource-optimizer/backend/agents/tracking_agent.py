"""
Tracking Agent — pure Python, no LLM call.
Readiness = completed / total × 100.  Returns instant response.
"""
from typing import List


def calculate_readiness(
    role: str,
    plan: dict,
    completed_task_ids: List[str],
    llm=None,          # kept for signature compatibility, unused
) -> dict:
    all_tasks = [
        t
        for day in plan.get("plan", [])
        for t in day.get("tasks", [])
    ]

    total     = len(all_tasks)
    completed = sum(1 for t in all_tasks if t["id"] in completed_task_ids)
    score     = round((completed / total * 100) if total else 0)

    covered = list({t["skill"].split(",")[0].strip()
                    for t in all_tasks if t["id"] in completed_task_ids})
    pending = list({t["skill"].split(",")[0].strip()
                    for t in all_tasks if t["id"] not in completed_task_ids})
    next_task = next(
        (t["title"] for t in all_tasks if t["id"] not in completed_task_ids),
        "All tasks completed!"
    )

    if score == 0:    status = "Not Started"
    elif score < 50:  status = "In Progress"
    elif score < 85:  status = "Almost Ready"
    else:             status = "Ready"

    messages = {
        "Not Started":  "Start with the first task to begin your journey.",
        "In Progress":  f"Good progress! {total - completed} tasks remaining.",
        "Almost Ready": f"Almost there — just {total - completed} more tasks!",
        "Ready":        "🎉 You are fully prepared for the project!",
    }

    return {
        "readiness_score":     score,
        "status":              status,
        "message":             messages[status],
        "completed_count":     completed,
        "total_count":         total,
        "covered_skills":      covered,
        "pending_skills":      pending,
        "next_suggested_task": next_task,
    }
