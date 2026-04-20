"""
Role Mapping Agent — tight output schema to minimise LLM tokens.
max_tokens=220 keeps response under 3 s on DeepSeek.
"""
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.prompts import ChatPromptTemplate
from utils.json_parser import parse_llm_json

SYSTEM_PROMPT = "You are a technical recruiter. Return ONLY compact JSON, no prose."

USER_PROMPT = """Compare candidate vs role. Return ONLY this JSON (no extras):
{{
  "role": "{role_title}",
  "match_percentage": <0-100 int>,
  "matched_skills": [<skills candidate has>],
  "missing_skills": [<required skills candidate lacks>],
  "experience_gap": <int years, negative=needs more>,
  "recommendation": "<max 12 words>"
}}

Candidate skills: {candidate_skills}
Candidate experience: {experience_years} yrs
Role requirements:
{role_context}"""


def map_role(
    parsed_cv: dict,
    target_role: str,
    vector_store: FAISS,
    llm: ChatOpenAI,
) -> dict:
    docs = vector_store.similarity_search(target_role, k=1)
    role_context = docs[0].page_content if docs else ""
    role_metadata = docs[0].metadata if docs else {}

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    bounded_llm = llm.bind(max_tokens=220)
    chain = prompt | bounded_llm
    result = chain.invoke({
        "candidate_skills": ", ".join(parsed_cv.get("skills", [])),
        "experience_years": parsed_cv.get("experience_years", 0),
        "role_title": target_role,
        "role_context": role_context,
    })

    mapping = parse_llm_json(result.content)
    mapping["role_metadata"] = role_metadata
    return mapping
