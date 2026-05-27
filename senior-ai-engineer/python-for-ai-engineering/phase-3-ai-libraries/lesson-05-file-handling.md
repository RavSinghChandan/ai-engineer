# Python for AI Engineering — Phase 3
# Lesson 5: File Handling — JSON, CSV, Parquet, Pickle, pathlib

---

## 1. Intuition (Java Anchor)

Java: `FileReader`, `BufferedReader`, `ObjectInputStream`, Jackson for JSON, OpenCSV for CSV — each needs its own import and boilerplate.
Python: built-in `json`, `csv`, `pickle` modules + `pathlib` for paths. All simpler.

| Java | Python |
|---|---|
| `new File("path/to/file")` | `Path("path/to/file")` |
| `file.exists()` | `path.exists()` |
| `file.getParent()` | `path.parent` |
| `file.getName()` | `path.name` |
| `BufferedReader` / `FileReader` | `open()` with context manager |
| Jackson `ObjectMapper.readValue(file, type)` | `json.load(f)` |
| Jackson `objectMapper.writeValue(file, obj)` | `json.dump(obj, f)` |
| OpenCSV `CSVReader` | `csv.DictReader` |
| Java `Serializable` / `ObjectOutputStream` | `pickle.dump()` |

---

## 2. `pathlib` — Path Handling (Java: `java.nio.file.Path`)

```python
from pathlib import Path

# Java: Path path = Paths.get("data", "resumes", "ravi.pdf");
# Python:
path = Path("data") / "resumes" / "ravi.pdf"   # / operator joins paths
# or:
path = Path("data/resumes/ravi.pdf")

# Path properties (Java: path.getFileName(), path.getParent()):
print(path.name)        # "ravi.pdf"
print(path.stem)        # "ravi"      — name without extension
print(path.suffix)      # ".pdf"      — extension
print(path.parent)      # data/resumes
print(path.parts)       # ("data", "resumes", "ravi.pdf")

# Checks (Java: Files.exists(), Files.isDirectory()):
path.exists()           # True/False
path.is_file()          # True if file
path.is_dir()           # True if directory

# Create directories (Java: Files.createDirectories()):
output_dir = Path("output/reports")
output_dir.mkdir(parents=True, exist_ok=True)   # creates all intermediate dirs

# List files (Java: Files.list(dir)):
data_dir = Path("data")
all_pdfs = list(data_dir.glob("*.pdf"))          # all PDFs in dir
all_pdfs = list(data_dir.rglob("*.pdf"))         # recursive — all nested PDFs

# Absolute path:
path.resolve()          # /Users/ravi/project/data/resumes/ravi.pdf

# Build paths relative to current file (Java: getClass().getResource()):
BASE_DIR = Path(__file__).parent          # directory of current Python file
DATA_DIR = BASE_DIR / "data"              # data/ next to this file
CONFIG   = BASE_DIR.parent / "config.yaml"
```

---

## 3. Reading and Writing Text Files (Java: `BufferedReader` / `FileWriter`)

```python
# Java:
# try (BufferedReader br = new BufferedReader(new FileReader("file.txt"))) {
#     String line; while ((line = br.readLine()) != null) { ... }
# }

# Python — always use context manager:
with open("resume.txt", "r", encoding="utf-8") as f:
    content = f.read()          # entire file as string

# Line by line (lazy — good for large files):
with open("large_log.txt", "r") as f:
    for line in f:              # f is an iterator — reads one line at a time
        process(line.strip())

# Write (Java: FileWriter / PrintWriter):
with open("output.txt", "w", encoding="utf-8") as f:
    f.write("Hello\n")
    f.writelines(["line1\n", "line2\n"])

# Append:
with open("log.txt", "a") as f:
    f.write("New entry\n")

# Read all lines as list (Java: Files.readAllLines()):
with open("file.txt") as f:
    lines = f.readlines()       # ["line1\n", "line2\n"]
    lines = [l.strip() for l in f.readlines()]   # stripped
```

---

## 4. JSON — Built-in (Java: Jackson `ObjectMapper`)

```python
import json

# Read JSON file (Java: objectMapper.readValue(file, Map.class)):
with open("roles.json", "r") as f:
    data = json.load(f)          # → Python dict or list

# Write JSON file (Java: objectMapper.writeValue(file, obj)):
with open("output.json", "w") as f:
    json.dump(data, f, indent=2)  # indent=2 for pretty print

# String ↔ dict (Java: objectMapper.readValue(str) / writeValueAsString):
json_str = json.dumps(data)               # dict → JSON string
json_str = json.dumps(data, indent=2)     # pretty
data     = json.loads(json_str)           # JSON string → dict

# Handle non-serializable types (Java: custom Jackson serializer):
import json
from datetime import datetime

class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()   # datetime → ISO string
        if hasattr(obj, "__dict__"):
            return obj.__dict__      # custom object → dict
        return super().default(obj)

json.dumps({"ts": datetime.now()}, cls=CustomEncoder)
# {"ts": "2026-05-27T10:30:00"}

# AI engineering: parse LLM JSON output
def safe_json_parse(raw: str) -> dict | None:
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        # LLM sometimes wraps in markdown code blocks
        import re
        match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
        if match:
            return json.loads(match.group(1))
        return None
```

---

## 5. CSV (Java: OpenCSV / Apache Commons CSV)

```python
import csv

# Read CSV as list of dicts (Java: CSVReader with headers):
with open("candidates.csv", "r", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)      # first row = headers = dict keys
    candidates = list(reader)
# [{"name": "Ravi", "role": "Python Dev", "score": "85"}, ...]

# Note: all values are strings — cast manually:
for c in candidates:
    c["score"] = int(c["score"])

# Write CSV (Java: CSVWriter):
fieldnames = ["name", "role", "score"]
with open("output.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(candidates)

# AI engineering: Pandas is preferred for CSV with transformations
import pandas as pd
df = pd.read_csv("candidates.csv")         # cleaner — handles types better
df.to_csv("output.csv", index=False)
```

---

## 6. Parquet — Best for Large AI Datasets (Java: No Standard Library)

```python
# Parquet = columnar binary format — 10x smaller and 10x faster than CSV
# Standard format for ML datasets, feature stores, data lakes
# Java: no standard library — use Apache Parquet library directly (complex)
# Python: pandas + pyarrow (pip install pyarrow)

import pandas as pd

# Write Parquet:
df = pd.DataFrame([
    {"user_id": "r1", "embedding": [0.1, 0.2, 0.3], "score": 0.85},
    {"user_id": "r2", "embedding": [0.4, 0.5, 0.6], "score": 0.72},
])
df.to_parquet("embeddings.parquet", engine="pyarrow", compression="snappy")

# Read Parquet:
df = pd.read_parquet("embeddings.parquet")

# Why Parquet in AI engineering:
# - Store precomputed embeddings (avoid re-embedding every run)
# - Store evaluation datasets (RAGAS inputs/outputs)
# - Share large datasets between team members efficiently
```

---

## 7. Pickle — Python Object Serialization (Java: `Serializable` + `ObjectOutputStream`)

```python
import pickle

# Pickle = binary serialization of any Python object
# Java: class must implement Serializable — Python: any object works

# Save:
data = {"model": "gpt-4o", "embeddings": [0.1, 0.2, 0.3], "cache": {}}
with open("state.pkl", "wb") as f:    # 'wb' = write binary
    pickle.dump(data, f)

# Load:
with open("state.pkl", "rb") as f:    # 'rb' = read binary
    data = pickle.load(f)

# Common use: save FAISS index between runs
import faiss
import numpy as np

index = faiss.IndexFlatL2(384)
index.add(np.random.randn(100, 384).astype(np.float32))

# Save FAISS index:
faiss.write_index(index, "faiss.index")
index = faiss.read_index("faiss.index")

# SECURITY WARNING (same as Java deserialization attacks):
# NEVER unpickle data from untrusted sources — arbitrary code execution risk
# Use JSON for API data exchange, pickle only for internal app state
```

---

## 8. `pathlib` in AI Engineering — Pattern

```python
from pathlib import Path
import json

BASE_DIR  = Path(__file__).parent
DATA_DIR  = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"

class FileStore:
    """Simple file-based store — like a minimal repository pattern."""

    def __init__(self, base_dir: Path = DATA_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_profile(self, user_id: str, profile: dict) -> None:
        path = self.base_dir / f"{user_id}_profile.json"
        with open(path, "w") as f:
            json.dump(profile, f, indent=2)

    def load_profile(self, user_id: str) -> dict | None:
        path = self.base_dir / f"{user_id}_profile.json"
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def list_users(self) -> list[str]:
        return [p.stem.replace("_profile", "")
                for p in self.base_dir.glob("*_profile.json")]

    def delete_profile(self, user_id: str) -> bool:
        path = self.base_dir / f"{user_id}_profile.json"
        if path.exists():
            path.unlink()    # delete file (Java: file.delete())
            return True
        return False
```

---

## 9. Interview Anchor

**"How do you handle file I/O in a Python AI service — for uploaded CVs, embeddings, and config?"**

Say:
> "Three different formats for three different needs. PDFs come in via FastAPI `UploadFile` — I write to a temp file using `tempfile.NamedTemporaryFile` as a context manager, extract text, then the temp file auto-deletes. Structured data like role definitions and profiles go to JSON — Python's built-in `json.load` / `json.dump` with a context manager. Large datasets — precomputed embeddings, RAGAS evaluation results — go to Parquet via pandas, which is 10x more compact than CSV. For FAISS indexes I use `faiss.write_index` and `faiss.read_index` to persist between restarts without re-embedding. All paths go through `pathlib.Path` — never string concatenation — so the code works on both Windows and Linux without path separator issues, which matters in Docker."

---

## 10. Quick Reference

```python
from pathlib import Path
import json, csv, pickle

# pathlib
path = Path("dir") / "subdir" / "file.txt"
path.exists(); path.is_file(); path.is_dir()
path.parent; path.name; path.stem; path.suffix
path.mkdir(parents=True, exist_ok=True)
list(path.parent.glob("*.json"))         # find files
path.unlink()                            # delete file

# Text file
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
with open(path, "w") as f:
    f.write(content)

# JSON
data = json.load(open(path))             # read
json.dump(data, open(path, "w"), indent=2)  # write
data = json.loads(json_string)           # parse string
json_string = json.dumps(data)           # to string

# CSV
with open(path) as f:
    rows = list(csv.DictReader(f))       # list of dicts

# Parquet (large datasets)
df.to_parquet("file.parquet")
df = pd.read_parquet("file.parquet")

# Pickle (Python objects)
pickle.dump(obj, open("file.pkl", "wb"))
obj = pickle.load(open("file.pkl", "rb"))

# Java comparison
# Path("a") / "b"         → Paths.get("a", "b")
# path.mkdir()             → Files.createDirectories()
# json.load(f)             → objectMapper.readValue(file, Map.class)
# json.dump(obj, f)        → objectMapper.writeValue(file, obj)
# csv.DictReader           → OpenCSV CSVReader with headers
# pickle.dump/load         → ObjectOutputStream / ObjectInputStream
```
