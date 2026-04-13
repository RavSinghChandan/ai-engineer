from langchain_core.tools import tool
from datetime import datetime


@tool
def get_current_datetime(query: str = "") -> str:
    """Returns the current date and time.
    Use this when the user asks about today's date, current time, day of the week, or year.
    """
    now = datetime.now()
    return now.strftime("Current date and time: %A, %B %d, %Y at %H:%M:%S")
