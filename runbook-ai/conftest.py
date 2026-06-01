"""Root conftest — sets APP_ENV=test before any imports so JWT_SECRET check is bypassed."""
import os
os.environ.setdefault("APP_ENV", "test")
