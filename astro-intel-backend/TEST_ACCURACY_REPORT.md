# AstroIntel Accuracy Report

```

========================================================================
  ASTROINTEL ACCURACY REPORT — 20 DIVERSE PROFILES
  Generated: 2026-05-15 18:55:42
========================================================================

── Per-Profile Results ──────────────────────────────────────────────
Profile                 LP  Domains   HIGH%    KW%    Halluc  Status
------------------------------------------------------------------------
elon_musk                7     100%    100%    71%       low  OK
narendra_modi            5     100%    100%    67%       low  OK
oprah_winfrey            4     100%    100%    40%       low  OK
albert_einstein         33     100%    100%    80%       low  OK
mahatma_gandhi           9     100%    100%   100%       low  OK
bill_gates               4     100%    100%    60%       low  OK
ratan_tata              33     100%    100%    60%       low  OK
angela_merkel            7     100%    100%    60%       low  OK
sachin_tendulkar         3     100%    100%    40%       low  OK
amitabh_bachchan         1     100%    100%    60%       low  OK
steve_jobs               1     100%    100%    40%       low  OK
malala_yousafzai         9     100%    100%    40%       low  OK
warren_buffett           6     100%    100%    60%       low  OK
apj_abdul_kalam          3     100%    100%    20%       low  OK
marie_curie              4     100%    100%    80%       low  OK
virat_kohli             33     100%    100%    80%       low  OK
sundar_pichai           11     100%    100%    60%       low  OK
taylor_swift             7     100%    100%    40%       low  OK
dalai_lama               4     100%    100%    40%       low  OK
mukesh_ambani            9     100%    100%    60%       low  OK
------------------------------------------------------------------------

── Aggregate Accuracy Scores ────────────────────────────────────────
  Profiles tested          : 20
  Successful responses     : 20/20 (100%)
  Avg domain coverage      : 100.0% (target ≥ 100%)
  Avg HIGH confidence rate : 100.0% (target ≥ 30%)
  Avg keyword relevance    : 57.9% (target ≥ 20%)
  Life Path diversity      : 9 unique values [1, 3, 4, 5, 6, 7, 9, 11, 33]

── Hallucination Risk Distribution ─────────────────────────────────
  LOW risk   : 20/20
  MEDIUM risk: 0/20
  HIGH risk  : 0/20

── Accuracy Verdict ─────────────────────────────────────────────────
  [PASS] Pipeline success rate >= 90%
  [PASS] Domain coverage >= 80%
  [PASS] HIGH confidence rate >= 30%
  [PASS] Keyword relevance >= 20%
  [PASS] HIGH hallucination risk <= 10% of profiles

  OVERALL ACCURACY SCORE: 5/5 dimensions = 100%
========================================================================
```

## Profile Ground Truth

| Profile | DOB | Birthplace | Life Path | Description |
|---|---|---|---|---|
| elon_musk | 1971-06-28 | Pretoria | 7 | Entrepreneur, Life Path 4 (builder, disciplined, systematic) |
| narendra_modi | 1950-09-17 | Vadnagar | 5 | Indian PM, Life Path 6 (service, responsibility, duty) |
| oprah_winfrey | 1954-01-29 | Kosciusko | 4 | Media mogul, Life Path 4 (hard work, discipline, builder) |
| albert_einstein | 1879-03-14 | Ulm | 33 | Physicist, Life Path 3 (creative, intellectual, expressive) |
| mahatma_gandhi | 1869-10-02 | Porbandar | 9 | Freedom fighter, Life Path 9 (humanitarian, compassion) |
| bill_gates | 1955-10-28 | Seattle | 4 | Tech founder + philanthropist, Life Path 1 (pioneer, independent) |
| ratan_tata | 1937-12-28 | Mumbai | 33 | Indian industrialist, respected for ethics + business |
| angela_merkel | 1954-07-17 | Hamburg | 7 | German Chancellor, scientist-turned-politician |
| sachin_tendulkar | 1973-04-24 | Mumbai | 3 | Cricket legend, Life Path 4 (discipline, hard work, mastery) |
| amitabh_bachchan | 1942-10-11 | Allahabad | 1 | Bollywood icon, known for resilience + comeback |
| steve_jobs | 1955-02-24 | San Francisco | 1 | Apple founder, Life Path 2 (visionary perfectionist) |
| malala_yousafzai | 1997-07-12 | Mingora | 9 | Nobel laureate, education activist |
| warren_buffett | 1930-08-30 | Omaha | 6 | Investor, Life Path 8 (material mastery, business acumen) |
| apj_abdul_kalam | 1931-10-15 | Rameswaram | 3 | Indian President + scientist, Life Path 9 (humanitarian) |
| marie_curie | 1867-11-07 | Warsaw | 4 | Scientist, first woman Nobel — Life Path 7 (analytical, research) |
| virat_kohli | 1988-11-05 | Delhi | 33 | Indian cricket captain, born 1988-11-05 |
| sundar_pichai | 1972-07-12 | Madurai | 11 | Google CEO, Indian-American tech leader |
| taylor_swift | 1989-12-13 | West Reading | 7 | Pop star, Life Path 8 (ambition, fame, resilience) |
| dalai_lama | 1935-07-06 | Taktser | 4 | Spiritual leader, Life Path 7 (wisdom, spiritual, introspective) |
| mukesh_ambani | 1957-04-19 | Aden | 9 | Richest Indian, Life Path 8 (material power, business) |
