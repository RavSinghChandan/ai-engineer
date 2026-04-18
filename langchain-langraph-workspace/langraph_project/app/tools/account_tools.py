"""
Banking account tools exposed to the LangGraph agent via tool-calling.

In production these would call real core-banking APIs (Finacle, Temenos, etc.).
Here we use realistic mock data so the graph and tool dispatch work end-to-end
without an external dependency.
"""

import logging
from typing import List
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mock data store  (replace with real DB / API calls in production)
# ---------------------------------------------------------------------------

_ACCOUNTS = {
    "ACC-1001": {
        "account_id": "ACC-1001",
        "owner_name": "Alice Johnson",
        "account_type": "Checking",
        "status": "active",
        "balance": 12_450.75,
        "currency": "USD",
        "opened_date": "2019-03-15",
        "branch": "Downtown NYC",
    },
    "ACC-1002": {
        "account_id": "ACC-1002",
        "owner_name": "Bob Martinez",
        "account_type": "Savings",
        "status": "active",
        "balance": 58_230.00,
        "currency": "USD",
        "opened_date": "2021-07-01",
        "branch": "West LA",
    },
    "ACC-1003": {
        "account_id": "ACC-1003",
        "owner_name": "Carol Singh",
        "account_type": "Checking",
        "status": "frozen",
        "balance": 3_100.00,
        "currency": "USD",
        "opened_date": "2018-11-20",
        "branch": "Chicago Loop",
    },
}

_TRANSACTIONS = {
    "ACC-1001": [
        {"txn_id": "T001", "date": "2026-04-17", "description": "Grocery Store",     "amount": -120.50, "category": "debit",    "balance_after": 12_450.75},
        {"txn_id": "T002", "date": "2026-04-16", "description": "Salary Deposit",    "amount": 5_200.00,"category": "credit",   "balance_after": 12_571.25},
        {"txn_id": "T003", "date": "2026-04-15", "description": "Netflix",           "amount": -15.99,  "category": "debit",    "balance_after": 7_371.25},
        {"txn_id": "T004", "date": "2026-04-14", "description": "Transfer to ACC-1002","amount": -500.00,"category": "transfer","balance_after": 7_387.24},
        {"txn_id": "T005", "date": "2026-04-13", "description": "ATM Withdrawal",   "amount": -200.00, "category": "debit",    "balance_after": 7_887.24},
    ],
    "ACC-1002": [
        {"txn_id": "T010", "date": "2026-04-17", "description": "Interest Credit",   "amount": 58.23,   "category": "credit",  "balance_after": 58_230.00},
        {"txn_id": "T011", "date": "2026-04-14", "description": "Transfer from ACC-1001","amount": 500.00,"category": "transfer","balance_after": 58_171.77},
        {"txn_id": "T012", "date": "2026-04-10", "description": "Insurance Premium", "amount": -350.00, "category": "debit",   "balance_after": 57_671.77},
    ],
    "ACC-1003": [
        {"txn_id": "T020", "date": "2026-04-01", "description": "Suspicious Debit",  "amount": -2_000.00,"category": "debit",  "balance_after": 3_100.00},
        {"txn_id": "T021", "date": "2026-03-28", "description": "Utility Bill",      "amount": -180.00, "category": "debit",   "balance_after": 5_100.00},
    ],
}


# ---------------------------------------------------------------------------
# Tool definitions — decorated with @tool so LangChain binds them to the LLM
# ---------------------------------------------------------------------------

@tool
def get_account_details(account_id: str) -> dict:
    """
    Retrieve full details for a bank account including owner name, type,
    status, current balance, and branch information.

    Args:
        account_id: The unique account identifier (e.g. ACC-1001)

    Returns:
        Account details dict, or an error dict if not found.
    """
    logger.info("Tool: get_account_details called | account_id=%s", account_id)
    account = _ACCOUNTS.get(account_id.upper())
    if not account:
        return {"error": f"Account {account_id} not found"}
    return account


@tool
def get_transactions(account_id: str, limit: int = 5) -> List[dict]:
    """
    Retrieve recent transactions for a bank account.

    Args:
        account_id: The unique account identifier (e.g. ACC-1001)
        limit: Maximum number of recent transactions to return (default 5)

    Returns:
        List of transaction dicts sorted most-recent first.
    """
    logger.info("Tool: get_transactions called | account_id=%s limit=%d", account_id, limit)
    txns = _TRANSACTIONS.get(account_id.upper(), [])
    if not txns:
        return [{"error": f"No transactions found for account {account_id}"}]
    return txns[:limit]


# Exported list for agent tool binding
ACCOUNT_TOOLS = [get_account_details, get_transactions]
