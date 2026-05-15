"""Shared robust JSON extractor for all agents."""
import json
import re

_decoder = json.JSONDecoder()


def parse_llm_json(text: str):
    """
    Parse the first valid JSON value from LLM output.
    Handles: markdown fences, leading prose, trailing content.
    Delegates to G3 repair_json for tracking + cascade logic.
    """
    # Use G3 repair cascade so every call is tracked in guardrail stats
    try:
        from guardrails.production import repair_json
        parsed, level = repair_json(text, fallback=None)
        if parsed is not None:
            return parsed
        # If repair_json failed, fall through to original logic for error
    except ImportError:
        pass

    # Fallback: original logic (import cycle protection)
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
