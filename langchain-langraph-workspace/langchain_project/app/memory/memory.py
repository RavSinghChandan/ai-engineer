from langchain_core.messages import HumanMessage, AIMessage


class ChatMemory:
    def __init__(self):
        self._history: list = []

    def add(self, question: str, answer: str) -> None:
        self._history.append(HumanMessage(content=question))
        self._history.append(AIMessage(content=answer))

    def get(self) -> list:
        return self._history

    def clear(self) -> None:
        self._history = []


memory = ChatMemory()
