"""
Custom Tools Example
Copy this file, rename it, add your own tools, then point config at it:

    tools:
      custom_tools:
        enabled: true
        module_path: "./tools/my_tools.py"

The agent will automatically use these tools when relevant.
"""
from langchain_core.tools import tool


@tool
def get_product_info(product_name: str) -> str:
    """Get detailed information about a specific product or feature by name."""
    # Replace with your actual product database / API call
    products = {
        "pro plan": "Pro Plan: $9/user/month. Unlimited projects, tasks, storage. Priority support. Cancel anytime.",
        "free plan": "Free Plan: 1 user, 10 projects, 100 tasks. Community support.",
        "enterprise": "Enterprise: Custom pricing. SSO, audit logs, dedicated support. Contact sales@myapp.com.",
    }
    key = product_name.lower()
    return products.get(key, f"No information found for '{product_name}'.")


@tool
def check_service_status() -> str:
    """Check the current operational status of the service."""
    # Replace with a real status page API call
    return "All systems operational. Last incident: None. Uptime (30d): 99.98%."


@tool
def escalate_to_human(reason: str, user_message: str) -> str:
    """
    Escalate a conversation to a human support agent when the user needs
    help that the AI cannot provide. Use when the user is frustrated,
    when the issue requires account access, or for billing disputes.
    """
    # In production: create a support ticket, send to Zendesk, etc.
    ticket_id = "TKT-" + str(hash(user_message) % 100000)
    return (
        f"I've escalated your request to our support team. "
        f"Your ticket ID is {ticket_id}. "
        f"A human agent will reach you within 24 hours at your registered email."
    )


# IMPORTANT: This list must be named TOOLS — the loader looks for it
TOOLS = [get_product_info, check_service_status, escalate_to_human]
