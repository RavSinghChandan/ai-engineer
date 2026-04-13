# 🚀 Project: AI LangChain Service (Enterprise Ready)

## 🧠 Objective

Build a production-ready AI service using LangChain that demonstrates real-world enterprise patterns like prompt chaining, memory, RAG, and tool usage.

---

## ⚙️ Tech Stack

- Python 3.x
- LangChain
- OpenAI API
- FastAPI
- Python-dotenv

---

## 📁 Project Structure

```
project-name/
│
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── services/
│   │   └── llm_service.py  # LangChain logic
│   ├── routes/
│   │   └── api.py          # API endpoints
│
├── data/                   # PDFs / input data (for RAG)
├── .env
├── requirements.txt
├── README.md
```

---

## ▶️ How to Run

### Step 1: Setup

```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Add API Key

```
OPENAI_API_KEY=your_key
```

### Step 3: Run

```
uvicorn app.main:app --reload
```