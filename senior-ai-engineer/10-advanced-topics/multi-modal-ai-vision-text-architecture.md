# Senior AI Engineer — Module 10
# Topic: Multi-Modal AI — Architecture for Vision + Text Systems

---

## 1. Intuition

Multi-modal AI systems process and reason across multiple input types — text, images, audio, documents. GPT-4o, Claude 3.5 Sonnet, and Gemini Pro are all multi-modal.

Senior engineers need to know how to build systems that use vision APIs, handle multi-modal inputs correctly, and design pipelines where images and text combine for business tasks.

---

## 2. Core Concept

### Input Types and API Patterns

**Text + Image (most common):**
User sends an image (screenshot, product photo, document scan, chart) plus a text question. The vision LLM processes both and responds.

**Text + Audio:**
Whisper (or GPT-4o Audio) transcribes audio → LLM processes transcript. Or GPT-4o handles audio directly.

**Text + Documents:**
PDFs with embedded images (charts, figures, tables). Standard PDF text extraction misses image-based content. Vision LLMs process the PDF pages as images.

**Video (emerging):**
Frame extraction + sequential image processing. Gemini 1.5 Pro processes video directly.

### When to Use Vision LLMs vs OCR

| Scenario | Approach |
|---|---|
| Text document (machine-readable) | Standard text extraction (pdfplumber, PyPDF2) — cheaper, faster |
| Scanned document / handwriting | Vision LLM or OCR (Tesseract, Google Vision API) |
| Chart / graph interpretation | Vision LLM (GPT-4o) — can reason about visual trends |
| Structured form with mixed text/images | Vision LLM with structured output |
| Product photos for catalog | Vision LLM for description generation |
| Screenshot debugging | Vision LLM — understands UI context |

---

## 3. Architecture Patterns

### Pattern 1: Vision Q&A (Single Image)

```
User: image + question
    ↓
Encode image to base64
    ↓
GPT-4o vision API call with image + text
    ↓
Answer with visual grounding
```

### Pattern 2: Document Analysis Pipeline (Multi-page PDF)

```
PDF upload
    ↓
Page-by-page image rendering (pdf2image)
    ↓
Parallel vision LLM calls per page (extract text + describe charts)
    ↓
Combine extracted text per page
    ↓
Standard RAG pipeline on combined text
    ↓
Answer with page attribution
```

### Pattern 3: Multi-modal RAG

```
Ingest documents:
    Text chunks → embed → vector store
    Images → vision LLM description → embed description → vector store (same index)

Query:
    Text query → retrieve relevant chunks (text or image descriptions)
    If image chunk retrieved → include original image + description in context
    LLM answers using text + visual evidence
```

---

## 4. Code Skeleton (Production-Grade)

```python
import base64
import asyncio
from pathlib import Path
from openai import AsyncOpenAI
import fitz  # PyMuPDF for PDF rendering
from io import BytesIO
from PIL import Image

client = AsyncOpenAI()

def encode_image_to_base64(image_path: str) -> str:
    """Encode local image file to base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def encode_pil_image_to_base64(image: Image.Image, format: str = "JPEG") -> str:
    """Encode PIL Image to base64 string."""
    buffer = BytesIO()
    image.save(buffer, format=format, quality=85)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def vision_qa(
    image_path: str,
    question: str,
    detail: str = "high"  # "low" (fast, cheap) or "high" (detailed, 2x cost)
) -> str:
    """Single image Q&A."""
    image_data = encode_image_to_base64(image_path)
    
    # Detect image format
    suffix = Path(image_path).suffix.lower()
    media_type = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(suffix, "image/jpeg")
    
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_data}",
                            "detail": detail
                        }
                    },
                    {
                        "type": "text",
                        "text": question
                    }
                ]
            }
        ],
        max_tokens=1000
    )
    
    return response.choices[0].message.content


async def extract_page_content(page_image: Image.Image, page_num: int) -> dict:
    """Extract text and visual content from a single PDF page image."""
    image_b64 = encode_pil_image_to_base64(page_image)
    
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": "Extract all text and describe any charts, tables, or figures. Return as JSON: {text: str, charts: [str], tables: [str], figures: [str]}"
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_b64}",
                            "detail": "high"
                        }
                    },
                    {
                        "type": "text",
                        "text": f"Extract all content from page {page_num + 1}."
                    }
                ]
            }
        ],
        max_tokens=2000,
        response_format={"type": "json_object"}
    )
    
    import json
    content = json.loads(response.choices[0].message.content)
    content["page_num"] = page_num + 1
    return content


async def process_pdf_with_vision(pdf_path: str, max_pages: int = 20) -> list[dict]:
    """
    Process a PDF with vision LLM for image-heavy documents.
    Renders each page as an image, extracts content in parallel.
    
    Cost note: at "high" detail, each page ~= 1000-2000 tokens.
    20-page PDF ≈ $0.10-0.20 at GPT-4o pricing.
    """
    doc = fitz.open(pdf_path)
    pages_to_process = min(len(doc), max_pages)
    
    # Render pages to images
    page_images = []
    for page_num in range(pages_to_process):
        page = doc[page_num]
        mat = fitz.Matrix(2, 2)  # 2x zoom for better OCR quality
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        page_images.append(img)
    
    # Process pages concurrently (batches of 5 to avoid rate limits)
    all_results = []
    batch_size = 5
    
    for i in range(0, len(page_images), batch_size):
        batch = page_images[i:i + batch_size]
        tasks = [extract_page_content(img, i + j) for j, img in enumerate(batch)]
        batch_results = await asyncio.gather(*tasks)
        all_results.extend(batch_results)
        
        if i + batch_size < len(page_images):
            await asyncio.sleep(1)  # Rate limit buffer between batches
    
    return all_results


class MultiModalRAGPipeline:
    """
    RAG pipeline that handles both text and image content.
    Images are stored as their vision-extracted descriptions.
    """
    
    def __init__(self, vector_store, embedding_model):
        self.vector_store = vector_store
        self.embedding_model = embedding_model
    
    async def ingest_document(self, pdf_path: str, doc_id: str, tenant_id: str):
        """Ingest a PDF — handles both text and image pages."""
        
        # First try standard text extraction (fast, cheap)
        text_chunks = self._extract_text_chunks(pdf_path)
        
        # For image-heavy pages (few words extracted), use vision
        vision_content = []
        for chunk in text_chunks:
            if len(chunk["text"].split()) < 50:  # sparse page = likely image-heavy
                # Will be processed with vision
                vision_content.append(chunk["page_num"])
        
        if vision_content:
            # Process image-heavy pages with vision LLM
            pdf_pages = await process_pdf_with_vision(pdf_path, max_pages=len(vision_content))
            for page_data in pdf_pages:
                if page_data["page_num"] in vision_content:
                    # Replace sparse text chunk with vision-extracted content
                    full_text = page_data["text"]
                    if page_data["charts"]:
                        full_text += "\n\nCharts: " + " | ".join(page_data["charts"])
                    if page_data["tables"]:
                        full_text += "\n\nTables: " + " | ".join(page_data["tables"])
                    
                    # Update the chunk
                    for chunk in text_chunks:
                        if chunk["page_num"] == page_data["page_num"]:
                            chunk["text"] = full_text
                            chunk["has_vision"] = True
        
        # Embed and store all chunks
        for chunk in text_chunks:
            embedding = self.embedding_model.embed(chunk["text"])
            self.vector_store.upsert(
                chunk_id=f"{doc_id}_page_{chunk['page_num']}",
                embedding=embedding,
                text=chunk["text"],
                metadata={"doc_id": doc_id, "tenant_id": tenant_id, "page": chunk["page_num"]}
            )
    
    def _extract_text_chunks(self, pdf_path: str) -> list[dict]:
        """Standard text extraction — fast path."""
        import pdfplumber
        chunks = []
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                chunks.append({"page_num": page_num + 1, "text": text, "has_vision": False})
        return chunks
    
    async def query(self, question: str, tenant_id: str, image_path: str = None) -> dict:
        """
        Query with optional image input.
        If image provided, analyze it first then combine with retrieved text context.
        """
        
        # Analyze image if provided
        image_analysis = None
        if image_path:
            image_analysis = await vision_qa(
                image_path,
                "Describe what you see in detail, including any text, charts, or key visual elements.",
                detail="high"
            )
        
        # Build search query (combine text question + image description)
        search_query = question
        if image_analysis:
            search_query = f"{question}\n\nImage context: {image_analysis}"
        
        # Retrieve relevant chunks
        query_embedding = self.embedding_model.embed(search_query[:500])
        chunks = self.vector_store.search(
            query_embedding,
            top_k=4,
            filter={"tenant_id": tenant_id}
        )
        
        context = "\n\n".join([f"[Page {c.metadata['page']}]: {c.text}" for c in chunks])
        
        # Build final prompt
        messages = [
            {"role": "system", "content": "Answer the question using the provided context. Cite page numbers."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
        ]
        
        # Add image to final call if provided
        if image_path and image_analysis:
            messages[-1]["content"] = [
                {"type": "text", "text": f"Context:\n{context}\n\nQuestion: {question}"},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{encode_image_to_base64(image_path)}", "detail": "low"}
                }
            ]
        
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=800
        )
        
        return {
            "answer": response.choices[0].message.content,
            "sources": [c.metadata["page"] for c in chunks],
            "image_analyzed": image_analysis is not None
        }
```

---

## 5. Example (From Your Projects)

**LangChain Service — vision upgrade path:**

The LangChain Service processes PDFs using text extraction. For documents with embedded charts, graphs, or scanned content, this misses critical information. A vision-augmented upgrade:

1. Standard text extraction first (fast path)
2. Detect sparse pages (extracted < 50 words)
3. Run vision LLM on sparse pages only (cost-efficient: only vision where needed)
4. Combine text + vision-extracted content for embedding

This is the "sparse page detection" pattern — you only pay vision LLM costs for pages that need it.

---

## 6. Trade-offs

Vision LLM vs OCR (Tesseract):
Vision LLM: understands context, can reason about charts and figures, no training needed.
OCR: much cheaper ($0.001/page vs $0.01-0.05/page for vision LLM), but pure text extraction — no chart interpretation.

High detail vs low detail (GPT-4o):
High detail: 2048×2048 image, ~1000 extra tokens per image, needed for small text in charts.
Low detail: 512×512, ~85 tokens, sufficient for scene understanding and large text.

Page-by-page vs whole-document:
Page-by-page: parallelizable, manageable context size, clear attribution.
Whole document: not viable for LLMs — even 200K context windows hit rate limits and cost ceilings quickly.

---

## 7. Interview Questions (Senior Level)

- How do you handle a PDF that contains charts and tables, not just text?
- What is the difference between "high" and "low" detail in the GPT-4o vision API?
- How would you build a RAG pipeline that handles both text and image content?
- What are the cost implications of vision LLMs vs text-only LLMs?
- How do you handle image compression before sending to the vision API?

---

## 8. Answer Framework

Step 1 — Vision API basics:
"GPT-4o and Claude 3.5 Sonnet accept images inline in the prompt. Images are encoded as base64 or passed by URL. The model reasons across text and image in a single pass."

Step 2 — Document processing approach:
"For PDFs, I use pdfplumber for standard text extraction first (fast and cheap). For pages with minimal text (charts, scanned pages), I render the page as an image and run vision LLM extraction. Only paying vision LLM costs for pages that need it."

Step 3 — Cost awareness:
"Vision adds cost. A high-detail image costs ~$0.01-0.05 in tokens depending on resolution. For a 50-page document with 10 chart pages, the vision cost is $0.10-0.50 — acceptable for a business document. For a 500-page book with no charts, use text extraction only."

Step 4 — Multi-modal RAG:
"Images are stored in the vector index as their text descriptions, generated by the vision LLM during ingestion. At query time, if a relevant chunk is a chart description, I include both the description and the original image in the final LLM context. The LLM answers with both textual and visual evidence."

Step 5 — Production consideration:
"Vision LLM calls are slow (3-8s per page). For large documents, parallelize page processing in batches of 5, with rate limit buffers between batches. Cache the vision extraction results — re-processing a page costs $0.02-0.05, re-reading from cache costs nothing."
