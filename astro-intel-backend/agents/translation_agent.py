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
from typing import Any, Dict, List, Optional

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
# Keys that should NOT be translated (identifiers, URLs, dates, metadata)
_SKIP_KEYS = {
    "brand_name", "logo_url", "image_url", "generated_at", "report_title",
    "id", "session_id", "confidence", "intent", "domains", "is_common",
    "approved", "editable", "edited", "modules_used", "language", "language_code",
    "language_name", "language_native",
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
        "You are an expert literary translator specialising in spiritual, astrological, "
        "and metaphysical texts. You translate from English into Indian languages with "
        "absolute fidelity to:\n"
        "  • Meaning — convey the exact thought, not a paraphrase\n"
        "  • Register — preserve the warm, sage-like, intimate spiritual tone\n"
        "  • Structure — keep sentence flow, paragraph breaks, bullet markers\n"
        "  • Impact — retain the emotional weight of each sentence\n"
        "  • Sanskrit terms — keep them in their original Sanskrit form; add a "
        "    one-word native-language gloss in parentheses on first use only\n"
        "  • Mantras — render in Devanagari + Roman transliteration, never translate\n"
        "  • Numbers, dates, proper nouns — do not translate\n"
        "Output ONLY a JSON object: {\"translations\": [\"...\", ...]} "
        "with exactly the same count as input lines. No commentary."
    )

    user = (
        f"Target language: {lang_name} ({lang_native})\n\n"
        f"Translate each numbered item faithfully:\n{numbered}\n\n"
        "Return JSON: {\"translations\": [\"<item1 translated>\", ...]}"
    )

    return {
        "model":       "claude-opus-4-7",
        "temperature": 0,
        "max_tokens":  4096,
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

    # ── Batch into chunks of 40 to stay within token limits ──────────────────
    BATCH = 40
    translated_texts: List[str] = []

    for start in range(0, len(texts), BATCH):
        batch = texts[start : start + BATCH]
        prompt = _build_translation_prompt(batch, code, lang_info)

        if llm_caller:
            raw = llm_caller(prompt)
            try:
                parsed = json.loads(raw)
                batch_translated = parsed.get("translations", batch)
            except (json.JSONDecodeError, AttributeError):
                # Fallback: use original text if parsing fails
                batch_translated = batch
        else:
            # Mock: prefix each item with language tag for testing
            batch_translated = [f"[{lang_info['name']}] {t}" for t in batch]

        translated_texts.extend(batch_translated)

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
