from langgraph.graph import StateGraph, END
from graph.state import CampaignState
from graph.nodes.audience_node import audience_node
from graph.nodes.ad_copy_node import ad_copy_node
from graph.nodes.budget_node import budget_node
from graph.nodes.campaign_node import campaign_node
from graph.nodes.performance_node import performance_node


def build_campaign_graph():
    """
    Sequential pipeline:
      audience → ad_copy → budget → campaign → performance → END
    """
    g = StateGraph(CampaignState)

    g.add_node("audience",    audience_node)
    g.add_node("ad_copy",     ad_copy_node)
    g.add_node("budget",      budget_node)
    g.add_node("campaign",    campaign_node)
    g.add_node("performance", performance_node)

    g.set_entry_point("audience")
    g.add_edge("audience",    "ad_copy")
    g.add_edge("ad_copy",     "budget")
    g.add_edge("budget",      "campaign")
    g.add_edge("campaign",    "performance")
    g.add_edge("performance", END)

    return g.compile()


# Singleton
campaign_graph = build_campaign_graph()
