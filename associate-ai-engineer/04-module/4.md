
# Module 4 — Agentic AI Systems  
# Topic: Planning vs Execution Agents

---

## 1. Intuition

Planning agent decides what to do.  
Execution agent does the actual work.

Simple idea:
- Planner = Brain (strategy)  
- Executor = Worker (action)  

---

## 2. Core Concept

- Planning Agent:
  Breaks problem into steps  
  Decides sequence of actions  

- Execution Agent:
  Performs tasks based on plan  
  Calls tools / APIs  

Separation helps:
- Better control  
- Clear responsibilities  

---

## 3. Why / When to Use

- Complex multi-step tasks  
- When reasoning is required  
- When tasks depend on each other  

Examples:
- Research + report generation  
- Task automation pipelines  

---

## 4. How It Works (Pipeline)

1. User input  
2. Planning agent creates plan  
3. Plan divided into steps  
4. Execution agent performs each step  
5. Results collected  
6. Final output generated  

---

## 5. Code Skeleton

### Planning Agent
```python
def planner(user_input):
    return ["search info", "analyze data", "generate summary"]
````

### Execution Agent

```python id="p6v9mt"
def executor(step):
    if step == "search info":
        return search_tool()
    elif step == "analyze data":
        return analyze_tool()
    elif step == "generate summary":
        return llm.generate("summary")
```

### Combined Flow

```python id="f2k7zr"
plan = planner(user_input)

results = []
for step in plan:
    results.append(executor(step))
```

---

## 6. Example (Real System)

* Research assistant:
  Planner → decides steps
  Executor → fetches data and summarizes

* Your system:
  Planning agent defines workflow
  Execution agents perform tasks

---

## 7. Trade-offs

Separated Design:

* Better control
* Easier debugging

- More complexity

Single Agent:

* Simpler

- Less structured

---

## 8. Interview Questions

* What is planning vs execution agent?
* Why separate them?
* How do they interact?

---

## 9. Answer Framework

Start:
“Planning agent decides steps, execution agent performs them”

Then:
“This separation improves control and modularity”

Then:
“Used in complex multi-step AI systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why separate planning and execution?

Answer:
It improves clarity and control.
Planner focuses on strategy, executor focuses on actions.

---

Q2: What happens if planning is wrong?

Answer:
Execution will follow incorrect steps, leading to wrong results.
So planning quality is critical.

---

Q3: Can one agent do both?

Answer:
Yes, but it becomes harder to manage and debug.
Separation is better for complex systems.

---

Q4: How do you improve planning quality?

Answer:

* Better prompts
* Few-shot examples
* Validation steps

---

Q5: How do you handle execution failure?

Answer:

* Retry logic
* Error handling
* Fallback steps
* Logging and monitoring

---

```
```
