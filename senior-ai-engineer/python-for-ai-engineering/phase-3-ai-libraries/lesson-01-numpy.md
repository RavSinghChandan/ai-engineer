# Python for AI Engineering — Phase 3
# Lesson 1: NumPy

---

## 1. Intuition (Java Anchor)

Java has no built-in numerical array library. The closest is a plain `double[]` array or Apache Commons Math.
NumPy is the foundation of all Python AI/ML — every embedding vector, every similarity score, every model weight lives in a NumPy array (or a PyTorch/TensorFlow tensor built on NumPy concepts).

You will not write raw NumPy daily as an AI engineer — but you must read it, debug it, and understand why it's fast. LangChain, FAISS, SentenceTransformers all return NumPy arrays.

| Concept | Java | NumPy |
|---|---|---|
| Array | `double[]` or `ArrayList<Double>` | `np.ndarray` |
| 2D Array | `double[][]` | `np.ndarray` with shape `(rows, cols)` |
| Size | `array.length` | `array.shape` |
| Element type | declared at creation | `array.dtype` |
| Math ops | manual loops | vectorized — no loops needed |

---

## 2. Creating Arrays

```python
import numpy as np

# From Python list (like Java Arrays.asList → double[]):
arr = np.array([1.0, 2.0, 3.0, 4.0])
print(arr)         # [1. 2. 3. 4.]
print(arr.dtype)   # float64
print(arr.shape)   # (4,) — 1D array, 4 elements
print(len(arr))    # 4

# 2D array (matrix) — like Java double[][]:
matrix = np.array([[1, 2, 3], [4, 5, 6]])
print(matrix.shape)   # (2, 3) — 2 rows, 3 columns

# Common constructors:
np.zeros(5)           # [0. 0. 0. 0. 0.] — like Java new double[5]
np.ones((3, 4))       # 3×4 matrix of 1.0
np.full(5, 0.5)       # [0.5 0.5 0.5 0.5 0.5]
np.eye(3)             # 3×3 identity matrix
np.arange(0, 10, 2)   # [0 2 4 6 8] — like Java IntStream.range() with step
np.linspace(0, 1, 5)  # [0.   0.25 0.5  0.75 1.  ] — evenly spaced

# Random:
np.random.random(5)         # 5 random floats [0, 1)
np.random.randn(3, 4)       # 3×4 from standard normal distribution
np.random.seed(42)          # reproducibility — like Java Random(seed)
```

---

## 3. Shape — The Most Important Concept

```python
# Shape is the dimensions of the array — like Java's array dimensions but named

embedding = np.array([0.1, 0.2, 0.3, 0.8])
print(embedding.shape)     # (4,) — 1D vector, 4 dimensions

batch = np.array([
    [0.1, 0.2, 0.3, 0.8],   # embedding 1
    [0.5, 0.1, 0.9, 0.2],   # embedding 2
    [0.3, 0.7, 0.1, 0.4],   # embedding 3
])
print(batch.shape)   # (3, 4) — 3 embeddings, each 4 dimensions

# Reshape — change shape without changing data (like Java Arrays.copyOf but logical)
flat = np.arange(12)              # [0,1,2,...,11]
matrix = flat.reshape(3, 4)       # 3 rows × 4 cols
row_vec = flat.reshape(1, 12)     # (1, 12) — row vector
col_vec = flat.reshape(12, 1)     # (12, 1) — column vector

# -1 means "infer this dimension":
matrix = flat.reshape(3, -1)      # (3, 4) — inferred 4 from 12/3

# Squeeze/expand dims — critical for model inputs:
arr = np.array([[1, 2, 3]])       # shape (1, 3)
arr.squeeze()                     # shape (3,) — remove dimensions of size 1
np.expand_dims(arr, axis=0)       # add a dimension at axis 0
```

---

## 4. Indexing and Slicing (Java: array[i][j])

```python
arr = np.array([10, 20, 30, 40, 50])

# Basic indexing — same as Java:
arr[0]      # 10
arr[-1]     # 50 (last)
arr[1:4]    # [20, 30, 40] — slice

# 2D indexing:
m = np.array([[1,2,3],[4,5,6],[7,8,9]])
m[0, 0]     # 1    — Java: m[0][0]
m[1, 2]     # 6    — Java: m[1][2]
m[0]        # [1,2,3] — first row
m[:, 1]     # [2,5,8] — second column (no Java equivalent without loop)
m[0:2, 1:3] # [[2,3],[5,6]] — submatrix

# Boolean indexing — no Java equivalent:
scores = np.array([0.9, 0.4, 0.7, 0.2, 0.8])
high   = scores[scores > 0.6]     # [0.9, 0.7, 0.8] — filter by condition
print(high)

# Very common in AI: filter embeddings above a score threshold:
embeddings = np.random.randn(100, 384)   # 100 embeddings, 384 dims
scores     = np.random.random(100)
top        = embeddings[scores > 0.8]    # keep only high-score embeddings
```

---

## 5. Vectorized Operations — No Loops Needed

```python
# Java: you'd write a for loop for every operation
# NumPy: operations apply to all elements simultaneously (C-speed, no Python loop)

a = np.array([1.0, 2.0, 3.0, 4.0])
b = np.array([10.0, 20.0, 30.0, 40.0])

# Arithmetic — element-wise:
a + b       # [11. 22. 33. 44.]
a * b       # [10. 40. 90. 160.]
a ** 2      # [1.  4.  9. 16.]
a + 5       # [6.  7.  8.  9.] — scalar broadcast

# Math functions — element-wise:
np.sqrt(a)  # [1.   1.41 1.73 2.  ]
np.exp(a)   # exponential
np.log(a)   # natural log

# Aggregations (Java: no built-in, need loop):
a.sum()     # 10.0
a.mean()    # 2.5
a.max()     # 4.0
a.min()     # 1.0
a.std()     # standard deviation
a.argmax()  # 3 — index of max value
```

---

## 6. Broadcasting (No Java Equivalent)

```python
# Broadcasting: NumPy automatically expands smaller arrays to match larger ones
# Rule: dimensions are compatible if equal OR one of them is 1

# Add scalar to array (scalar broadcasts to match array):
arr = np.array([1, 2, 3, 4])
arr + 10    # [11, 12, 13, 14] — 10 becomes [10,10,10,10] implicitly

# Normalize a batch of embeddings (subtract mean, divide by std):
embeddings = np.random.randn(100, 384)   # 100 vectors of 384 dims
mean = embeddings.mean(axis=0)           # shape (384,) — mean per dimension
std  = embeddings.std(axis=0)            # shape (384,)

normalized = (embeddings - mean) / std   # (100,384) - (384,) → broadcasts
# mean subtracts from each of 100 rows — no loop needed

# Java equivalent: 2 nested for loops over 100×384
# NumPy: 1 line, runs at C speed
```

---

## 7. Dot Product and Cosine Similarity — Core AI Operations

```python
# Dot product (vector similarity before normalization):
a = np.array([1.0, 2.0, 3.0])
b = np.array([4.0, 5.0, 6.0])

dot = np.dot(a, b)             # 1×4 + 2×5 + 3×6 = 32.0
dot = a @ b                    # same — @ is matrix multiply operator

# Cosine similarity — FAISS and all vector DBs use this internally:
def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Batch cosine similarity — query vs all stored embeddings:
query    = np.random.randn(384)           # 1 query embedding
stored   = np.random.randn(1000, 384)    # 1000 stored embeddings

# Normalize all to unit vectors:
query_n  = query / np.linalg.norm(query)
stored_n = stored / np.linalg.norm(stored, axis=1, keepdims=True)

# Cosine similarities in one line (no loop):
scores = stored_n @ query_n              # shape (1000,) — one score per stored vector
top_5  = np.argsort(scores)[-5:][::-1]  # indices of top 5 most similar
```

---

## 8. AI Engineering Patterns

```python
# Pattern 1: Preprocess embeddings before FAISS insert
import numpy as np

def normalize_embeddings(embeddings: np.ndarray) -> np.ndarray:
    """Normalize to unit vectors — required for cosine similarity with FAISS."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    return embeddings / norms

# Pattern 2: Convert list of embeddings from OpenAI to numpy batch
import numpy as np

def embeddings_to_array(response_data: list) -> np.ndarray:
    """Convert OpenAI embedding response to numpy array."""
    return np.array([item["embedding"] for item in response_data], dtype=np.float32)

# Pattern 3: Similarity threshold filtering
def filter_by_threshold(
    query_embedding: np.ndarray,
    chunk_embeddings: np.ndarray,
    threshold: float = 0.75,
) -> list[int]:
    """Return indices of chunks above similarity threshold."""
    q = query_embedding / np.linalg.norm(query_embedding)
    c = chunk_embeddings / np.linalg.norm(chunk_embeddings, axis=1, keepdims=True)
    scores = c @ q
    return np.where(scores >= threshold)[0].tolist()
```

---

## 9. Interview Anchor

**"What NumPy operations do you use when building a vector search pipeline?"**

Say:
> "Three mainly. First, normalization — divide each embedding by its L2 norm to get unit vectors; cosine similarity then equals dot product, which FAISS computes efficiently. Second, batch dot product — `stored_embeddings @ query_embedding` gives a similarity score array for all stored vectors in one operation, no Python loop. Third, `argsort` for ranking — `np.argsort(scores)[-top_k:][::-1]` gives the top-k indices sorted by score. NumPy does all of this at C speed — compared to Java where you'd write nested loops. In practice FAISS wraps these NumPy operations, but understanding what's underneath lets me debug shape mismatches and dtype errors."

---

## 10. Quick Reference

```python
import numpy as np

# Create
np.array([1, 2, 3])              # from list
np.zeros(n)                       # n zeros
np.ones((r, c))                   # r×c ones
np.arange(start, stop, step)      # range
np.random.randn(r, c)             # normal distribution

# Shape
arr.shape                         # (rows, cols, ...)
arr.reshape(r, c)                 # change shape
arr.reshape(-1)                   # flatten to 1D

# Indexing
arr[i]                            # element
arr[i, j]                        # 2D element (Java: arr[i][j])
arr[:, j]                        # column j
arr[arr > 0.5]                   # boolean filter

# Vectorized ops (no loops needed)
a + b; a * b; a ** 2             # element-wise
a + scalar                        # broadcast
np.dot(a, b)  or  a @ b          # dot product
np.linalg.norm(a)                 # L2 norm

# Aggregations
arr.sum(); arr.mean(); arr.max(); arr.min()
arr.argmax()                      # index of max
np.argsort(arr)                   # sorted indices

# Java comparison
# double[]          → np.array([...], dtype=np.float64)
# arr[i]            → arr[i]  (same)
# arr[i][j]         → arr[i, j]  (cleaner)
# for loop math     → vectorized ops  (100x faster)
# Collections.sort  → np.argsort
```
