# Python for AI Engineering — Phase 3
# Lesson 2: Pandas

---

## 1. Intuition (Java Anchor)

Java has no standard in-memory tabular data library. The closest is a `List<Map<String, Object>>` or a JDBC `ResultSet`.
Pandas `DataFrame` is a named, typed, in-memory table — like a SQL table or Excel spreadsheet, but programmable.

As an AI engineer you use Pandas for:
- Loading and cleaning training/evaluation datasets
- Preprocessing CV data, role data, metrics logs
- Analyzing RAGAS evaluation results
- Exporting reports

| Concept | Java (closest) | Pandas |
|---|---|---|
| Table | `List<Map<String,Object>>` | `DataFrame` |
| Column | field across all rows | `Series` |
| Row | `Map<String, Object>` | row of DataFrame |
| Filter rows | `stream().filter()` | `df[condition]` |
| Select columns | `stream().map(m -> m.get("col"))` | `df["col"]` |
| Group by | `Collectors.groupingBy` | `df.groupby()` |
| Join | SQL JOIN logic | `df.merge()` |
| SQL query | JDBC | `df.query()` |

---

## 2. Creating a DataFrame

```python
import pandas as pd

# From list of dicts — most common in AI engineering:
data = [
    {"name": "Ravi",  "role": "Python Dev", "match": 85, "skills": ["Python", "FastAPI"]},
    {"name": "Priya", "role": "DevOps",     "match": 72, "skills": ["Docker", "K8s"]},
    {"name": "Amit",  "role": "Python Dev", "match": 91, "skills": ["Python", "Django"]},
]
df = pd.DataFrame(data)
print(df)
#     name        role  match                 skills
# 0   Ravi  Python Dev     85    [Python, FastAPI]
# 1  Priya      DevOps     72      [Docker, K8s]
# 2   Amit  Python Dev     91   [Python, Django]

# From CSV (most common for datasets):
df = pd.read_csv("cv_data.csv")

# From JSON:
df = pd.read_json("roles.json")

# Basic info (Java: System.out.println equivalent):
df.shape        # (3, 4) — rows, columns
df.columns      # Index(['name', 'role', 'match', 'skills'])
df.dtypes       # column types
df.head(5)      # first 5 rows — like SQL SELECT ... LIMIT 5
df.tail(5)      # last 5 rows
df.info()       # column names, dtypes, non-null counts
df.describe()   # stats: mean, std, min, max for numeric columns
```

---

## 3. Selecting Data

```python
# Select a column → returns Series (like a typed List):
# Java: data.stream().map(m -> m.get("name")).collect(toList())
df["name"]             # Series: ["Ravi", "Priya", "Amit"]
df["match"]            # Series: [85, 72, 91]

# Select multiple columns → returns DataFrame:
df[["name", "match"]]  # sub-table with only 2 columns

# Select a row by index:
df.iloc[0]             # first row — like Java list.get(0)
df.iloc[0:2]           # rows 0 and 1 — like subList
df.loc[0]              # by label index (same as iloc if default int index)

# Select by named index (after setting one):
df = df.set_index("name")
df.loc["Ravi"]         # row where name == "Ravi"
```

---

## 4. Filtering Rows (Java: `stream().filter()`)

```python
# Java: data.stream().filter(m -> (int)m.get("match") >= 80).collect(toList())

# Python — condition creates a boolean Series, then filters:
high_match = df[df["match"] >= 80]
# name=Ravi (85), name=Amit (91) — Priya (72) excluded

# Multiple conditions:
# Java: .filter(m -> match>=80 && role.equals("Python Dev"))
python_high = df[(df["match"] >= 80) & (df["role"] == "Python Dev")]
# & for AND,  | for OR,  ~ for NOT  (not 'and'/'or'/'not' — those don't work here)

# .query() — SQL-like syntax (sometimes cleaner):
df.query("match >= 80 and role == 'Python Dev'")

# isin — Java: Arrays.asList().contains()
df[df["role"].isin(["Python Dev", "DevOps"])]

# notna / isna — null checks:
df[df["email"].notna()]       # rows where email is not null
df[df["email"].isna()]        # rows where email IS null
```

---

## 5. Adding and Transforming Columns

```python
# Add new column:
df["seniority"] = df["match"].apply(
    lambda score: "senior" if score >= 85 else "junior"
)
# Java: data.forEach(m -> m.put("seniority", score >= 85 ? "senior" : "junior"))

# Apply a function to each element:
df["name_upper"] = df["name"].str.upper()         # string method
df["match_norm"] = df["match"] / 100.0            # arithmetic
df["gap_score"]  = 100 - df["match"]              # derived column

# Apply complex function:
def categorize(row) -> str:
    if row["match"] >= 85 and row["role"] == "Python Dev":
        return "top_candidate"
    elif row["match"] >= 70:
        return "good_candidate"
    return "needs_training"

df["category"] = df.apply(categorize, axis=1)    # axis=1 = row-by-row

# Drop column:
df = df.drop(columns=["gap_score"])
```

---

## 6. Cleaning Data (Core AI Engineering Use Case)

```python
# Null handling:
df["email"].fillna("unknown@placeholder.com", inplace=True)   # fill nulls
df.dropna(subset=["name", "role"])                            # drop rows with null in these cols
df.dropna()                                                   # drop any row with any null

# Duplicates — like Java Set deduplication:
df.drop_duplicates(subset=["name"])                           # dedupe by name
df.drop_duplicates()                                          # all columns must match

# String cleaning — very common for CV text preprocessing:
df["name"] = df["name"].str.strip()               # trim whitespace
df["role"] = df["role"].str.lower()               # lowercase
df["role"] = df["role"].str.replace("-", " ")     # replace characters
df["skills"] = df["skills_raw"].str.split(",")    # split string to list

# Type casting:
df["match"] = df["match"].astype(float)           # string → float
df["date"]  = pd.to_datetime(df["date_str"])      # string → datetime

# Rename columns (Java: no built-in, manual reassignment):
df = df.rename(columns={"match": "match_score", "role": "target_role"})
```

---

## 7. GroupBy and Aggregation (Java: `Collectors.groupingBy`)

```python
# Java: data.stream().collect(Collectors.groupingBy(m -> m.get("role"),
#           Collectors.averagingInt(m -> (int)m.get("match"))))

# Python:
df.groupby("role")["match"].mean()
# role
# DevOps        72.0
# Python Dev    88.0

# Multiple aggregations:
df.groupby("role").agg(
    avg_match=("match", "mean"),
    count=("name", "count"),
    max_match=("match", "max"),
)

# Count by group:
df["role"].value_counts()
# Python Dev    2
# DevOps        1
```

---

## 8. Merge / Join (Java: SQL JOIN logic)

```python
# Two DataFrames — like Java joining two result sets:
profiles = pd.DataFrame([
    {"user_id": "r1", "name": "Ravi"},
    {"user_id": "r2", "name": "Priya"},
])
scores = pd.DataFrame([
    {"user_id": "r1", "readiness_score": 85},
    {"user_id": "r2", "readiness_score": 72},
    {"user_id": "r3", "readiness_score": 91},   # no matching profile
])

# Inner join (Java: INNER JOIN):
pd.merge(profiles, scores, on="user_id", how="inner")
# Only r1 and r2 — r3 excluded

# Left join (Java: LEFT JOIN — keep all profiles):
pd.merge(profiles, scores, on="user_id", how="left")
# r1, r2 with scores; no r3
```

---

## 9. Export and Save

```python
# Save to CSV:
df.to_csv("output.csv", index=False)     # index=False — don't write row numbers

# Save to JSON:
df.to_json("output.json", orient="records")   # list of dicts

# Save to Parquet (binary, compressed — best for large datasets):
df.to_parquet("output.parquet")          # requires pyarrow or fastparquet
df = pd.read_parquet("output.parquet")   # fast load back

# Display in Jupyter / log:
print(df.to_string())                    # full table as string
print(df.to_dict(orient="records"))      # list of dicts — pass to API
```

---

## 10. AI Engineering Patterns

```python
# Pattern 1: Load RAGAS evaluation results and analyze
import pandas as pd

def analyze_ragas_results(results: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(results)
    summary = df.agg({
        "faithfulness":     ["mean", "min"],
        "answer_relevancy": ["mean", "min"],
        "context_precision": "mean",
    })
    failed = df[df["faithfulness"] < 0.7]
    print(f"Failed faithfulness: {len(failed)}/{len(df)}")
    return summary

# Pattern 2: CV skill frequency analysis
def skill_frequency(cv_list: list[dict]) -> pd.DataFrame:
    all_skills = [skill for cv in cv_list for skill in cv.get("skills", [])]
    return (
        pd.Series(all_skills)
        .value_counts()
        .reset_index()
        .rename(columns={"index": "skill", 0: "count"})
        .head(20)
    )

# Pattern 3: Clean and validate uploaded CSV of job roles
def load_roles_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    df = df.dropna(subset=["role_name", "required_skills"])
    df["required_skills"] = df["required_skills"].str.split(",").apply(
        lambda skills: [s.strip() for s in skills]
    )
    return df
```

---

## 11. Interview Anchor

**"How do you use Pandas in an AI engineering workflow?"**

Say:
> "Three main uses. First, dataset preprocessing — loading CSVs of CV data or role definitions, cleaning nulls, normalizing strings, splitting skill lists. Second, evaluation analysis — RAGAS outputs a dict per query; I load them into a DataFrame and use `groupby` and `agg` to see which pipeline stages are underperforming. Third, metrics reporting — I aggregate token usage, latency, and cost logs into a DataFrame and export a summary CSV for stakeholders. The key thing from a Java developer's perspective: Pandas replaces what you'd do with JDBC ResultSets and Java stream operations, but the syntax is dramatically more concise — one `groupby().agg()` call replaces 20 lines of Java collector logic."

---

## 12. Quick Reference

```python
import pandas as pd

# Create
df = pd.DataFrame(list_of_dicts)
df = pd.read_csv("file.csv")

# Inspect
df.shape; df.columns; df.dtypes; df.head()

# Select
df["col"]                        # column (Series)
df[["col1", "col2"]]             # multiple columns
df.iloc[0]                       # row by position
df.loc[label]                    # row by label

# Filter (Java: stream.filter)
df[df["col"] > val]
df[(df["a"] > 1) & (df["b"] == "x")]
df[df["col"].isin(["a","b"])]

# Transform
df["new"] = df["old"].apply(fn)
df["str_col"].str.upper() / .strip() / .split(",")

# Clean
df.dropna(subset=["col"])
df.drop_duplicates(subset=["col"])
df["col"].fillna(value)

# Aggregate (Java: Collectors.groupingBy)
df.groupby("col")["num"].mean()
df["col"].value_counts()

# Merge (Java: SQL JOIN)
pd.merge(df1, df2, on="key", how="inner")

# Export
df.to_csv("out.csv", index=False)
df.to_dict(orient="records")     # → list of dicts
```
