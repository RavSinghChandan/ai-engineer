"""
Validates extracted runbook data before persistence.
Checks step ordering, dependency cycles, and data completeness.
"""
from graph.state import ExtractionState


def validate_agent(state: ExtractionState) -> ExtractionState:
    errors = []
    warnings = []

    steps = state.get("steps", [])

    if not steps:
        errors.append("No steps extracted")

    if not state.get("title"):
        errors.append("No title extracted")

    # Check step numbers are sequential
    step_numbers = [s["step_number"] for s in steps]
    if step_numbers != sorted(step_numbers):
        warnings.append("Steps are not in sequential order — will be sorted")
        state["steps"] = sorted(steps, key=lambda x: x["step_number"])

    # Check for dependency cycles (simple check)
    step_set = set(step_numbers)
    for step in steps:
        for dep in step.get("depends_on", []):
            if dep not in step_set:
                warnings.append(
                    f"Step {step['step_number']} depends on non-existent step {dep} — removing"
                )
                step["depends_on"] = [d for d in step["depends_on"] if d in step_set]
            if dep >= step["step_number"]:
                warnings.append(
                    f"Step {step['step_number']} depends on future step {dep} — removing"
                )
                step["depends_on"] = [d for d in step["depends_on"] if d < step["step_number"]]

    # Check commands are not empty strings
    for step in steps:
        step["commands"] = [c for c in step.get("commands", []) if c.strip()]

    if errors:
        state["extraction_error"] = "; ".join(errors)

    state["agent_log"] = state.get("agent_log", []) + [
        f"validate_agent: {len(errors)} errors, {len(warnings)} warnings"
    ]

    return state
