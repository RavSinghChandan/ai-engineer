
# Module 4 — Agentic AI Systems  
# Topic: Tool Usage in Agents (Function Calling)

---

## 1. Intuition

Tool usage means agents can call external tools (APIs, functions) to perform real actions.

Simple idea:
- LLM thinks → Tool executes  

Example:
- LLM decides to calculate → calls calculator  
- LLM decides to search → calls search API  

---

## 2. Core Concept

- LLM alone → only generates text  
- With tools → can perform actions  

Tool usage involves:
- Defining tools  
- Letting LLM choose tool  
- Executing tool  
- Returning result to LLM  

This is also called **function calling**  

---

## 3. Why / When to Use

- When real-world actions are needed  
- When LLM knowledge is insufficient  
- When accuracy is required  

Examples:
- Fetch real-time data  
- Perform calculations  
- Call APIs  

---

## 4. How It Works (Pipeline)

1. User input  
2. LLM understands intent  
3. LLM decides tool to use  
4. Tool is executed  
5. Result returned to LLM  
6. LLM generates final response  

---

## 5. Code Skeleton

### Define Tool
```python
def calculator(a, b):
    return a + b
````

### Agent Using Tool

```python id="t7w2kp"
while True:
    action = llm.decide(user_input)

    if action == "calculate":
        result = calculator(2, 3)
    
    else:
        result = llm.generate(user_input)
    
    break
```

### Function Calling (Conceptual)

```python id="d4m9xs"
tools = [
    {
        "name": "calculator",
        "description": "Adds two numbers"
    }
]

response = llm.call_with_tools(user_input, tools)
```

---

## 6. Example (Real System)

* Chatbot:
  Calls weather API for real-time data

* Finance system:
  Calls calculator for tax computation

* Your system:
  Agents call different logic modules for reasoning

---

## 7. Trade-offs

With Tools:

* Accurate
* Real-world capability

- More complexity

Without Tools:

* Simple

- Limited capability

---

## 8. Interview Questions

* What is tool usage in agents?
* What is function calling?
* Why are tools important?

---

## 9. Answer Framework

Start:
“Tool usage allows LLM to perform real-world actions”

Then:
“LLM decides which tool to use”

Then:
“Tool executes and result is sent back”

Then:
“This improves accuracy and capability”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why can't LLM do everything without tools?

Answer:
LLM only generates text.
It cannot access real-time data or perform actual operations like API calls or calculations.

---

Q2: What is function calling?

Answer:
It is a way where LLM selects and triggers predefined functions/tools based on user input.

---

Q3: How does tool selection happen?

Answer:
LLM analyzes the query and matches it with tool descriptions to decide which tool to call.

---

Q4: What are risks of tool usage?

Answer:

* Wrong tool selection
* Incorrect inputs
* Security risks

---

Q5: How do you make tool usage reliable?

Answer:

* Clear tool definitions
* Input validation
* Error handling
* Logging and monitoring

---

```
```
