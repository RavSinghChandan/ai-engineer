# The Cost of the Vedas

**Fourteen dimensions of modern human life, weighed against an inheritance**
by Chandan Kumar

A book that asks, of each dimension of a life being lived now, what the Vedic
inheritance gave it and what it cost. Every chapter closes with a SWOT so the
dimension can be seen whole rather than argued at.

## The fourteen dimensions

1. Mind and Psychology · 2. Body and Physiology · 3. Finance and Wealth ·
4. Work and Purpose · 5. Family and Relationships · 6. Women and Gender ·
7. Social Order and Caste · 8. Knowledge and Learning · 9. Language and
Expression · 10. Geography and Migration · 11. Environment and Nature ·
12. Health and Medicine · 13. Ethics and Conflict · 14. Meaning and Mortality

## Citation rules

1. Hymns cited by number, so any reader can check any edition.
2. Attribution (Anukramaṇī) never confused with authorship.
3. Vedic layers never confused with Dharmaśāstra, epic or commentary.
4. Where scholars disagree, say so and take no side.

## Build

```sh
python3 tools/make_swots.py     # 14 SWOT diagrams
python3 tools/cover.py          # front cover
python3 tools/make_book.py      # EPUB
python3 tools/test_epub.py      # validation
```

Output: `build/the-cost-of-the-vedas.epub`

## Status

All 14 chapters drafted (~17,800 words). The closing personal reckoning
(`manuscript/ch15-conclusion-SCAFFOLD.md`) is a scaffold awaiting the author's
own material and is **not** included in the built EPUB.
