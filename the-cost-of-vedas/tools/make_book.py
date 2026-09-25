import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from build_epub import build, ROOT, TITLE

TP = """<h1 class="tp-title">The Cost of the Vedas</h1>
<p class="tp-sub">Fourteen dimensions of modern human life, weighed against an inheritance</p>
<hr class="sep"/>
<p class="tp-auth">CHANDAN KUMAR</p>"""

HOW = """<h1>How This Book Cites</h1>
<p>A book that weighs an inheritance this old is only worth reading if its
claims can be checked. Four rules govern every page.</p>
<p><strong>Hymns are cited by number, not by anthology.</strong> When this book
says <em>Rigveda 10.90.12</em>, any reader can open any edition, in any
language, and find the verse. No claim rests on a translation the reader cannot
locate.</p>
<p><strong>Attribution and authorship are kept apart.</strong> The Rigveda's
hymns do not sign themselves. The seers' names &#8212; including the women's
&#8212; come from the <em>Anukrama&#7751;&#299;</em>, an index compiled
centuries later. So this book never says a named person wrote a hymn. It says
the tradition recorded that person as its seer, which is what the evidence
supports and is, in the end, the more remarkable fact.</p>
<p><strong>Layers are kept apart.</strong> A great deal attributed to
&#8220;the Vedas&#8221; belongs to the Dharma&#347;&#257;stras, the epics, the
Bhagavad G&#299;t&#257; or the later commentators &#8212; texts composed
centuries or millennia after the hymns. Where this book discusses such material
it says so. The distinction is not pedantry: in nearly every chapter, the gift
is in the older layer and the cost is in what was added later and attributed
backwards.</p>
<p><strong>Where the evidence runs out, this book stops.</strong> Several central
questions are genuinely unsettled. Where scholars disagree, that is stated and
no side is smuggled in. An interpretation is labelled an interpretation.</p>
<p>This occasionally makes the argument weaker than it could have been. It also
means nothing here needs defending on faith.</p>"""

HOWREAD = """<h1>How to Read This Book</h1>
<p>Each of the fourteen chapters takes one dimension of a life being lived now
&#8212; the mind, the body, money, work, family, and so on &#8212; and asks the
same two questions of the Vedic inheritance: <em>what did it give this part of
my life, and what did it cost?</em></p>
<p>Every chapter follows the same path. It opens on a modern scene. It sets out
what the texts actually say, with the limits of the evidence marked. It states
the gift plainly and without inflation. It states the cost plainly and without
softening. It closes with a SWOT diagram &#8212; strengths, weaknesses,
opportunities, threats &#8212; so the dimension can be seen whole rather than
argued at. Then it asks what remains today, in India and in the diaspora.</p>
<p>The chapters can be read in any order. They are arranged from the most
interior dimensions outward to the most collective, and the closing chapter
gathers the pattern that runs through all fourteen.</p>
<p>No chapter asks the reader to believe anything.</p>"""

front = [
    ("titlepage", TITLE, TP, ""),
    ("howcite", "How This Book Cites", HOW, "front"),
    ("howread", "How to Read This Book", HOWREAD, "front"),
]

chapters = [
    ("ch01-mind.md",        "ch01-swot.png", "1. Mind and Psychology"),
    ("ch02-body.md",        "ch02-swot.png", "2. Body and Physiology"),
    ("ch03-finance.md",     "ch03-swot.png", "3. Finance and Wealth"),
    ("ch04-work.md",        "ch04-swot.png", "4. Work and Purpose"),
    ("ch05-family.md",      "ch05-swot.png", "5. Family and Relationships"),
    ("ch06-women.md",       "ch06-swot.png", "6. Women and Gender"),
    ("ch07-caste.md",       "ch07-swot.png", "7. Social Order and Caste"),
    ("ch08-knowledge.md",   "ch08-swot.png", "8. Knowledge and Learning"),
    ("ch09-language.md",    "ch09-swot.png", "9. Language and Expression"),
    ("ch10-geography.md",   "ch10-swot.png", "10. Geography and Migration"),
    ("ch11-environment.md", "ch11-swot.png", "11. Environment and Nature"),
    ("ch12-health.md",      "ch12-swot.png", "12. Health and Medicine"),
    ("ch13-ethics.md",      "ch13-swot.png", "13. Ethics and Conflict"),
    ("ch14-meaning.md",     "ch14-swot.png", "14. Meaning and Mortality"),
]

out = build(chapters, front, ROOT / "build" / "the-cost-of-the-vedas.epub")
print("EPUB:", out)
print("size:", round(out.stat().st_size / 1024 / 1024, 2), "MB")
