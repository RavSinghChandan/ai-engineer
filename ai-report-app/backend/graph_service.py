import os
import tempfile

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — must be set before pyplot import
import matplotlib.pyplot as plt


def generate_graph(analysis: dict) -> str:
    """Render a line graph from analysis data and save it as a PNG. Returns the file path."""
    x_values = analysis.get("x_values", [])
    y_values = analysis.get("y_values", [])

    fig, ax = plt.subplots(figsize=(10, 5))

    x_numeric = list(range(len(x_values)))
    ax.plot(x_numeric, y_values, marker="o", linewidth=2.5, markersize=8, color="#1565C0")
    ax.fill_between(x_numeric, y_values, alpha=0.15, color="#1565C0")

    ax.set_title(analysis.get("title", "Report"), fontsize=16, fontweight="bold", pad=16)
    ax.set_xlabel(analysis.get("x_label", "X"), fontsize=12)
    ax.set_ylabel(analysis.get("y_label", "Y"), fontsize=12)
    ax.set_xticks(x_numeric)
    ax.set_xticklabels(
        [str(v) for v in x_values], rotation=45 if len(x_values) > 6 else 0, ha="right"
    )
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.spines[["top", "right"]].set_visible(False)

    plt.tight_layout()

    graph_path = os.path.join(tempfile.gettempdir(), "ai_report_graph.png")
    plt.savefig(graph_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    return graph_path
