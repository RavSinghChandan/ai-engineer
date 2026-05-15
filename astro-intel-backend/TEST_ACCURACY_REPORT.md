# AstroIntel Accuracy Report

```

========================================================================
  ASTROINTEL ACCURACY REPORT — 20 DIVERSE PROFILES
  Generated: 2026-05-16 00:53:53
========================================================================

── Per-Profile Results ──────────────────────────────────────────────
Profile                 LP  Domains   HIGH%    KW%    Halluc  Status
------------------------------------------------------------------------
elon_musk                7       0%      0%     0%       N/A  HTTP_401
narendra_modi            5       0%      0%     0%       N/A  HTTP_401
oprah_winfrey            4       0%      0%     0%       N/A  HTTP_401
albert_einstein         33       0%      0%     0%       N/A  HTTP_401
mahatma_gandhi           9       0%      0%     0%       N/A  HTTP_401
bill_gates               4       0%      0%     0%       N/A  HTTP_401
ratan_tata              33       0%      0%     0%       N/A  HTTP_401
angela_merkel            7       0%      0%     0%       N/A  HTTP_401
sachin_tendulkar         3       0%      0%     0%       N/A  HTTP_401
amitabh_bachchan         1       0%      0%     0%       N/A  HTTP_401
steve_jobs               1       0%      0%     0%       N/A  HTTP_401
malala_yousafzai         9       0%      0%     0%       N/A  HTTP_401
warren_buffett           6       0%      0%     0%       N/A  HTTP_401
apj_abdul_kalam          3       0%      0%     0%       N/A  HTTP_401
marie_curie              4       0%      0%     0%       N/A  HTTP_401
virat_kohli             33       0%      0%     0%       N/A  HTTP_401
sundar_pichai           11       0%      0%     0%       N/A  HTTP_401
taylor_swift             7       0%      0%     0%       N/A  HTTP_401
dalai_lama               4       0%      0%     0%       N/A  HTTP_401
mukesh_ambani            9       0%      0%     0%       N/A  HTTP_401
------------------------------------------------------------------------

── Aggregate Accuracy Scores ────────────────────────────────────────
  Profiles tested          : 20
  Successful responses     : 0/20 (0%)
  Avg domain coverage      : 0.0% (target ≥ 100%)
  Avg HIGH confidence rate : 0.0% (target ≥ 30%)
  Avg keyword relevance    : 0.0% (target ≥ 20%)
  Life Path diversity      : 9 unique values [1, 3, 4, 5, 6, 7, 9, 11, 33]

── Hallucination Risk Distribution ─────────────────────────────────
  LOW risk   : 0/20
  MEDIUM risk: 0/20
  HIGH risk  : 0/20

── Accuracy Verdict ─────────────────────────────────────────────────
  [FAIL] Pipeline success rate 0% < 90%
  [FAIL] Domain coverage 0% < 80%
  [FAIL] HIGH confidence rate 0% < 30%
  [FAIL] Keyword relevance 0% < 20%
  [PASS] HIGH hallucination risk <= 10% of profiles

  OVERALL ACCURACY SCORE: 1/5 dimensions = 20%
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
