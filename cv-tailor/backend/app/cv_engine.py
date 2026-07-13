"""CV tailoring engine.

Design guarantee: the LaTeX *schema/format* is never modified. The LLM only
rewrites the *text* of a fixed set of fields (summary, skills line values,
experience bullets, project bullets). We parse those fields out of the base
.tex, send only their text to DeepSeek with the job description, get back
reworded text, and splice it into the identical structure. Result: an
ATS-optimized CV that is byte-identical in layout to the base.
"""
import json
import re
from dataclasses import dataclass, field

from app.config import BASE_CV

# --- LaTeX special-char escaping so LLM text can't break compilation ---
_ESCAPE = {
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


def latex_escape(text: str) -> str:
    # Backslash first, then the rest.
    text = text.replace("\\", r"\textbackslash{}")
    for ch, esc in _ESCAPE.items():
        text = text.replace(ch, esc)
    return text


@dataclass
class CVFields:
    """The editable text slots parsed out of the base .tex (structure stays put)."""

    summary_1: str
    summary_2: str
    skills: dict[str, str] = field(default_factory=dict)          # label -> values
    experience: dict[str, list[str]] = field(default_factory=dict)  # company -> bullets
    projects: dict[str, list[str]] = field(default_factory=dict)    # name -> bullets


class CVTemplate:
    """Loads the base .tex once and exposes parse/render around fixed anchors."""

    def __init__(self) -> None:
        self.raw = BASE_CV.read_text(encoding="utf-8")

    # ---- parse the editable text out of the fixed structure ----
    def parse(self) -> CVFields:
        raw = self.raw
        summaries = re.findall(r"\\noindent (.+?)\n\n", raw, re.DOTALL)
        summary_1 = summaries[0].strip() if summaries else ""
        summary_2 = summaries[1].strip() if len(summaries) > 1 else ""

        skills: dict[str, str] = {}
        for label, values in re.findall(r"\\textbf\{([^}]+)\} & (.+?) \\\\", raw):
            skills[label.strip()] = values.strip()

        experience = self._parse_bullets(raw, "jobitems")
        projects = self._parse_project_bullets(raw)
        return CVFields(summary_1, summary_2, skills, experience, projects)

    def _parse_bullets(self, raw: str, env: str) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        # each experience block: \jobheading{Company}... \begin{jobitems} ... \end{jobitems}
        pattern = re.compile(
            r"\\jobheading\{([^}]+)\}\{[^}]*\}\{[^}]*\}\{[^}]*\}\s*\n\s*"
            r"\\begin\{" + env + r"\}(.*?)\\end\{" + env + r"\}",
            re.DOTALL,
        )
        for company, body in pattern.findall(raw):
            bullets = re.findall(r"\\resumeitem\{(.+?)\}\n", body)
            out[company.strip()] = [b.strip() for b in bullets]
        return out

    def _parse_project_bullets(self, raw: str) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        pattern = re.compile(
            r"\\textbf\{([^}]+)\} \\textemdash\{\}.*?"
            r"\\begin\{projectitems\}(.*?)\\end\{projectitems\}",
            re.DOTALL,
        )
        for name, body in pattern.findall(raw):
            bullets = re.findall(r"\\resumeitem\{(.+?)\}\n", body)
            out[name.strip()] = [b.strip() for b in bullets]
        return out

    # ---- render new text back into the identical structure ----
    def render(self, fields: CVFields) -> str:
        raw = self.raw
        base = self.parse()

        # summaries (replace exact original text -> new text, escaped)
        if base.summary_1 and fields.summary_1:
            raw = raw.replace(base.summary_1, latex_escape_preserve(fields.summary_1), 1)
        if base.summary_2 and fields.summary_2:
            raw = raw.replace(base.summary_2, latex_escape_preserve(fields.summary_2), 1)

        # skills values
        for label, new_val in fields.skills.items():
            old_val = base.skills.get(label)
            if old_val and new_val and old_val != new_val:
                raw = raw.replace(
                    f"\\textbf{{{label}}} & {old_val} \\\\",
                    f"\\textbf{{{label}}} & {latex_escape_preserve(new_val)} \\\\",
                    1,
                )

        # experience + project bullets (swap each old bullet text -> new)
        raw = self._swap_bullets(raw, base.experience, fields.experience)
        raw = self._swap_bullets(raw, base.projects, fields.projects)
        return raw

    @staticmethod
    def _swap_bullets(raw: str, base_map: dict[str, list[str]], new_map: dict[str, list[str]]) -> str:
        for key, new_bullets in new_map.items():
            old_bullets = base_map.get(key, [])
            for old, new in zip(old_bullets, new_bullets):
                if old and new and old != new:
                    raw = raw.replace(
                        f"\\resumeitem{{{old}}}",
                        f"\\resumeitem{{{latex_escape_preserve(new)}}}",
                        1,
                    )
        return raw


def latex_escape_preserve(text: str) -> str:
    """Escape user/LLM text but preserve intentional \\textbf{...} and % from the base.

    The base CV already contains \\textbf and escaped %, and we ask the LLM to keep
    those markers, so we only escape genuinely dangerous bare specials while leaving
    existing LaTeX commands intact.
    """
    # Protect existing \textbf{...} spans and already-escaped percent.
    protected: list[str] = []

    def _stash(m: re.Match) -> str:
        protected.append(m.group(0))
        return f"\x00{len(protected) - 1}\x00"

    text = re.sub(r"\\textbf\{[^}]*\}", _stash, text)
    text = text.replace(r"\%", "\x01")  # keep pre-escaped percent
    # escape bare specials
    for ch, esc in (("&", r"\&"), ("%", r"\%"), ("#", r"\#"), ("_", r"\_"), ("$", r"\$")):
        text = text.replace(ch, esc)
    text = text.replace("\x01", r"\%")
    # restore protected spans
    text = re.sub(r"\x00(\d+)\x00", lambda m: protected[int(m.group(1))], text)
    return text
