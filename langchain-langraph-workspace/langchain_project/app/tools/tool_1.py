from langchain_core.tools import tool


@tool
def calculator(expression: str) -> str:
    """Evaluates a mathematical expression and returns the result.
    Input must be a valid math expression such as '2 + 2', '10 * 5', or '(3 + 4) / 2'.
    """
    allowed_chars = set("0123456789+-*/()., ")
    if not all(c in allowed_chars for c in expression):
        return "Error: expression contains invalid characters."
    try:
        result = eval(expression, {"__builtins__": {}, "abs": abs, "round": round})
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"
