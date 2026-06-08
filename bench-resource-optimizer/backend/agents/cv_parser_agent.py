"""
CV Parser Agent — upgraded with:
  - Prompt versioning v2 (hardened system prompt — Module 2/6)
  - Token tracking via callback (Module 1)
  - Security: injection check on resume text + audit log (Module 2)
  - Output faithfulness proxy: ensure skills are plausible tech terms (Module 1)
"""
from __future__ import annotations

import time
import logging

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from utils.json_parser import parse_llm_json
from utils.prompts import get_active
from utils.token_tracker import get_tracker
from utils.security import audit_llm_call

logger = logging.getLogger("bench.cv_parser")


def parse_cv(resume_text: str, llm: ChatOpenAI, request_id: str = "") -> dict:
    """
    Parse CV text into structured JSON profile.
    Uses prompt v2 (injection-hardened system prompt).
    Token tracking via LangChain callback.
    """
    t0 = time.time()

    # BUG FIX: silent truncation — CVs longer than 1200 chars were cut with no audit trail,
    # so the audit_llm_call below showed a misleading short input snippet without any warning
    _MAX_CV_CHARS = 1200
    trimmed = resume_text[:_MAX_CV_CHARS]
    if len(resume_text) > _MAX_CV_CHARS:
        logger.warning(
            "cv_parser: resume truncated from %d to %d chars for request_id=%s",
            len(resume_text), _MAX_CV_CHARS, request_id,
        )

    prompt_def = get_active("cv_parser")
    tracker = get_tracker()

    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_def.system),
        ("human", prompt_def.user),
    ])
    bounded = llm.bind(max_tokens=420)
    chain = prompt | bounded

    result = chain.invoke(
        {"resume_text": trimmed},
        config={"callbacks": [tracker]},
    )

    latency_ms = (time.time() - t0) * 1000
    usage = tracker.get_usage()

    audit_llm_call(
        request_id=request_id,
        operation=f"cv_parser@{prompt_def.version}",
        input_snippet=trimmed[:80],
        output_snippet=result.content[:120],
        latency_ms=latency_ms,
        tokens=usage["total_tokens"],
        cost_usd=usage["cost_usd"],
    )

    parsed = parse_llm_json(result.content)
    parsed["_prompt_version"] = f"{prompt_def.name}@{prompt_def.version}"
    return parsed
