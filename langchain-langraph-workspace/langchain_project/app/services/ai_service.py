from pathlib import Path
from typing import Tuple

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from openai import APIError, RateLimitError

from app.core.config import settings
from app.core.logger import get_logger
from app.memory.memory import memory
from app.chains.chain import get_reasoning_chain
from app.agents.agent import get_agent_executor
from app.rag.retrieve import retrieve_context
from app.models.response_model import AIResponse

logger = get_logger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(version: str) -> str:
    prompt_file = PROMPTS_DIR / f"{version}.txt"
    if not prompt_file.exists():
        logger.warning(f"Prompt '{version}' not found, falling back to v1")
        prompt_file = PROMPTS_DIR / "v1.txt"
    return prompt_file.read_text().strip()


@retry(
    retry=retry_if_exception_type((APIError, RateLimitError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
def _invoke_chain(chain, input_data: dict) -> str:
    return chain.invoke(input_data)


def run_ai_service(
    question: str,
    prompt_version: str = "v1",
    use_rag: bool = False,
) -> AIResponse:
    logger.info(f"Processing | question={question!r} | prompt={prompt_version} | rag={use_rag}")

    steps: list = []
    sources: list = []
    context_text = ""

    # Step 1: RAG retrieval
    if use_rag:
        steps.append("Step 1: Retrieving relevant context from documents")
        context_docs, sources = retrieve_context(question)
        if context_docs:
            context_text = "\n\n".join(context_docs)
            steps.append(f"Step 2: Found {len(context_docs)} relevant chunks")
        else:
            steps.append("Step 2: No relevant documents found, proceeding without RAG")
    else:
        steps.append("Step 1: Skipping RAG (not requested)")

    # Step 2: Agent with tools
    steps.append("Step 3: Running agent with tools (calculator, datetime)")
    agent_question = (
        f"Context:\n{context_text}\n\nQuestion: {question}" if context_text else question
    )

    try:
        executor = get_agent_executor(question=agent_question)
        result = executor.invoke({
            "input": agent_question,
            "chat_history": memory.get(),
        })
        answer = result.get("output", "")

        for step in result.get("intermediate_steps", []):
            action, observation = step
            steps.append(f"Tool used: {action.tool} → {observation}")

    except Exception as e:
        logger.error(f"Agent failed: {e} — falling back to reasoning chain")
        steps.append("Step 3: Agent failed, using fallback reasoning chain")

        system_prompt = load_prompt(prompt_version)
        if context_text:
            system_prompt += f"\n\nContext:\n{context_text}"

        chain = get_reasoning_chain(system_prompt, question=question)
        try:
            answer = _invoke_chain(chain, {"input": question, "history": memory.get()})
        except Exception as fallback_err:
            logger.error(f"Fallback chain also failed: {fallback_err}")
            answer = "I'm sorry, I encountered an error processing your request. Please try again."

    memory.add(question, answer)
    steps.append("Step 4: Response saved to conversation memory")

    logger.info("Response generated successfully")
    return AIResponse(answer=answer, sources=sources, steps=steps)
