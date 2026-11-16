"""Durable workflow for the 360° pipeline — task states, checkpoints, retries, crash recovery."""
from workflow import checkpointer, store


def init_tables() -> None:
    store.init_tables()
    checkpointer.init_tables()
