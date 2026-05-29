"""JSON file storage layer."""
import json
import uuid
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"

_USERS_FILE = "users.json"
_PROGRESS_FILE = "progress.json"


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
    users = _read(_USERS_FILE)
    user_id = str(uuid.uuid4())[:8]
    users[user_id] = user_data
    _write(_USERS_FILE, users)
    return user_id


def get_user(user_id: str) -> Optional[dict]:
    return _read(_USERS_FILE).get(user_id)


def save_progress(user_id: str, progress_data: dict) -> None:
    progress = _read(_PROGRESS_FILE)
    progress[user_id] = progress_data
    _write(_PROGRESS_FILE, progress)


def get_progress(user_id: str) -> Optional[dict]:
    return _read(_PROGRESS_FILE).get(user_id)
