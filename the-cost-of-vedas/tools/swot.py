"""SWOT diagrams for each dimension.

Print-safe: no colour is load-bearing, every quadrant is labelled, and the
palette survives Kindle's greyscale rendering on e-ink devices.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

INK = "#1A1A1A"
PAPER = "#FFFFFF"
MUTED = "#6B6B6B"

# Deliberately muted: this renders to greyscale on most Kindles.
S_COL = "#2F5D50"   # strengths   — deep green
W_COL = "#7A3B3B"   # weaknesses  — deep red
O_COL = "#2E4A6B"   # opportunities — deep blue
T_COL = "#6B4E2E"   # threats     — deep brown


def swot(title, strengths, weaknesses, opportunities, threats, out):
    f, a = plt.subplots(figsize=(8.5, 9.5), dpi=200)
    f.patch.set_facecolor(PAPER)
    a.set_facecolor(PAPER)
    a.axis("off")
    a.set_xlim(0, 10)
    a.set_ylim(0, 11)

    a.text(5, 10.55, title.upper(), ha="center", color=INK,
           fontsize=13, fontweight="bold")
    a.text(5, 10.15, "SWOT", ha="center", color=MUTED, fontsize=9.5)

    quads = [
        ("STRENGTHS", strengths, S_COL, 0.3, 5.3),
        ("WEAKNESSES", weaknesses, W_COL, 5.1, 5.3),
        ("OPPORTUNITIES", opportunities, O_COL, 0.3, 0.4),
        ("THREATS", threats, T_COL, 5.1, 0.4),
    ]
    for label, items, col, x, y in quads:
        a.add_patch(FancyBboxPatch((x, y), 4.6, 4.6,
                                   boxstyle="round,pad=0.08",
                                   ec=col, fc=PAPER, lw=1.8))
        a.add_patch(FancyBboxPatch((x, y + 4.0), 4.6, 0.6,
                                   boxstyle="round,pad=0.08",
                                   ec=col, fc=col, lw=0))
        a.text(x + 2.3, y + 4.28, label, ha="center", va="center",
               color=PAPER, fontsize=10.5, fontweight="bold")
        ty = y + 3.65
        for item in items[:4]:
            wrapped = _wrap(item, 42)
            a.text(x + 0.22, ty, "·", color=col, fontsize=11, fontweight="bold")
            a.text(x + 0.52, ty, wrapped, ha="left", va="top",
                   color=INK, fontsize=8.8, linespacing=1.5)
            ty -= 0.42 + 0.30 * wrapped.count("\n")

    plt.tight_layout()
    f.savefig(out, facecolor=PAPER, bbox_inches="tight", pad_inches=0.3)
    plt.close(f)
    print("  saved", out)


def _wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= width:
            cur = f"{cur} {w}".strip()
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return "\n".join(lines)
