"""
Phase 3 tests — Role CRUD API (SQLite-backed).

Positive + negative cases for:
  - DB layer: create, get, update, delete, seed_from_json

API-layer tests (POST/PUT/DELETE /admin/roles, GET /roles) are in test_api.py
to reuse its already-wired TestClient fixture with full mocking.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest


# ── DB fixture ────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_db(tmp_path):
    db_file = tmp_path / "test_phase3.db"
    with patch("db.DB_PATH", db_file):
        yield db_file


SAMPLE_ROLE = {
    "id": "test-python-dev",
    "title": "Python Developer",
    "description": "Builds Python services",
    "required_skills": ["Python", "FastAPI"],
    "preferred_skills": ["Docker"],
    "experience_years": 3,
    "internal_notes": "Strong candidate pool",
}


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — create_role_db
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_create_role(tmp_db):
    from db import init_db, create_role_db
    await init_db()
    created = await create_role_db(SAMPLE_ROLE)
    assert created["id"] == "test-python-dev"
    assert created["title"] == "Python Developer"
    assert "Python" in created["required_skills"]


@pytest.mark.asyncio
async def test_negative_create_duplicate_role(tmp_db):
    from db import init_db, create_role_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    with pytest.raises(ValueError, match="already exists"):
        await create_role_db(SAMPLE_ROLE)


@pytest.mark.asyncio
async def test_positive_role_id_normalised_to_lowercase(tmp_db):
    from db import init_db, create_role_db
    await init_db()
    role = {**SAMPLE_ROLE, "id": "PYTHON-DEV"}
    created = await create_role_db(role)
    assert created["id"] == "python-dev"


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — get_role_db
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_get_role(tmp_db):
    from db import init_db, create_role_db, get_role_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    role = await get_role_db("test-python-dev")
    assert role is not None
    assert role["title"] == "Python Developer"


@pytest.mark.asyncio
async def test_negative_get_nonexistent_role_returns_none(tmp_db):
    from db import init_db, get_role_db
    await init_db()
    role = await get_role_db("does-not-exist")
    assert role is None


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — get_all_roles_db
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_get_all_roles_returns_list(tmp_db):
    from db import init_db, create_role_db, get_all_roles_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    roles = await get_all_roles_db()
    assert len(roles) == 1
    assert roles[0]["title"] == "Python Developer"


@pytest.mark.asyncio
async def test_positive_get_all_roles_empty_db(tmp_db):
    from db import init_db, get_all_roles_db
    await init_db()
    roles = await get_all_roles_db()
    assert roles == []


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — update_role_db
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_update_role_partial(tmp_db):
    from db import init_db, create_role_db, update_role_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    updated = await update_role_db("test-python-dev", {"title": "Senior Python Dev"})
    assert updated["title"] == "Senior Python Dev"
    # untouched fields preserved
    assert "Python" in updated["required_skills"]


@pytest.mark.asyncio
async def test_positive_update_role_skills(tmp_db):
    from db import init_db, create_role_db, update_role_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    updated = await update_role_db(
        "test-python-dev",
        {"required_skills": ["Python", "FastAPI", "PostgreSQL"]},
    )
    assert "PostgreSQL" in updated["required_skills"]


@pytest.mark.asyncio
async def test_negative_update_nonexistent_role_returns_none(tmp_db):
    from db import init_db, update_role_db
    await init_db()
    result = await update_role_db("no-such-role", {"title": "Ghost"})
    assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — delete_role_db
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_delete_role(tmp_db):
    from db import init_db, create_role_db, delete_role_db, get_role_db
    await init_db()
    await create_role_db(SAMPLE_ROLE)
    deleted = await delete_role_db("test-python-dev")
    assert deleted is True
    assert await get_role_db("test-python-dev") is None


@pytest.mark.asyncio
async def test_negative_delete_nonexistent_role_returns_false(tmp_db):
    from db import init_db, delete_role_db
    await init_db()
    deleted = await delete_role_db("no-such-role")
    assert deleted is False


# ═══════════════════════════════════════════════════════════════════════════════
# DB layer — seed_roles_from_json
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_positive_seed_from_json(tmp_db, tmp_path):
    from db import init_db, seed_roles_from_json, get_all_roles_db
    await init_db()
    roles_file = tmp_path / "roles.json"
    roles_file.write_text(json.dumps({
        "roles": [
            {
                "id": "java-dev",
                "title": "Java Developer",
                "description": "Java backend",
                "required_skills": ["Java", "Spring"],
                "preferred_skills": [],
                "experience_years": 3,
                "internal_notes": "",
            }
        ]
    }))
    count = await seed_roles_from_json(roles_file)
    assert count == 1
    roles = await get_all_roles_db()
    assert len(roles) == 1


@pytest.mark.asyncio
async def test_positive_seed_is_idempotent(tmp_db, tmp_path):
    from db import init_db, seed_roles_from_json
    await init_db()
    roles_file = tmp_path / "roles.json"
    roles_file.write_text(json.dumps({
        "roles": [{
            "id": "java-dev", "title": "Java Dev",
            "required_skills": ["Java"],
            "preferred_skills": [], "experience_years": 2,
            "description": "", "internal_notes": "",
        }]
    }))
    first = await seed_roles_from_json(roles_file)
    second = await seed_roles_from_json(roles_file)
    assert first == 1
    assert second == 0  # already exists — skipped


@pytest.mark.asyncio
async def test_negative_seed_missing_file_returns_zero(tmp_db, tmp_path):
    from db import init_db, seed_roles_from_json
    await init_db()
    missing = tmp_path / "no_such_file.json"
    count = await seed_roles_from_json(missing)
    assert count == 0
