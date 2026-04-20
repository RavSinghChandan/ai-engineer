"""Shared robust JSON extractor for all agents."""
import json
import re

_decoder = json.JSONDecoder()


def parse_llm_json(text: str):
    """
    Parse the first valid JSON value from LLM output.
    Handles: markdown fences, leading prose, trailing content.
    """
    text = text.strip()
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text.strip()).strip()
    for ch in ("{", "["):
        idx = text.find(ch)
        if idx >= 0:
            text = text[idx:]
            break
    obj, _ = _decoder.raw_decode(text)
    return obj
