"""Simple JSON file storage — replaces a database for this demo."""
import json
import uuid
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"


def _read(filename: str) -> dict:
    path = DATA_DIR / filename
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def _write(filename: str, data: dict) -> None:
    with open(DATA_DIR / filename, "w") as f:
        json.dump(data, f, indent=2)


def save_user(user_data: dict) -> str:
    users = _read("users.json")
    user_id = str(uuid.uuid4())[:8]
    users[user_id] = user_data
    _write("users.json", users)
    return user_id


def get_user(user_id: str) -> Optional[dict]:
    return _read("users.json").get(user_id)


def save_progress(user_id: str, progress_data: dict) -> None:
    progress = _read("progress.json")
    progress[user_id] = progress_data
    _write("progress.json", progress)


def get_progress(user_id: str) -> Optional[dict]:
    return _read("progress.json").get(user_id)
