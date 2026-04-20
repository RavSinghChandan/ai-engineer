"""
CV Parser Agent — strips input to 1200 chars and uses max_tokens=380.
Keeps output schema identical so the frontend is unaffected.
"""
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from utils.json_parser import parse_llm_json

SYSTEM_PROMPT = "You are a CV parser. Return ONLY valid JSON, no markdown."

USER_PROMPT = """Extract info from this resume. Return ONLY this JSON:
{{
  "name": "<full name or 'Unknown'>",
  "email": "<email or ''>",
  "phone": "<phone or ''>",
  "skills": [<technical skill strings>],
  "experience_years": <int>,
  "roles": [<job title strings>],
  "projects": [{{"name":"<n>","description":"<10 words>","technologies":[<list>]}}],
  "education": "<degree and field>"
}}

Resume:
{resume_text}"""


def parse_cv(resume_text: str, llm: ChatOpenAI) -> dict:
    # Trim to avoid huge prompts; first 1200 chars capture name/skills/titles
    trimmed = resume_text[:1200]

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])

    bounded_llm = llm.bind(max_tokens=380)
    chain = prompt | bounded_llm
    result = chain.invoke({"resume_text": trimmed})

    return parse_llm_json(result.content)
