
# Module 4 — Agentic AI Systems  
# Topic: Agent vs Workflow

---

## 1. Intuition

Workflow = fixed steps  
Agent = decides what steps to take  

Simple idea:
- Workflow → predefined pipeline  
- Agent → dynamic decision-making system  

---

## 2. Core Concept

Workflow:
- Static sequence of steps  
- No decision-making  
- Same execution every time  

Agent:
- Uses LLM to decide actions  
- Can choose tools  
- Can change flow dynamically  

Key Difference:
Workflow = control  
Agent = intelligence  

---

## 3. Why / When to Use

Use Workflow:
- When process is fixed  
- Predictable systems  

Use Agent:
- When decisions are dynamic  
- Complex reasoning required  

Examples:
- Workflow → ETL pipeline  
- Agent → AI assistant choosing tools  

---

## 4. How It Works (Pipeline)

### Workflow:
1. Step 1  
2. Step 2  
3. Step 3  
(Fixed execution)

### Agent:
1. Receive input  
2. Understand goal  
3. Decide next action  
4. Call tool / function  
5. Observe result  
6. Repeat until goal achieved  

---

## 5. Code Skeleton

### Workflow Example
```python
def workflow(input):
    step1 = process_data(input)
    step2 = analyze(step1)
    result = generate_output(step2)
    return result
````

### Agent Example

```python id="k8n2vs"
while not goal_achieved:
    action = llm.decide_next_step(context)
    
    if action == "search":
        result = search_tool(query)
    
    elif action == "calculate":
        result = calculator_tool(data)
    
    context.append(result)
```

---

## 6. Example (Real System)

* Workflow:
  Data pipeline → clean → store → process

* Agent:
  Chatbot decides:

    * Search docs
    * Call API
    * Generate response

* Your system:
  Multi-agent system for reasoning and decision making

---

## 7. Trade-offs

Workflow:

* Predictable
* Fast

- Not flexible

Agent:

* Flexible
* Intelligent

- Harder to control
- Higher cost

---

## 8. Interview Questions

* What is agent vs workflow?
* When to use agents?
* Why not use agents everywhere?

---

## 9. Answer Framework

Start:
“Workflow is a fixed pipeline, agent is dynamic decision system”

Then:
“Workflow follows predefined steps, agent decides actions”

Then:
“Agents are useful for complex tasks requiring reasoning”

Then:
“But they are harder to control and more expensive”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why not use agents everywhere?

Answer:
Agents are expensive, slower, and less predictable.
For simple tasks, workflows are better.

---

Q2: What makes an agent intelligent?

Answer:
Its ability to:

* Understand goal
* Decide next action
* Use tools
* Learn from previous steps

---

Q3: What are risks of agents?

Answer:

* Uncontrolled behavior
* Infinite loops
* High cost
* Incorrect decisions

---

Q4: How do you control agents?

Answer:

* Limit actions
* Define rules
* Add stopping conditions
* Use monitoring

---

Q5: Can workflow and agents be combined?

Answer:
Yes.
Often workflows handle structure and agents handle decision-making.
This gives both control and flexibility.

---

```
```
