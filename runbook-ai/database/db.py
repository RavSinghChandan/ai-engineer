import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from database.models import ALL_TABLES

DB_PATH = os.getenv("DATABASE_PATH", str(Path(__file__).parent.parent / "runbookai.db"))


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        for ddl in ALL_TABLES:
            conn.execute(ddl)
        conn.commit()


@contextmanager
def get_conn():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
