"""
CV Parser Agent — converts raw resume text into structured JSON using LLM.

Prompt strategy: few-shot extraction so the model outputs consistent JSON
regardless of resume format or writing style.
"""
import json
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

SYSTEM_PROMPT = """You are a precise CV parser. Extract information from resumes and
return ONLY valid JSON. Never add explanation or markdown fences around JSON."""

USER_PROMPT = """Parse the following resume text and extract structured information.

Resume Text:
{resume_text}

Return a JSON object with exactly these keys:
{{
  "name": "candidate full name or 'Unknown'",
  "email": "email address or ''",
  "phone": "phone number or ''",
  "skills": ["list", "of", "technical", "skills"],
  "experience_years": "total years of experience as integer (estimate if unclear)",
  "roles": ["list", "of", "job", "roles", "held"],
  "projects": [
    {{
      "name": "project name",
      "description": "one sentence description",
      "technologies": ["tech1", "tech2"]
    }}
  ],
  "education": "highest degree and field"
}}

Extract ONLY what is present. Use empty lists/strings for missing fields.
Return ONLY the JSON object, no other text."""


def parse_cv(resume_text: str, llm: ChatOpenAI) -> dict:
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    chain = prompt | llm
    result = chain.invoke({"resume_text": resume_text})
    content = result.content.strip()

    # Strip markdown fences if model added them despite instructions
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    return json.loads(content)
