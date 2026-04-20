"""
Planning Agent — generates a day-by-day 7-day preparation roadmap
for a candidate given their target role and missing skills.
"""
import json
from typing import List
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

SYSTEM_PROMPT = """You are an expert technical trainer who creates precise learning plans.
Return ONLY valid JSON. No markdown, no explanation."""

USER_PROMPT = """Create a 7-day preparation plan for the following:

Target Role: {role}
Missing Skills to Learn: {missing_skills}
Candidate's Current Skills: {current_skills}

Rules:
- Prioritize the most critical missing skills first
- Each day must have 2-4 concrete tasks
- Each task must have an estimated time in hours
- Keep tasks practical and actionable
- Include one mini-project or hands-on exercise per day

Return ONLY this JSON structure:
{{
  "role": "{role}",
  "total_days": 7,
  "focus_skills": [],
  "plan": [
    {{
      "day": 1,
      "theme": "theme for the day",
      "tasks": [
        {{
          "id": "day1_task1",
          "title": "task title",
          "description": "what to do",
          "hours": 2,
          "skill": "skill being practiced",
          "resource": "URL or book reference"
        }}
      ]
    }}
  ]
}}

Generate all 7 days."""

def generate_plan(
    role: str,
    missing_skills: List[str],
    current_skills: List[str],
    llm: ChatOpenAI,
) -> dict:
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    chain = prompt | llm
    result = chain.invoke({
        "role": role,
        "missing_skills": ", ".join(missing_skills) if missing_skills else "None",
        "current_skills": ", ".join(current_skills) if current_skills else "None",
    })

    content = result.content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    return json.loads(content)
