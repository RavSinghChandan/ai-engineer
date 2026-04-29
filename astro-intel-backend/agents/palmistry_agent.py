"""
STEP 2c — Palmistry Super Agent
Runs Indian, Chinese, Western sub-agents.
Each aligns output with focus context.
"""
from __future__ import annotations
from typing import Any, Dict


def _indian(hand_shape: str, focus: str) -> Dict[str, Any]:
    focus_career = focus in ("career","finance","education")
    focus_relation = focus in ("marriage","children")
    return {
        "tradition": "Indian",
        "focus_addressed": focus,
        "lines": {
            "life_line":   "Strong, curved life line — this suggests good vitality and a tendency toward an active, long life.",
            "head_line":   "Clear and long head line — indicates analytical thinking and sound professional decision-making.",
            "heart_line":  "Upward-curving heart line — suggests warm emotional expressiveness and meaningful relationships.",
            "fate_line":   "Fate line rising from base — this suggests a self-made path built through personal determination.",
            "sun_line":    "Sun line present — suggests recognition, creativity, and public acknowledgment.",
        },
        "mounts": {
            "Jupiter": "Well-developed — leadership and ambition are present.",
            "Saturn":  "Balanced — disciplined sense of responsibility.",
            "Sun":     "Prominent — creative talent and desire for recognition.",
            "Mercury": "Well-formed — strong communication and business aptitude.",
            "Venus":   "Soft and developed — warmth, love for family and beauty.",
            "Moon":    "Developed — imagination and intuition are indicated.",
            "Mars":    "Moderate — courage balanced with caution.",
        },
        "hand_shape": hand_shape or "Square palm — practicality and reliability.",
        "traits":     ["Determined","Creative","Emotionally expressive","Practical"],
        "health_notes":       ["Good constitution is indicated.","There is a tendency to accumulate stress — mindfulness is recommended."],
        "career_notes":       ["Jupiter mount suggests leadership roles suit well.","Mercury mount indicates aptitude for communication-heavy fields."] if focus_career else ["Steady professional growth is indicated."],
        "relationship_notes": ["Deep emotional bonds are suggested by the heart line.","Loyalty and commitment are indicated."] if focus_relation else ["Balanced social life is indicated."],
        "focus_insight": _indian_focus_insight(focus),
    }


def _chinese(hand_shape: str, focus: str) -> Dict[str, Any]:
    hand_type = "Wood hand" if not hand_shape else hand_shape
    focus_career = focus in ("career","finance","education")
    return {
        "tradition": "Chinese",
        "focus_addressed": focus,
        "lines": {
            "life_line":   "Strong arc indicates abundant life force (Qi) — health and fortune are favored.",
            "head_line":   "Straight, clear head line — practical intelligence and clear decision-making.",
            "heart_line":  "Rising toward index finger — noble emotions and idealistic partnerships.",
            "fate_line":   "Present and structured — suggests a goal-oriented career trajectory.",
            "wisdom_line": "Present — depth of thought and ability to learn from experience.",
        },
        "mounts": {
            "First Finger (Jupiter)":  "Full — ambition and self-confidence.",
            "Second Finger (Saturn)":  "Balanced — wisdom and responsibility.",
            "Third Finger (Sun)":      "Raised — artistic and social talent.",
            "Fourth Finger (Mercury)": "Good — communication and trade intelligence.",
            "Lower Mars":              "Developed — active courage.",
            "Upper Mars":              "Present — persistence under pressure.",
            "Plain of Mars":           "Clear — balanced temperament.",
        },
        "hand_type": hand_type,
        "traits":    ["Intuitive","Goal-oriented","Creative","Socially adept"],
        "health_notes":       ["Good Qi flow — regular exercise maintains balance.","Emotional health awareness is advised."],
        "career_notes":       ["Wood hand type thrives in creative and educational fields.","Leadership in communication domains is favored."] if focus_career else ["Career stability is indicated."],
        "relationship_notes": ["Noble heart line suggests sincere, idealistic partnerships."],
        "focus_insight": _chinese_focus_insight(focus),
    }


def _western(hand_shape: str, focus: str) -> Dict[str, Any]:
    focus_health = focus == "health"
    return {
        "tradition": "Western",
        "focus_addressed": focus,
        "lines": {
            "life_line":   "Wide arc indicates enthusiasm and a strong zest for living.",
            "head_line":   "Sloping toward Luna — creative and imaginative thinking, common in writers and artists.",
            "heart_line":  "Long heart line — emotional depth and capacity for long-term committed relationships.",
            "fate_line":   "Strong from wrist to middle finger — strong sense of purpose and career direction.",
            "apollo_line": "Present — warmth, creativity, and appreciation for beauty.",
        },
        "mounts": {
            "Jupiter":       "Firm — self-confidence and natural leadership.",
            "Saturn":        "Normal — structured and responsible approach.",
            "Apollo":        "Good — warmth and creative appreciation.",
            "Mercury":       "Present — quick thinking and communication flair.",
            "Venus":         "Soft — affectionate and family-oriented.",
            "Luna":          "Developed — strong intuition and nature-connection.",
            "Mars Positive": "Balanced — assertive without aggression.",
            "Mars Negative": "Moderate — resilience under challenge.",
        },
        "hand_shape": hand_shape or "Earth hand — square palm, short fingers — practical and grounded.",
        "traits":     ["Grounded","Resilient","Creative thinker","Emotionally deep"],
        "health_notes": ["Earth hand types tend toward physical robustness.",
                         "Cardiovascular health and stress levels merit attention."] if focus_health else ["Good general health indicators."],
        "career_notes": ["Practical and reliable — suited for management and execution roles.",
                         "Creative head line opens doors to artistic careers."],
        "relationship_notes": ["Long heart line desires committed, stable relationships.",
                               "Venus mount indicates warmth and affection."],
        "focus_insight": _western_focus_insight(focus),
    }


def _indian_focus_insight(focus: str) -> str:
    m = {
        "career":  "The fate line and Jupiter mount together suggest strong professional ambition and steady career advancement.",
        "finance": "Mercury mount and a clear fate line indicate financial intelligence and business aptitude.",
        "marriage":"The heart line and Venus mount suggest deep, loyal bonds and a nurturing partnership.",
        "health":  "The life line's strength indicates good vitality — attention to mental stress is advisable.",
        "general": "Overall palm indicators suggest a balanced, growth-oriented life path.",
    }
    return m.get(focus, m["general"])


def _chinese_focus_insight(focus: str) -> str:
    m = {
        "career":  "The fate line rising strongly from the base suggests career built by personal effort and determination.",
        "finance": "Mercury mount (trade) and Qi in life line suggest financial growth through communication and commerce.",
        "marriage":"Noble heart line suggests sincere, spiritually-aligned partnerships are possible.",
        "health":  "Strong Qi in life line is a positive indicator — emotional balance is key to maintaining health.",
        "general": "Overall palm Qi flow suggests good fortune with deliberate action.",
    }
    return m.get(focus, m["general"])


def _western_focus_insight(focus: str) -> str:
    m = {
        "career":  "The fate line and Apollo mount together indicate clear purpose and creative career success.",
        "finance": "A strong fate line with Mercury mount suggests financial growth through intellectual or communicative work.",
        "marriage":"Long heart line and Venus mount confirm a deep desire for committed, lasting partnership.",
        "health":  "The earth hand type generally has strong physical constitution — stress management is the key variable.",
        "general": "The hand profile suggests a grounded, capable individual with room for continued growth.",
    }
    return m.get(focus, m["general"])


def palmistry_agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
    if "palmistry" not in state.get("selected_modules", []):
        return state

    mi = state.get("module_inputs", {})
    palm_input = mi.get("palmistry", {}) if isinstance(mi, dict) else {}
    hand_shape = palm_input.get("hand_shape", "") if isinstance(palm_input, dict) else ""
    focus = state.get("focus_context", {}).get("intent", "general")

    results = {
        "indian":  _indian(hand_shape, focus),
        "chinese": _chinese(hand_shape, focus),
        "western": _western(hand_shape, focus),
    }

    state.setdefault("memory", {})["palmistry"] = results
    state.setdefault("agent_log", []).append("[PalmistryAgent] All 3 traditions analyzed and stored.")
    return state
