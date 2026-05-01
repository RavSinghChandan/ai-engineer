
# Bias vs Variance vs Overfitting vs Underfitting

---

## 1. Intuition

Bias and variance explain how well a model learns from data.

- Bias = Model is too simple → cannot learn patterns  
- Variance = Model is too complex → learns noise also  

Simple idea:
- Underfitting = Not learning enough  
- Overfitting = Learning too much (including noise)  

---

## 2. Core Concept

- Bias:
  Error due to wrong assumptions in model  
  Example: Using linear model for complex data  

- Variance:
  Error due to model sensitivity to training data  
  Model changes a lot with small data changes  

- Underfitting:
  High bias, low variance  
  Model performs poorly on both train and test data  

- Overfitting:
  Low bias, high variance  
  Model performs well on training but poorly on test  

---

## 3. Why / When to Use

- If model is too simple → underfitting  
- If model is too complex → overfitting  

Goal:
Find balance between bias and variance  

In real systems:
- Underfitting → useless model  
- Overfitting → unreliable model  

---

## 4. How It Works (Pipeline)

1. Train model on training data  
2. Evaluate on training data  
3. Evaluate on validation/test data  

Observe:

- High train error + high test error → Underfitting  
- Low train error + high test error → Overfitting  
- Low train error + low test error → Good model  

---

## 5. Code Skeleton

```python
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error

model = LinearRegression()

# Train
model.fit(X_train, y_train)

# Predictions
train_pred = model.predict(X_train)
test_pred = model.predict(X_test)

# Errors
train_error = mean_squared_error(y_train, train_pred)
test_error = mean_squared_error(y_test, test_pred)

print("Train Error:", train_error)
print("Test Error:", test_error)
````

---

## 6. Example (Real System)

* Underfitting:
  Simple model predicting house prices → ignores important features

* Overfitting:
  Model memorizes training data → fails on new data

* LLM Example:
  Overfitting happens during fine-tuning when model memorizes dataset

---

## 7. Trade-offs

High Bias:

* Simple model

- Poor performance

High Variance:

* Fits training data well

- Poor generalization

Balanced Model:

* Good performance

- Requires tuning

---

## 8. Interview Questions

* What is bias vs variance?
* What is overfitting?
* How to detect overfitting?
* How to reduce overfitting?

---

## 9. Answer Framework

Start:
“Bias and variance are two types of errors”

Then:
“High bias leads to underfitting, high variance leads to overfitting”

Then:
“Overfitting means model performs well on training but poorly on test”

Then:
“We balance both using regularization and proper validation”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: How to detect overfitting?

Answer:
Compare training and test performance
If training is good but test is poor → overfitting

---

Q2: How to reduce overfitting?

Answer:

* Use more data
* Apply regularization
* Use simpler model
* Use dropout (in deep learning)
* Cross-validation

---

Q3: How to reduce underfitting?

Answer:

* Use more complex model
* Add more features
* Train longer
* Reduce regularization

---

Q4: What is regularization?

Answer:
Technique to prevent overfitting by adding penalty to model complexity
Examples: L1, L2 regularization

---

Q5: How does this relate to LLMs?

Answer:
LLMs can overfit during fine-tuning if dataset is small
This leads to memorization instead of generalization
So techniques like prompt engineering and RAG are preferred

---

```
```
