"""Dynamic tool registry — only loads tools that are enabled in config."""
import importlib
import logging
from datetime import datetime, timezone
from typing import Optional

from langchain_core.tools import BaseTool, tool

from .config_loader import ToolsConfig

logger = logging.getLogger(__name__)


@tool
def calculator(expression: str) -> str:
    """Evaluate a safe mathematical expression. Input must be a valid math expression like '2 + 2' or '10 * (3 + 4)'."""
    import ast
    import operator

    allowed_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
    }

    def _eval(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in allowed_ops:
                raise ValueError(f"Unsupported operator: {op_type}")
            return allowed_ops[op_type](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -_eval(node.operand)
        raise ValueError(f"Unsupported expression element: {type(node)}")

    try:
        tree = ast.parse(expression.strip(), mode="eval")
        result = _eval(tree.body)
        return str(result)
    except Exception as e:
        return f"Could not evaluate: {e}"


@tool
def get_current_datetime(timezone_name: str = "UTC") -> str:
    """Get the current date and time. Optionally pass a timezone name like 'Asia/Kolkata' or 'US/Eastern'."""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(timezone_name)
        now = datetime.now(tz)
        return now.strftime(f"%A, %B %d, %Y at %I:%M %p ({timezone_name})")
    except Exception:
        now = datetime.now(timezone.utc)
        return now.strftime("%A, %B %d, %Y at %I:%M %p (UTC)")


def build_tools(cfg: ToolsConfig) -> list[BaseTool]:
    tools: list[BaseTool] = []

    if cfg.calculator.get("enabled", True):
        tools.append(calculator)
        logger.debug("Tool enabled: calculator")

    if cfg.datetime.get("enabled", True):
        tools.append(get_current_datetime)
        logger.debug("Tool enabled: datetime")

    if cfg.web_search.enabled:
        try:
            web_tool = _build_web_search_tool(cfg.web_search)
            if web_tool:
                tools.append(web_tool)
        except Exception as e:
            logger.warning(f"Web search tool failed to load: {e}")

    if cfg.custom_tools.get("enabled", False):
        module_path = cfg.custom_tools.get("module_path", "")
        if module_path:
            try:
                custom = _load_custom_tools(module_path)
                tools.extend(custom)
                logger.info(f"Loaded {len(custom)} custom tool(s) from {module_path}")
            except Exception as e:
                logger.warning(f"Custom tools failed to load from {module_path}: {e}")

    return tools


def _build_web_search_tool(cfg) -> Optional[BaseTool]:
    import os
    provider = cfg.provider.lower()

    if provider == "tavily":
        from langchain_community.tools.tavily_search import TavilySearchResults
        api_key = os.environ.get(cfg.api_key_env, "")
        if not api_key:
            logger.warning(f"Web search disabled: {cfg.api_key_env} not set.")
            return None
        return TavilySearchResults(max_results=3, tavily_api_key=api_key)

    if provider == "duckduckgo":
        from langchain_community.tools import DuckDuckGoSearchRun
        return DuckDuckGoSearchRun()

    return None


def _load_custom_tools(module_path: str) -> list[BaseTool]:
    """Load a TOOLS list from a user-provided Python module."""
    from pathlib import Path
    import sys

    path = Path(module_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Custom tools module not found: {path}")

    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("custom_tools", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "TOOLS"):
        raise AttributeError(f"Module {path} must define a list named 'TOOLS'")

    return module.TOOLS
