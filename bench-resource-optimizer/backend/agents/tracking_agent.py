"""
Tracking Agent — calculates readiness score from completed vs total tasks
and generates a progress summary using LLM.
"""
import json
from typing import List
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

SYSTEM_PROMPT = """You are a progress coach who gives concise, motivating feedback.
Return ONLY valid JSON."""

USER_PROMPT = """Analyze a candidate's preparation progress.

Role: {role}
Completed Tasks: {completed_tasks}
Total Tasks: {total_tasks}
Readiness Score: {readiness_score}%

Skills covered by completed tasks: {covered_skills}
Skills not yet covered: {pending_skills}

Return ONLY this JSON:
{{
  "readiness_score": {readiness_score},
  "status": "Not Started | In Progress | Almost Ready | Ready",
  "message": "one sentence motivational message",
  "completed_count": {completed_tasks},
  "total_count": {total_tasks},
  "covered_skills": [],
  "pending_skills": [],
  "next_suggested_task": "title of the next most important task to complete"
}}"""


def calculate_readiness(
    role: str,
    plan: dict,
    completed_task_ids: List[str],
    llm: ChatOpenAI,
) -> dict:
    all_tasks = []
    for day in plan.get("plan", []):
        all_tasks.extend(day.get("tasks", []))

    total = len(all_tasks)
    completed = len([t for t in all_tasks if t["id"] in completed_task_ids])
    readiness_score = round((completed / total * 100) if total > 0 else 0)

    covered_skills = list({
        t["skill"] for t in all_tasks if t["id"] in completed_task_ids
    })
    pending_skills = list({
        t["skill"] for t in all_tasks if t["id"] not in completed_task_ids
    })

    next_task = next(
        (t["title"] for t in all_tasks if t["id"] not in completed_task_ids),
        "All tasks completed!"
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    chain = prompt | llm
    result = chain.invoke({
        "role": role,
        "completed_tasks": completed,
        "total_tasks": total,
        "readiness_score": readiness_score,
        "covered_skills": ", ".join(covered_skills) or "None",
        "pending_skills": ", ".join(pending_skills) or "None",
    })

    content = result.content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    tracking = json.loads(content)
    tracking["next_suggested_task"] = next_task
    tracking["covered_skills"] = covered_skills
    tracking["pending_skills"] = pending_skills
    return tracking
