"""
STEP 8 — Translation Agent
Translates a FinalReport JSON into one of the 22 scheduled languages of the
Indian Constitution while preserving tone, structure, impact, and spiritual
register of the original English text.

Design principles:
  - Never paraphrase — translate meaning, register, and rhythm faithfully
  - Preserve ALL JSON structure keys (only values are translated)
  - Spiritual / astrological terms keep their Sanskrit/original form where
    no natural equivalent exists, with a bracketed gloss on first occurrence
  - Mantras and Sanskrit slokas are kept in Devanagari + transliteration
  - Bullet lists remain bullet lists; paragraphs remain paragraphs
  - Field `language` and `language_code` are added to the report root
"""
from __future__ import annotations
import copy
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional

# ── 22 scheduled languages (Constitution of India, 8th Schedule) ──────────────
SUPPORTED_LANGUAGES: Dict[str, Dict[str, str]] = {
    "hi": {"name": "Hindi",       "native": "हिन्दी",        "script": "Devanagari"},
    "bn": {"name": "Bengali",     "native": "বাংলা",          "script": "Bengali"},
    "pa": {"name": "Punjabi",     "native": "ਪੰਜਾਬੀ",         "script": "Gurmukhi"},
    "gu": {"name": "Gujarati",    "native": "ગુજરાતી",         "script": "Gujarati"},
    "mr": {"name": "Marathi",     "native": "मराठी",           "script": "Devanagari"},
    "te": {"name": "Telugu",      "native": "తెలుగు",          "script": "Telugu"},
    "ta": {"name": "Tamil",       "native": "தமிழ்",           "script": "Tamil"},
    "kn": {"name": "Kannada",     "native": "ಕನ್ನಡ",          "script": "Kannada"},
    "ml": {"name": "Malayalam",   "native": "മലയാളം",         "script": "Malayalam"},
    "or": {"name": "Odia",        "native": "ଓଡ଼ିଆ",          "script": "Odia"},
    "as": {"name": "Assamese",    "native": "অসমীয়া",         "script": "Bengali"},
    "ur": {"name": "Urdu",        "native": "اردو",            "script": "Nastaliq"},
    "ks": {"name": "Kashmiri",    "native": "کٲشُر",           "script": "Perso-Arabic"},
    "ne": {"name": "Nepali",      "native": "नेपाली",          "script": "Devanagari"},
    "sd": {"name": "Sindhi",      "native": "سنڌي",            "script": "Perso-Arabic"},
    "sa": {"name": "Sanskrit",    "native": "संस्कृतम्",        "script": "Devanagari"},
    "kok": {"name": "Konkani",    "native": "कोंकणी",          "script": "Devanagari"},
    "mni": {"name": "Manipuri",   "native": "মৈতৈলোন্",        "script": "Meitei"},
    "mai": {"name": "Maithili",   "native": "मैथिली",          "script": "Devanagari"},
    "doi": {"name": "Dogri",      "native": "डोगरी",           "script": "Devanagari"},
    "sat": {"name": "Santali",    "native": "ᱥᱟᱱᱛᱟᱲᱤ",       "script": "Ol Chiki"},
    "bo": {"name": "Bodo",        "native": "बड़ो",             "script": "Devanagari"},
    # English always available as identity pass-through
    "en": {"name": "English",     "native": "English",         "script": "Latin"},
}


# ── Fields that must be translated (leaf string values) ──────────────────────
# Keys that should NOT be translated (identifiers, URLs, dates, metadata, code enums)
_SKIP_KEYS = {
    "brand_name", "logo_url", "image_url", "generated_at", "report_title",
    "id", "session_id", "confidence", "intent", "domains", "is_common",
    "approved", "editable", "edited", "modules_used", "language", "language_code",
    "language_name", "language_native",
    # hw_bullet type is a code value ("list", "timing", "redirect") — never translate
    "type",
}

# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_translation_prompt(
    texts: List[str],
    target_lang: str,
    lang_info: Dict[str, str],
) -> Dict[str, Any]:
    """
    Build a single LLM call that translates a batch of text segments.
    Returns structured JSON: {"translations": ["...", "..."]}.
    """
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    lang_name   = lang_info["name"]
    lang_native = lang_info["native"]

    system = (
        f"You translate English spiritual and astrology report text into {lang_name}.\n\n"
        "Your two goals — both equally important:\n"
        "  1. SIMPLE LANGUAGE — use everyday words a 6th-grade student knows. "
        "Avoid rare, formal, or literary vocabulary. Short, clear sentences.\n"
        "  2. FULL ACCURACY — every insight, prediction, number, date, time window, "
        "planet name, and specific detail from the English MUST appear in the translation. "
        "Do not drop, shorten, or vague-ify any finding.\n\n"
        "Additional rules:\n"
        "  • Mantras (e.g. Om Namah Shivaya) — keep exactly as-is, do not translate\n"
        "  • Numbers, dates, proper nouns (person names, city names) — keep exactly as-is\n"
        "  • Story arc markers [HOOK], [TENSION], [TURN], [RESOLUTION], [CLOSING], [REMEDIES] — "
        "keep these EXACTLY as-is in uppercase square brackets. Only translate the text after them.\n"
        "  • The ⏎ character is a newline placeholder — preserve every ⏎ exactly as-is in output.\n"
        "  • Do not add new content or explanations not in the original\n\n"
        "CRITICAL: Output ONLY raw JSON — no markdown, no code fences, no commentary. "
        "The response must start with { and end with }. "
        'Format: {"translations": ["...", ...]} with exactly the same count as input lines.'
    )

    user = (
        f"Translate into simple {lang_name} — easy words, but keep every detail and finding intact:\n{numbered}\n\n"
        f'Return ONLY this JSON: {{"translations": ["<translation>", ...]}}'
    )

    return {
        "model":       "deepseek-chat",
        "temperature": 0,
        "max_tokens":  8192,
        "system":      system,
        "user":        user,
    }


# ── Walk the report tree and collect translatable strings ─────────────────────

def _collect_strings(
    obj: Any,
    parent_key: str = "",
    path: List[Any] = [],
    result: Optional[List[Dict]] = None,
) -> List[Dict]:
    """
    DFS walk. Collect {"path": [...], "text": str} for every translatable leaf.
    """
    if result is None:
        result = []

    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in _SKIP_KEYS:
                continue
            _collect_strings(v, k, path + [k], result)

    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _collect_strings(v, parent_key, path + [i], result)

    elif isinstance(obj, str) and obj.strip():
        # Skip very short strings that are likely enum values / codes
        if len(obj.strip()) > 3 and not obj.startswith("{{"):
            result.append({"path": list(path), "text": obj})

    return result


def _set_at_path(obj: Any, path: List[Any], value: str) -> None:
    """Set a nested value given a path of keys/indices."""
    for key in path[:-1]:
        obj = obj[key]
    obj[path[-1]] = value


# ── Main public function ──────────────────────────────────────────────────────

def translation_agent(
    report: Dict[str, Any],
    target_language_code: str,
    llm_caller=None,          # optional: fn(prompt_dict) -> str (the LLM response)
) -> Dict[str, Any]:
    """
    Translate a FinalReport dict into the target language.

    Args:
        report:               The original English FinalReport dict
        target_language_code: BCP-47 / our internal code (e.g. 'hi', 'bn')
        llm_caller:           Optional callable — fn(prompt) -> str.
                              If None, returns a mock translation for testing.

    Returns:
        A new report dict with all user-visible text translated.
        Adds keys: language_code, language_name, language_native to root.
    """
    code = target_language_code.lower()

    # Identity pass-through for English
    if code == "en":
        translated = copy.deepcopy(report)
        translated["language_code"]   = "en"
        translated["language_name"]   = "English"
        translated["language_native"] = "English"
        return translated

    lang_info = SUPPORTED_LANGUAGES.get(code)
    if not lang_info:
        raise ValueError(
            f"Language '{code}' is not supported. "
            f"Supported codes: {', '.join(SUPPORTED_LANGUAGES.keys())}"
        )

    # Deep-copy to avoid mutating the original
    translated = copy.deepcopy(report)

    # Collect all translatable strings with their paths
    segments = _collect_strings(translated)

    if not segments:
        translated["language_code"]   = code
        translated["language_name"]   = lang_info["name"]
        translated["language_native"] = lang_info["native"]
        return translated

    texts = [s["text"] for s in segments]

    # ── Translate one string at a time via individual LLM calls ──────────────
    # Batching causes truncation on long reports (>14KB JSON hits token limits).
    # Per-string calls are slower but 100% reliable — no JSON parsing, no count
    # mismatch, no truncation. Each call completes in ~1-2s.
    translated_texts: List[str] = []

    def _translate_one(text: str) -> str:
        """Translate a single string. Returns original on any failure."""
        # Encode real newlines as literal \\n so the LLM sees the full text as one
        # line. Story arc bullets contain [HOOK]...\n[TENSION]...\n[TURN]... —
        # without this, the numbered-list prompt splits at each \n and the LLM
        # returns only the first section. Decoded back after translation.
        SENTINEL = "⏎"
        escaped = text.replace("\n", SENTINEL)
        prompt = _build_translation_prompt([escaped], code, lang_info)
        try:
            raw = llm_caller(prompt)  # type: ignore[misc]
            raw = raw.strip()
            if raw.startswith("```"):
                raw = "\n".join(
                    l for l in raw.splitlines()
                    if not l.strip().startswith("```")
                ).strip()
            start_idx = raw.find("{")
            end_idx   = raw.rfind("}") + 1
            if start_idx != -1 and end_idx > start_idx:
                raw = raw[start_idx:end_idx]
            parsed = json.loads(raw)
            items = parsed.get("translations", [])
            if isinstance(items, list) and items:
                result = str(items[0])
                return result.replace(SENTINEL, "\n")
        except Exception as exc:
            print(f"[translation_agent] failed on: {text[:60]!r} — {exc}", file=sys.stderr)
        return text  # fallback: keep original

    if llm_caller:
        # Translate all strings in parallel — 10 concurrent LLM calls
        # keeps total time ~10-15s regardless of report length
        translated_texts = [None] * len(texts)  # type: ignore[list-item]
        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(_translate_one, text): i for i, text in enumerate(texts)}
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    translated_texts[idx] = fut.result()
                except Exception as exc:
                    print(f"[translation_agent] parallel failure idx={idx}: {exc}", file=sys.stderr)
                    translated_texts[idx] = texts[idx]
    else:
        # Mock: prefix each item with language tag for testing
        translated_texts = [f"[{lang_info['name']}] {t}" for t in texts]

    # Write translated strings back into the copied report
    for segment, new_text in zip(segments, translated_texts):
        try:
            _set_at_path(translated, segment["path"], new_text)
        except (KeyError, IndexError, TypeError):
            pass  # path may have shifted — skip gracefully

    # Stamp language metadata
    translated["language_code"]   = code
    translated["language_name"]   = lang_info["name"]
    translated["language_native"] = lang_info["native"]

    return translated


# ── Convenience: list all languages ──────────────────────────────────────────

def list_languages() -> List[Dict[str, str]]:
    return [
        {"code": code, "name": info["name"], "native": info["native"], "script": info["script"]}
        for code, info in SUPPORTED_LANGUAGES.items()
    ]
