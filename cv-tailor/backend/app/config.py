"""Configuration — DeepSeek key, paths, tectonic binary."""
import os
import shutil
from functools import lru_cache
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BASE_CV = APP_DIR / "base" / "base_cv.tex"
DATA_DIR = APP_DIR.parent / "data"
OUT_DIR = DATA_DIR / "cvs"          # generated .tex + .pdf per job
DB_PATH = DATA_DIR / "cvtailor.db"


class Settings:
    def __init__(self) -> None:
        self.deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        self.deepseek_base_url = "https://api.deepseek.com"
        self.deepseek_model = "deepseek-chat"
        self.tectonic = shutil.which("tectonic") or "tectonic"
        self.cors_origins = ["http://localhost:4200", "http://127.0.0.1:4200"]
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        OUT_DIR.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
