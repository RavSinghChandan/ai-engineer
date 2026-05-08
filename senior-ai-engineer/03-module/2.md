# Senior AI Engineer — Module 3
# Topic: Chunking Strategies — Fixed, Semantic, Hierarchical (Trade-offs)

---

## 1. Intuition

Chunking is the most underestimated step in RAG. 80% of retrieval failures trace back to poor chunking decisions.

Senior engineers treat chunking as a domain problem, not a parameter to set once and forget. The right chunk strategy depends on your document structure, your query types, and your retrieval quality targets.

---

## 2. Core Concept

Chunking: splitting source documents into smaller units for embedding and retrieval.

Why you cannot embed the whole document: embedding models have context limits (typically 8K tokens). But more importantly, a single vector for a 50-page document is too coarse — it cannot represent all the specific facts in that document with enough granularity for targeted retrieval.

### Chunking Strategies

**Fixed-size chunking:**
Split every N tokens or characters, regardless of content structure.
- Example: split at every 512 tokens with 50-token overlap
- Simple, fast, deterministic
- Problem: splits mid-sentence or mid-concept frequently

**Sentence-boundary chunking:**
Split at sentence boundaries, group up to N tokens.
- Preserves complete thoughts
- Requires sentence segmentation (NLTK, spaCy)
- Slightly more complex but much better than raw character splitting

**Recursive character splitting (LangChain default):**
Try to split on paragraph → sentence → word → character, in that order.
- Most practical general-purpose approach
- Preserves natural language structure as much as possible

**Semantic chunking:**
Group sentences that are semantically similar (by embedding similarity).
- Split where topic changes significantly
- Best chunk coherence — each chunk is about one topic
- More expensive (requires embedding during ingestion)

**Hierarchical (parent-child) chunking:**
Store documents at two levels: large parent chunks and small child chunks.
- Retrieve by small child chunks (high precision)
- Return the parent chunk to LLM (more context)
- Best of both: precise retrieval, rich context for LLM

**Document-structure-aware chunking:**
Use document structure (headings, sections, tables, code blocks) as split boundaries.
- For PDFs with clear sections: split at H1/H2 level
- For code: split at function/class boundaries
- For tables: keep tables intact as a single chunk

---

## 3. Why / When to Use

| Strategy | Best For | Avoid When |
|---|---|---|
| Fixed-size | Quick prototyping, uniform text | Documents with clear structure |
| Recursive character | General text (most common) | Code, tables, structured data |
| Semantic | Long, topic-varied documents | Small documents, cost-sensitive ingestion |
| Hierarchical | Q&A over long documents | Simple retrieval needs |
| Structure-aware | PDFs, code repos, legal docs | Plain text without structure |

---

## 4. How It Works (Chunk Quality Factors)

Three parameters that matter:
- Chunk size: smaller = more precise retrieval, higher chunk count, more index size. Larger = more context per chunk, lower precision.
- Overlap: ensures boundary sentences appear in at least one chunk. Typically 10-20% of chunk size.
- Strategy: determines chunk boundaries — this is the most impactful variable, often treated as an afterthought.

Quality test for chunking:
```
Take 20 representative queries from your domain.
Retrieve top-5 chunks per query.
Ask: does each retrieved chunk actually contain the answer to the query?
Precision = (# queries where top-1 chunk is correct) / 20
```
If precision < 70%, your chunking (or retrieval) needs improvement.

---

## 5. Code Skeleton (Production-Grade)

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter, SentenceTransformersTokenTextSplitter

# Standard production chunker — best starting point for most use cases
def chunk_document_standard(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""]  # try paragraph → sentence → word → char
    )
    return splitter.split_text(text)

# Structure-aware chunking for PDF with sections
def chunk_pdf_by_structure(pages: list[dict]) -> list[dict]:
    """pages: list of {"page_num": int, "text": str, "heading": str | None}"""
    chunks = []
    current_section = {"heading": None, "content": "", "pages": []}
    
    for page in pages:
        if page["heading"]:  # new section detected
            if current_section["content"].strip():
                chunks.append({
                    "text": f"{current_section['heading']}\n\n{current_section['content']}".strip(),
                    "metadata": {
                        "heading": current_section["heading"],
                        "pages": current_section["pages"]
                    }
                })
            current_section = {"heading": page["heading"], "content": page["text"], "pages": [page["page_num"]]}
        else:
            current_section["content"] += "\n" + page["text"]
            current_section["pages"].append(page["page_num"])
    
    # Add final section
    if current_section["content"].strip():
        chunks.append({
            "text": current_section["content"].strip(),
            "metadata": {"heading": current_section["heading"], "pages": current_section["pages"]}
        })
    
    # Sub-chunk large sections that exceed embedding model context
    final_chunks = []
    for chunk in chunks:
        if len(chunk["text"]) > 4000:  # rough token limit proxy
            sub_texts = chunk_document_standard(chunk["text"], chunk_size=512)
            for i, sub_text in enumerate(sub_texts):
                final_chunks.append({
                    "text": sub_text,
                    "metadata": {**chunk["metadata"], "sub_chunk_idx": i}
                })
        else:
            final_chunks.append(chunk)
    
    return final_chunks

# Hierarchical chunking — parent/child index
def build_hierarchical_index(text: str, vector_store_small, vector_store_large):
    # Large parent chunks for context
    large_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=150)
    parent_chunks = large_splitter.split_text(text)
    
    # Small child chunks for retrieval
    small_splitter = RecursiveCharacterTextSplitter(chunk_size=256, chunk_overlap=32)
    
    for parent_idx, parent_text in enumerate(parent_chunks):
        child_chunks = small_splitter.split_text(parent_text)
        
        # Store parent in large index
        parent_vector = embed_text(parent_text)
        vector_store_large.add(str(parent_idx), parent_text, parent_vector, {"parent_idx": parent_idx})
        
        # Store children with pointer to parent
        for child_idx, child_text in enumerate(child_chunks):
            child_vector = embed_text(child_text)
            vector_store_small.add(
                f"{parent_idx}_{child_idx}", child_text, child_vector,
                {"parent_idx": parent_idx, "child_idx": child_idx}
            )

def hierarchical_query(query: str, vector_store_small, vector_store_large, top_k: int = 3) -> list[str]:
    # Retrieve by small chunks (high precision)
    query_vector = embed_text(query)
    child_results = vector_store_small.search(query_vector, top_k=top_k * 2)
    
    # Deduplicate parent IDs
    parent_ids = list(dict.fromkeys(r["metadata"]["parent_idx"] for r in child_results))[:top_k]
    
    # Return full parent chunks (rich context for LLM)
    parent_texts = [vector_store_large.get(str(pid))["text"] for pid in parent_ids]
    return parent_texts
```

---

## 6. Example (From Your Projects)

**LangChain Service — chunking choice:**

Used `RecursiveCharacterTextSplitter` with chunk_size=1000, chunk_overlap=200.
This is the LangChain default and works well for general text.

What I would change for production:
- Reduce chunk_size to 512 for better retrieval precision on specific fact queries
- Add structure-aware splitting for PDFs: detect headings and keep sections together before sub-chunking
- For the specific use case of legal/policy documents: hierarchical chunking — retrieve by small child chunks (precise hit on the relevant clause), return full parent section (complete legal context for LLM)

In interview: "I started with LangChain's RecursiveCharacterTextSplitter as a baseline. For production, the chunk strategy depends on the document type. For PDFs with clear sections: structure-aware. For long narrative documents: semantic or hierarchical. For uniform text: recursive character splitting with 512 tokens and 10% overlap is a solid default."

---

## 7. Trade-offs

Small chunks (128-256 tokens):
+ High retrieval precision — chunk is focused on one specific fact
- More chunks in index, higher storage cost, may miss context around the retrieved fact

Large chunks (1024-2048 tokens):
+ More context per retrieved chunk, LLM has more surrounding information
- Lower precision — chunk covers multiple topics, retrieval may return irrelevant content

Overlap:
+ Prevents key sentences at boundaries from being split across chunks
- Stores duplicate content, increases index size by 10-20%

Semantic chunking:
+ Best coherence — each chunk is about one topic
- Requires embedding during ingestion (cost + time), more complex pipeline

Hierarchical:
+ Combines precision of small chunks with context richness of large chunks
- Two indexes to maintain, more complex query logic

---

## 8. Interview Questions (Senior Level)

- Why is chunking more important than people think in a RAG system?
- What chunking strategy would you use for a 500-page PDF of legal contracts?
- How do you detect that your chunking strategy is hurting retrieval quality?
- What is hierarchical chunking and when would you choose it over flat chunking?
- How do you handle tables and code blocks in a chunking pipeline?

---

## 9. Answer Framework

Step 1 — Frame chunking as a domain problem:
"Chunk strategy is not a fixed parameter. It depends on document structure, query types, and retrieval quality targets."

Step 2 — Explain your default and when to deviate:
"My default is RecursiveCharacterTextSplitter at 512 tokens with 10% overlap — handles most text well. For structured PDFs, I use section-aware splitting. For long documents with multi-section answers, hierarchical chunking."

Step 3 — Tie to retrieval quality:
"Chunking quality directly determines context precision in RAGAS. If precision is below 70% on my eval queries, I revisit chunking first before tuning embeddings or retrieval."

Step 4 — From your project:
"In the LangChain service, I used 1000-char chunks with 200-char overlap. For a production rebuild, I would reduce to 512 tokens and add a structure-aware step for PDFs."

Step 5 — Edge cases:
"For tables: keep the entire table as a single chunk with a text representation header. For code: split at function boundaries, never mid-function."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How does chunk size affect retrieval quality differently for different query types?

Answer:
Short, specific queries (looking for a specific fact or number): smaller chunks (256-512 tokens) give better precision because the relevant sentence is the dominant content of the chunk.
Long, conceptual queries (looking for an explanation or comparison): larger chunks (512-1024 tokens) give better recall because the explanation spans multiple sentences that stay together.
Multi-hop queries (requiring synthesis across sections): hierarchical or multi-query retrieval — no single chunk size solves this.
In practice: most production systems serve a mix of query types. Test your eval set across both specific and conceptual queries. If precision is low on specific queries, reduce chunk size. If recall is low on conceptual queries, increase chunk size or add overlap.

---

Q2: How do you handle tables in chunking?

Answer:
Tables break standard text splitters completely — a recursive character splitter will cut through a table mid-row, losing the column-row relationship.
The correct approach depends on how the table is stored:
Markdown table: treat the entire table as a single chunk. Add a text header summarizing what the table contains ("Table: pricing by region") so the embedding captures the topic, not just the cell values.
PDF table: use a table extraction library (Camelot, pdfplumber) to extract as structured data. Convert to a text representation with headers, then embed as a single chunk.
HTML table: extract with BeautifulSoup, convert to CSV-like text representation.
Key principle: a table's meaning comes from the combination of row, column, and cell. Split it and the meaning is destroyed. Always keep tables whole, even if they exceed your standard chunk size — large tables are the exception to the chunk size rule.

---

Q3: What is the effect of overlap on retrieval quality and how do you tune it?

Answer:
Overlap ensures that a sentence near a chunk boundary appears in full in at least one chunk's representation.
Without overlap: a key sentence like "Refunds are processed within 5 business days, except for international transactions which take 14 days" might be split at the comma. The first chunk ends with "...business days" and the second starts with "except for international...". Neither chunk contains the full sentence for accurate retrieval.
With 10-20% overlap: both chunks now contain most of this sentence. The retrieval system finds it regardless of which chunk boundary it landed near.
How to tune: start at 10-15% of chunk size. Evaluate context recall (are all relevant facts being retrieved?). If recall is low and you suspect boundary splits, increase overlap. Trade-off: higher overlap = more storage and more chunks = slightly longer index build time.

---

Q4: How do you handle a corpus where documents are of wildly different lengths (from 1 paragraph to 500 pages)?

Answer:
Use adaptive chunking — different strategies for different document sizes.
Short documents (under 1000 tokens): embed the whole document as a single chunk. No splitting needed.
Medium documents (1000-20000 tokens): standard recursive splitting with chunk_size=512, overlap=64.
Long documents (20000+ tokens): hierarchical chunking — large parent sections + small child chunks.
Implementation: check token count at ingestion time and route to the appropriate chunking strategy.
Maintain metadata: for each chunk, store source_document_length and chunk_strategy in the metadata. This lets you analyze which strategy is working for which document type and tune independently.

---

Q5: How do you chunk source code for a code search RAG system?

Answer:
Code requires structure-aware chunking — the same as PDFs but with different structure markers.
The natural chunk boundaries for code: function/method level — each function is one chunk. This is the most semantically coherent unit for code retrieval.
Implementation: use a code-aware parser (tree-sitter, or language-specific AST) to extract function boundaries. Do not use character or sentence splitting on code.
Metadata to store with each code chunk: function name, class name, file path, language, line range, docstring. This metadata is what makes code retrieval useful — you want to find "the login function in auth.py", not just any code that mentions "login".
For functions that are too long (> 512 tokens): split at logical sub-blocks (try/catch blocks, major conditional branches) while preserving the function signature at the start of each sub-chunk.
In a Java codebase (your background): each method is one chunk. The class declaration and method signature are included at the top of each chunk for context.
