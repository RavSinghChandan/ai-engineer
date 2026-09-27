"""p01 — All three primitives against one state.

Run live by setting TYPESAFE_API_KEY; otherwise the offline fake is used so
the project is runnable without waitlist access.
"""
import os

try:
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise ImportError("no key")
    from typesafe_sdk import Choice, Noul, Score, TypeSafeClient
    LIVE = True
except ImportError:
    from fake_typesafe import Choice, Noul, Score
    from fake_typesafe import FakeTypeSafeClient as TypeSafeClient
    LIVE = False


TRIAGE = {
    "team": Choice(
        instructions="Which team owns this ticket?",
        criteria={
            "billing": "Payments, invoices, charges, refunds. Not failures "
                       "caused by an outage.",
            "technical": "Bugs, outages, errors, integrations, api, checkout, "
                         "including payment failures caused by system problems.",
            "sales": "Pricing, plans, demos, upgrades.",
            "other": "Anything not covered above.",
        },
    ),
    "severity": Score(
        instructions="How severe is the customer impact?",
        criteria=[
            "Low little or no impact.",
            "Moderate some users affected business continues.",
            "High major functionality unavailable.",
            "Critical severe production disruption losing transactions.",
        ],
    ),
    "wants_refund": Noul(
        instructions="The customer is explicitly asking for a refund"
    ),
}


def judge(ticket: str, client=None):
    own = client is None
    client = client or TypeSafeClient()
    try:
        return client.system_one(state={"ticket": ticket}, questions=TRIAGE)
    finally:
        if own and hasattr(client, "close"):
            client.close()


if __name__ == "__main__":
    r = judge(
        "Production API returns 500 errors since this morning. Customers "
        "cannot complete checkout. We are losing transactions."
    )
    a = r.answers
    print(f"live={LIVE} model={r.model}")
    print(f"team         {a['team'].choice}  conf={a['team'].confidence:.2f}")
    print(f"severity     {a['severity'].score:.2f}")
    print(f"wants_refund {a['wants_refund'].noul:.2f}")
