"""
Guardrails configuration — strict vs relaxed mode, per-node overrides, cost limits.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass
class NodeGuardrailConfig:
    strict_mode: bool = True          # if True, validation failures halt the pipeline
    max_retries: int = 2              # output-validation retry count before fallback
    timeout_seconds: float = 30.0     # per-node wall-clock limit (0 = no limit)
    max_state_keys: int = 200         # guard against state explosion
    allow_empty_output: bool = False  # if False, an empty dict output is rejected


@dataclass
class GuardrailsConfig:
    global_strict: bool = True
    default_node: NodeGuardrailConfig = field(default_factory=NodeGuardrailConfig)
    node_overrides: Dict[str, NodeGuardrailConfig] = field(default_factory=dict)

    def for_node(self, name: str) -> NodeGuardrailConfig:
        cfg = self.node_overrides.get(name, self.default_node)
        if not self.global_strict:
            # relaxed global mode softens every node
            return NodeGuardrailConfig(
                strict_mode=False,
                max_retries=cfg.max_retries,
                timeout_seconds=cfg.timeout_seconds,
                max_state_keys=cfg.max_state_keys,
                allow_empty_output=True,
            )
        return cfg


# Singleton — import and mutate in main.py / tests to switch modes
DEFAULT_CONFIG = GuardrailsConfig(
    global_strict=True,
    default_node=NodeGuardrailConfig(
        strict_mode=True,
        max_retries=2,
        timeout_seconds=30.0,
        max_state_keys=200,
        allow_empty_output=False,
    ),
    node_overrides={
        # Domain agents are forgiving — partial data is still useful
        "domain_agents": NodeGuardrailConfig(
            strict_mode=False,
            max_retries=1,
            timeout_seconds=60.0,
            allow_empty_output=False,
        ),
        # Admin review is the last gate — stricter
        "admin_review_agent": NodeGuardrailConfig(
            strict_mode=True,
            max_retries=2,
            timeout_seconds=15.0,
            allow_empty_output=False,
        ),
    },
)
