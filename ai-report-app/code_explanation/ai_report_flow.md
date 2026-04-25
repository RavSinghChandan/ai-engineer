# AI Report App — Dynamic Code Flow
> `ai-report-app/backend/`

---

## What This Project Does

An **AI-powered PDF report generator**.
Send any text or data → one AI call → get back a structured data report AND a LinkedIn-style carousel PDF, merged into one download.

Uses **DeepSeek API directly** via HTTP (not LangChain chains or LangGraph) — this is the simplest AI pattern: one structured prompt → one structured JSON response → build documents from it.

**Type:** Direct LLM API Call → Structured Output → PDF Generation  
**LLM:** DeepSeek (raw REST API)  
**PDF:** ReportLab

---

## Mind Map

```
                        ┌─────────────┐
                        │    USER     │
                        └──────┬──────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                ▼                  ▼
   POST /generate-report  POST /generate-carousel  GET /health
              │                │
              ▼                ▼
   ┌──────────────────┐  ┌──────────────────────┐
   │ Auth check       │  │ Auth check           │
   │ verify_api_key() │  │ verify_api_key()     │
   └────────┬─────────┘  └──────────┬───────────┘
            │ ✓                     │ ✓
            ▼                       ▼
   Rate limit check          ┌────────────────┐
   rate_limit()              │ carousel_ai.py │
            │ ✓              │ get_carousel_  │
            ▼                │ slides(topic)  │
   ┌──────────────────────┐  └───────┬────────┘
   │  ai_service.py       │          │
   │  get_unified_        │          ▼
   │  analysis(input)     │  generate_carousel_pdf()
   │                      │          │
   │  ONE DeepSeek call   │          ▼
   │  → report JSON       │  FileResponse(PDF)
   │  + carousel JSON     │
   └────────┬─────────────┘
            │
     ┌──────┴────────┐
     ▼               ▼
 report data    carousel slides
     │               │
     ▼               ▼
graph_service    carousel_service
generate_graph() generate_carousel_pdf()
(matplotlib PNG)  (ReportLab)
     │               │
     ▼               ▼
 generate_pdf()  carousel.pdf
 (ReportLab)
     │
     └─────────────────┐
                        ▼
                  merge_pdfs()
                  [report + carousel]
                        │
                        ▼
              FileResponse(ai_report_full.pdf)
```

---

## Step-by-Step Code Flow

```
Step 1   User sends: POST /generate-report
         Form fields: text_input="Sales grew 20% in Q1..."
                      author_name="Chandan"
         (optional): logo image, profile_pic image

Step 2   Middleware runs first:
         verify_api_key()  → checks header "X-API-Key" against config.SAAS_API_KEY
         rate_limit()      → max 20 requests/minute per IP

Step 3   main.py::generate_report()
         → If file uploaded: read bytes → decode UTF-8 → user_input
         → If logo/profile_pic: save to /tmp/ with original extension
         → calls get_unified_analysis(user_input)

Step 4   services/ai_service.py::get_unified_analysis(user_input)
         → Builds UNIFIED_PROMPT (big structured prompt)
         → HTTP POST to DeepSeek API:
               URL: https://api.deepseek.com/v1/chat/completions
               model: deepseek-chat
               messages: [{ role: "user", content: prompt }]
               temperature: 0.2
         → Response: JSON string inside choices[0].message.content
         → Strip markdown fences (```json...```)
         → json.loads() → Python dict
         → Validate: "report" key + "carousel" key must exist
         → If ANYTHING fails → return FALLBACK dict

Step 5   Parallel document generation:
         graph_service.py::generate_graph(report_data)
             → matplotlib: x_values vs y_values line chart
             → saves to /tmp/graph_*.png
             → returns path

         carousel_service.py::generate_carousel_pdf(carousel_slides)
             → ReportLab: one page per slide
             → Styled: dark background, white text
             → saves to /tmp/carousel_*.pdf
             → returns path

Step 6   pdf_service.py::generate_pdf(report_data, graph_path, logo, profile, author)
         → ReportLab: branded report
             Page 1: title + author + logo + profile pic
             Page 2: chart (graph PNG embedded)
             Page 3+: insights as bullet points
         → saves to /tmp/report_*.pdf

Step 7   pdf_merger.py::merge_pdfs([report_pdf, carousel_pdf])
         → PyPDF2: concatenate both PDFs
         → single /tmp/merged_*.pdf

Step 8   FileResponse(merged_pdf)
         → Downloads as "ai_report_full.pdf"
```

---

## One Complete Example — Sales Data Input

**Input:**
```
POST /generate-report
text_input: "Our sales data for 2024:
Jan: 45000, Feb: 52000, Mar: 48000,
Apr: 61000, May: 73000, Jun: 89000"
author_name: "Chandan Kumar"
X-API-Key: ai-report-saas-2024
```

**Trace through code:**

```
middleware/auth.py:
  verify_api_key("ai-report-saas-2024") → matches config → ✓

middleware/rate_limiter.py:
  IP: 127.0.0.1 → 1st request this minute → ✓

ai_service.py::get_unified_analysis():
  Prompt sent to DeepSeek:
  "Convert this to structured report + carousel JSON:
   Our sales data for 2024: Jan: 45000..."

  DeepSeek responds:
  {
    "report": {
      "title": "2024 Monthly Sales Performance",
      "x_label": "Month",
      "y_label": "Sales (₹)",
      "x_values": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      "y_values": [45000, 52000, 48000, 61000, 73000, 89000],
      "insights": [
        "Sales grew 97% from January to June",
        "March dip suggests seasonal slowdown",
        "Strong acceleration from April — 46% jump in 3 months"
      ]
    },
    "carousel": {
      "slides": [
        { "title": "Your Sales Told a Story in 2024", "content": "And it's one of growth." },
        { "title": "The dip in March?", "content": "Seasonal. The recovery was stronger." },
        { "title": "45K to 89K in 6 months", "content": "That's nearly 2x. Here's how." },
        ...7 total slides
      ]
    }
  }

graph_service.py::generate_graph():
  matplotlib plots Jan-Jun vs sales values
  → /tmp/graph_abc123.png

pdf_service.py::generate_pdf():
  Page 1: "2024 Monthly Sales Performance" + "By Chandan Kumar"
  Page 2: line chart image embedded
  Page 3: 3 insights as bullets
  → /tmp/report_abc123.pdf

carousel_service.py::generate_carousel_pdf():
  7 slides, dark-themed, LinkedIn-style
  → /tmp/carousel_abc123.pdf

pdf_merger.py::merge_pdfs():
  report_abc123.pdf + carousel_abc123.pdf
  → /tmp/merged_abc123.pdf
```

**Output:**
```
HTTP 200 → Downloads: ai_report_full.pdf
  Part 1 (3 pages): Branded data report with chart + insights
  Part 2 (7 pages): LinkedIn carousel slides
  Total: 10 pages in one download
```

---

## File Map

```
ai-report-app/backend/
├── main.py                    → FastAPI app, 2 endpoints, dependency injection
├── config.py                  → Settings (API key, model, rate limits) from env
├── middleware/
│   ├── auth.py                → API key validation
│   └── rate_limiter.py        → IP-based request throttling
└── services/
    ├── ai_service.py          → Single DeepSeek call → report+carousel JSON
    ├── carousel_ai.py         → Standalone carousel (topic only, no data)
    ├── carousel_service.py    → JSON slides → styled PDF (ReportLab)
    ├── graph_service.py       → Numerical data → line chart PNG (matplotlib)
    ├── pdf_service.py         → Report data + chart → branded PDF (ReportLab)
    └── pdf_merger.py          → Combine multiple PDFs into one
```

---

## Key Pattern in This Project

```
THIS IS THE SIMPLEST AI PATTERN: STRUCTURED PROMPT → STRUCTURED OUTPUT

No LangChain. No LangGraph. No agents. No tools.
Just one well-crafted prompt that tells the LLM:
  "Return ONLY valid JSON with exactly this structure: { report: {...}, carousel: {...} }"

The LLM does ALL the intelligence:
  - Extracts numbers from messy text
  - Generates chart axis labels
  - Writes 3 business insights
  - Creates 7 carousel slides

You just parse the JSON and pass it to PDF generators.

FALLBACK PATTERN (important for production):

  try:
      response = call_deepseek(prompt)
      return json.loads(response)
  except ANYTHING:
      return FALLBACK_DICT  ← hardcoded safe response

This means the app NEVER crashes, even if:
  - DeepSeek is down
  - LLM returns invalid JSON
  - Network timeout

MIDDLEWARE PATTERN:

  _SHARED_DEPS = [Depends(verify_api_key), Depends(rate_limit)]

  @app.post("/generate-report", dependencies=_SHARED_DEPS)
  → auth + rate limit run BEFORE the handler, automatically
```
