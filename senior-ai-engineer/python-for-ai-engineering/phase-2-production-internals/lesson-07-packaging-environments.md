# Python for AI Engineering — Phase 2
# Lesson 7: Packaging + Environments

---

## 1. Intuition (Java Anchor)

Java: Maven/Gradle manage dependencies. `pom.xml` / `build.gradle` declare them. `mvn install` resolves them. `target/` holds compiled artifacts.

Python: `pip` installs packages. `requirements.txt` or `pyproject.toml` declares them. Virtual environments isolate them per project. No compilation — Python runs source directly.

| Java | Python |
|---|---|
| Maven / Gradle | pip + venv (standard) / uv (fast, modern) |
| `pom.xml` / `build.gradle` | `requirements.txt` / `pyproject.toml` |
| `~/.m2/repository` | `~/.cache/pip` (global cache) |
| `target/` | `venv/` (project-local packages) |
| `mvn install` | `pip install -r requirements.txt` |
| `mvn dependency:tree` | `pip show <package>` / `pipdeptree` |
| Classpath isolation per project | Virtual environment per project |

---

## 2. Virtual Environments — Why They Exist

```bash
# Java: Maven isolates dependencies per project in pom.xml scopes
# Python: system Python is shared — without venv, pip install pollutes globally

# Problem without venv:
# Project A needs: langchain==0.1.0
# Project B needs: langchain==0.2.0
# → conflict on system Python — only one version can be installed globally

# Solution: virtual environment — an isolated Python + packages per project
# Equivalent to Java's project-local Maven repository scope

# Create venv (standard library — no install needed):
python3 -m venv venv          # creates venv/ folder in project root

# Activate (macOS/Linux):
source venv/bin/activate

# Activate (Windows):
venv\Scripts\activate

# Now pip installs into venv/, not system Python:
pip install langchain fastapi pydantic

# Deactivate:
deactivate

# Check you're in the right venv:
which python       # should show: /your/project/venv/bin/python
python --version   # confirm version
```

---

## 3. `requirements.txt` (Java: `pom.xml` dependencies)

```txt
# requirements.txt — list one package per line
# Java: <dependency><groupId>...</groupId>...</dependency>

fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
pydantic-settings==2.2.1
langchain==0.1.20
langchain-openai==0.1.7
openai==1.30.1
httpx==0.27.0
python-dotenv==1.0.1
PyJWT==2.8.0
redis==5.0.4
aiosqlite==0.20.0
```

```bash
# Install all from requirements.txt (Java: mvn install):
pip install -r requirements.txt

# Freeze current environment to requirements.txt (capture exact versions):
pip freeze > requirements.txt
# Java equivalent: mvn dependency:list > deps.txt (not standard — pip freeze is)

# Install single package:
pip install langchain

# Install specific version (Java: <version>0.1.20</version>):
pip install langchain==0.1.20

# Install with extras (Java: classifier/optional deps):
pip install uvicorn[standard]   # installs uvicorn + websockets + httptools
pip install langchain[openai]   # installs langchain + openai integration

# Upgrade a package:
pip install --upgrade langchain

# Uninstall:
pip uninstall langchain
```

---

## 4. `pyproject.toml` — Modern Standard (Java: `pom.xml` equivalent)

```toml
# pyproject.toml — replaces setup.py, requirements.txt for publishable packages
# Java: pom.xml — but Python's is simpler

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "bench-resource-optimizer"
version = "1.0.0"
description = "Enterprise AI bench resource optimizer"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.29.0",
    "pydantic>=2.7.1",
    "langchain>=0.1.20",
    "openai>=1.30.1",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "httpx>=0.27.0",    # for TestClient
]

# Java: <scope>test</scope> dependencies
# Python: optional-dependencies group "dev"
```

---

## 5. `uv` — Modern Fast Package Manager (Know for Interviews)

```bash
# uv = Rust-based pip + venv replacement — 10-100x faster than pip
# Created by Astral (same team as ruff linter)
# Growing fast in AI engineering teams — replaces pip + venv

# Install uv (one-time):
pip install uv     # or: curl -LsSf https://astral.sh/uv/install.sh | sh

# Create venv + install deps in one command (Java: mvn install):
uv sync                           # reads pyproject.toml or requirements.txt

# Add a package (Java: add <dependency> to pom.xml + mvn install):
uv add langchain

# Remove a package:
uv remove langchain

# Run a script in the venv:
uv run python main.py
uv run pytest

# Install from requirements.txt:
uv pip install -r requirements.txt

# Create lockfile (like Maven's locked dependency tree):
uv lock       # creates uv.lock — exact pinned versions for reproducibility

# Why uv matters in AI: ML/AI packages are huge (torch, transformers = GBs)
# pip install torch = several minutes
# uv pip install torch = seconds (parallel downloads + Rust resolver)
```

---

## 6. Dependency Management Best Practices

```bash
# AI engineering project structure for deps:

requirements.txt          # production dependencies (pinned versions)
requirements-dev.txt      # dev/test only dependencies

# requirements-dev.txt:
# -r requirements.txt     # includes production deps
# pytest==8.2.0
# pytest-asyncio==0.23.6
# httpx==0.27.0           # for FastAPI TestClient

# Pin versions in production (Java: explicit <version> tags):
# GOOD:
fastapi==0.111.0          # exact pin — reproducible builds
langchain==0.1.20

# ACCEPTABLE:
fastapi>=0.111.0,<0.112   # compatible range
langchain~=0.1.20         # ~= means >=0.1.20, <0.2.0

# BAD in production (Java: no <version> tag):
langchain                 # latest — breaks when new version releases

# Check for security vulnerabilities (Java: mvn dependency-check:check):
pip install safety
safety check -r requirements.txt
```

---

## 7. Project Structure Convention

```
my-ai-service/
├── venv/                    # gitignored — like Java target/
├── src/                     # source code
│   ├── main.py
│   ├── agents/
│   ├── services/
│   └── utils/
├── tests/                   # pytest tests
├── requirements.txt         # production deps
├── requirements-dev.txt     # dev/test deps
├── pyproject.toml           # project metadata (optional)
├── .env                     # gitignored — local secrets
├── .env.example             # committed — shows required vars without values
├── .gitignore               # includes: venv/, .env, __pycache__, *.pyc
└── Dockerfile

# .gitignore for Python projects:
# venv/
# __pycache__/
# *.pyc
# *.pyo
# .env
# .env.*
# !.env.example
# *.egg-info/
# dist/
# .pytest_cache/
# .mypy_cache/
```

---

## 8. Running Tools in the Right Environment

```bash
# Always run pytest, uvicorn, python inside the activated venv:

# Activate first:
source venv/bin/activate

# Then run:
pytest tests/ -v
uvicorn main:app --reload --port 8000
python -m pytest tests/

# Or use direct path (no activation needed):
venv/bin/pytest tests/ -v
venv/bin/uvicorn main:app --reload
venv/bin/python -c "from auth.jwt_handler import JWT_SECRET; print(JWT_SECRET)"

# In Docker: don't use venv — install directly to system Python:
# Dockerfile:
# RUN pip install --no-cache-dir -r requirements.txt
# Docker containers are already isolated — venv is redundant inside container
```

---

## 9. Interview Anchor

**"How do you manage Python dependencies in a production AI service compared to Maven in Java?"**

Say:
> "Same discipline, different tooling. I use `requirements.txt` with exact pinned versions — same principle as explicit `<version>` tags in pom.xml. Pinning prevents the classic 'works on my machine' problem when a transitive dependency updates. For isolation I use virtual environments — one venv per project, equivalent to Maven's per-project classpath. In newer projects I use `uv` instead of pip — it's 10-100x faster because it's Rust-based, which matters when you're installing torch or transformers. For CI/CD I install deps with `uv pip install -r requirements.txt` or `pip install -r requirements.txt` — same as `mvn install` in your pipeline. Secrets and config never go in `requirements.txt` — those are env vars."

---

## 10. Quick Reference

```bash
# Create and activate venv
python3 -m venv venv
source venv/bin/activate      # Linux/Mac
venv\Scripts\activate         # Windows

# Install
pip install package==1.0.0                    # exact version
pip install -r requirements.txt               # from file
pip install package[extra]                    # with extras

# Freeze current env to file
pip freeze > requirements.txt

# uv (modern, fast)
uv add langchain                              # add dep
uv sync                                       # install all deps
uv run pytest                                 # run in venv

# Check installed
pip list                                      # all packages
pip show langchain                            # one package details
pip check                                     # check for conflicts

# Java comparison
# pip install -r requirements.txt  → mvn install
# pip freeze                       → mvn dependency:list
# venv/                            → project-local classpath
# requirements.txt                 → pom.xml dependencies
# uv                               → Gradle (faster, modern alternative)
```
