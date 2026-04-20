"""
Role Mapping Agent — compares user skills against RAG-retrieved role requirements
and returns a match percentage plus list of missing skills.
"""
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.prompts import ChatPromptTemplate
import json

SYSTEM_PROMPT = """You are a technical recruiter who evaluates candidate fit.
Return ONLY valid JSON. No markdown, no explanation."""

USER_PROMPT = """Evaluate how well a candidate matches a specific role.

Candidate Skills: {candidate_skills}
Candidate Experience: {experience_years} years

Target Role: {role_title}
Role Requirements (from knowledge base):
{role_context}

Calculate:
1. match_percentage: percentage of required skills the candidate has (0-100 integer)
2. matched_skills: list of required skills the candidate already has
3. missing_skills: list of required skills the candidate lacks
4. experience_gap: difference in years (positive = candidate has more, negative = needs more)
5. recommendation: one sentence assessment

Return ONLY this JSON:
{{
  "role": "{role_title}",
  "match_percentage": 0,
  "matched_skills": [],
  "missing_skills": [],
  "experience_gap": 0,
  "recommendation": ""
}}"""


def map_role(
    parsed_cv: dict,
    target_role: str,
    vector_store: FAISS,
    llm: ChatOpenAI,
) -> dict:
    # Retrieve role requirements from FAISS
    docs = vector_store.similarity_search(target_role, k=1)
    role_context = docs[0].page_content if docs else "No specific requirements found."
    role_metadata = docs[0].metadata if docs else {}

    candidate_skills = ", ".join(parsed_cv.get("skills", []))
    experience_years = parsed_cv.get("experience_years", 0)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    chain = prompt | llm
    result = chain.invoke({
        "candidate_skills": candidate_skills,
        "experience_years": experience_years,
        "role_title": target_role,
        "role_context": role_context,
    })

    content = result.content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    mapping = json.loads(content)
    mapping["role_metadata"] = role_metadata
    return mapping
