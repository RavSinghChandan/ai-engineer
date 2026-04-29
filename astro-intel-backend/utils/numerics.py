"""
Pure computation helpers shared across numerology agents.
"""
from __future__ import annotations
from typing import Dict, List, Set

VOWELS: Set[str] = set("AEIOU")


def reduce_number(n: int) -> int:
    """Reduce to single digit, preserve master numbers 11, 22, 33."""
    while n > 9 and n not in (11, 22, 33):
        n = sum(int(d) for d in str(n))
    return n


def dob_digits(dob: str) -> List[int]:
    """Extract digits from YYYY-MM-DD."""
    return [int(c) for c in dob.replace("-", "") if c.isdigit()]


def life_path(dob: str) -> int:
    return reduce_number(sum(dob_digits(dob)))


def destiny_number(dob: str) -> int:
    """Same as life path in most traditions."""
    return life_path(dob)


def letter_map_indian() -> Dict[str, int]:
    return {
        "A":1,"I":1,"J":1,"Q":1,"Y":1,
        "B":2,"K":2,"R":2,
        "C":3,"G":3,"L":3,"S":3,
        "D":4,"M":4,"T":4,
        "E":5,"H":5,"N":5,"X":5,
        "U":6,"V":6,"W":6,
        "O":7,"Z":7,
        "F":8,"P":8,
    }


def letter_map_chaldean() -> Dict[str, int]:
    return {
        "A":1,"I":1,"J":1,"Q":1,"Y":1,
        "B":2,"K":2,"R":2,
        "C":3,"G":3,"L":3,"S":3,
        "D":4,"M":4,"T":4,
        "E":5,"H":5,"N":5,"X":5,
        "U":6,"V":6,"W":6,
        "O":7,"Z":7,
        "F":8,"P":8,
    }


def letter_map_pythagorean() -> Dict[str, int]:
    """A=1..Z=26 reduced mod 9."""
    return {chr(65 + i): ((i % 9) + 1) for i in range(26)}


def name_number(name: str, lmap: Dict[str, int]) -> int:
    letters = [c for c in name.upper() if c.isalpha()]
    return reduce_number(sum(lmap.get(c, 0) for c in letters))


def soul_urge(name: str, lmap: Dict[str, int]) -> int:
    letters = [c for c in name.upper() if c in VOWELS]
    return reduce_number(sum(lmap.get(c, 0) for c in letters)) or 1


def personality_number(name: str, lmap: Dict[str, int]) -> int:
    letters = [c for c in name.upper() if c.isalpha() and c not in VOWELS]
    return reduce_number(sum(lmap.get(c, 0) for c in letters)) or 1


NUMBER_TRAITS: Dict[int, Dict[str, list]] = {
    1:  {"traits": ["Natural leader","Independent","Ambitious","Decisive"],
         "strengths": ["Courage","Initiative","Self-reliance"],
         "weaknesses": ["Tendency toward stubbornness","May act impulsively"]},
    2:  {"traits": ["Diplomatic","Sensitive","Cooperative","Supportive"],
         "strengths": ["Empathy","Partnership skills","Patience"],
         "weaknesses": ["May be overly dependent","Tendency to avoid conflict"]},
    3:  {"traits": ["Creative","Expressive","Sociable","Optimistic"],
         "strengths": ["Communication","Artistic talent","Enthusiasm"],
         "weaknesses": ["Tendency to scatter energy","May lack focus"]},
    4:  {"traits": ["Practical","Disciplined","Reliable","Methodical"],
         "strengths": ["Hard work","Stability","Attention to detail"],
         "weaknesses": ["May resist change","Tendency toward rigidity"]},
    5:  {"traits": ["Adventurous","Freedom-loving","Versatile","Quick-thinking"],
         "strengths": ["Adaptability","Curiosity","Resourcefulness"],
         "weaknesses": ["Tendency toward restlessness","May avoid commitment"]},
    6:  {"traits": ["Nurturing","Responsible","Harmonious","Caring"],
         "strengths": ["Love of family","Sense of duty","Healing presence"],
         "weaknesses": ["May be overprotective","Tendency to self-sacrifice"]},
    7:  {"traits": ["Analytical","Introspective","Spiritual","Wise"],
         "strengths": ["Deep thinking","Research ability","Intuition"],
         "weaknesses": ["May be overly private","Tendency toward isolation"]},
    8:  {"traits": ["Authoritative","Business-minded","Resilient","Ambitious"],
         "strengths": ["Executive ability","Financial acumen","Perseverance"],
         "weaknesses": ["Tendency toward materialism","May overwork"]},
    9:  {"traits": ["Humanitarian","Compassionate","Generous","Idealistic"],
         "strengths": ["Wisdom","Universal love","Artistic depth"],
         "weaknesses": ["May be scattered","Tendency to give too much"]},
    11: {"traits": ["Intuitive","Inspirational","Visionary","Highly sensitive"],
         "strengths": ["Spiritual insight","Inspiration of others","Psychic ability"],
         "weaknesses": ["Nervous energy","Tendency toward idealism over practicality"]},
    22: {"traits": ["Master builder","Practical visionary","Organized","Powerful"],
         "strengths": ["Large-scale thinking","Ability to manifest dreams"],
         "weaknesses": ["Enormous pressure","Tendency toward overwhelm"]},
    33: {"traits": ["Master teacher","Compassionate leader","Selfless","Enlightened"],
         "strengths": ["Healing","Teaching","Universal service"],
         "weaknesses": ["Extreme self-sacrifice","Tendency toward martyrdom"]},
}


def get_traits(n: int) -> Dict[str, list]:
    return NUMBER_TRAITS.get(n, NUMBER_TRAITS.get(n % 9 or 9, NUMBER_TRAITS[9]))


def lucky_numbers(lp: int, nm: int) -> List[int]:
    third = reduce_number(lp + nm)
    return sorted({lp, nm, third})


def lucky_colors_for_number(n: int) -> List[str]:
    color_map = {
        1: ["Gold","Orange","Yellow"], 2: ["White","Silver","Cream"],
        3: ["Yellow","Pink","Light Blue"], 4: ["Blue","Green","Brown"],
        5: ["Grey","Turquoise","White"], 6: ["Rose","Sky Blue","Ivory"],
        7: ["Purple","Violet","Grey"], 8: ["Black","Dark Blue","Indigo"],
        9: ["Red","Crimson","Pink"], 11: ["Silver","White","Pale Blue"],
        22: ["Earthy Brown","Gold","Dark Green"], 33: ["Rose Gold","White","Lavender"],
    }
    return color_map.get(n, color_map.get(n % 9 or 9, ["White","Gold"]))
