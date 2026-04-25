import logging
import os
import tempfile
from typing import Dict, Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

log = logging.getLogger(__name__)


def generate_graph(analysis: Dict[str, Any]) -> str:
    x_values = analysis.get("x_values", [])
    y_values  = analysis.get("y_values", [])

    fig, ax = plt.subplots(figsize=(10, 5))
    x_numeric = list(range(len(x_values)))

    ax.plot(x_numeric, y_values, marker="o", linewidth=2.5, markersize=8, color="#1565C0")
    ax.fill_between(x_numeric, y_values, alpha=0.12, color="#1565C0")

    ax.set_title(analysis.get("title", "Report"), fontsize=15, fontweight="bold", pad=14)
    ax.set_xlabel(analysis.get("x_label", "X"), fontsize=12)
    ax.set_ylabel(analysis.get("y_label", "Y"), fontsize=12)
    ax.set_xticks(x_numeric)
    ax.set_xticklabels(
        [str(v) for v in x_values],
        rotation=45 if len(x_values) > 6 else 0,
        ha="right",
    )
    ax.grid(True, linestyle="--", alpha=0.45)
    ax.spines[["top", "right"]].set_visible(False)

    plt.tight_layout()

    path = os.path.join(tempfile.gettempdir(), "ai_report_graph.png")
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    log.info("Graph saved to %s", path)
    return path
