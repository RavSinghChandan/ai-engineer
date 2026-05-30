CREATE_RUNBOOKS = """
CREATE TABLE IF NOT EXISTS runbooks (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename                    TEXT    NOT NULL,
    title                       TEXT    NOT NULL,
    description                 TEXT    NOT NULL DEFAULT '',
    category                    TEXT    NOT NULL DEFAULT 'other',
    severity                    TEXT    NOT NULL DEFAULT 'P3',
    tags                        TEXT    NOT NULL DEFAULT '[]',
    prerequisites               TEXT    NOT NULL DEFAULT '[]',
    estimated_duration_minutes  INTEGER NOT NULL DEFAULT 15,
    total_pages                 INTEGER NOT NULL DEFAULT 0,
    status                      TEXT    NOT NULL DEFAULT 'active',
    created_at                  REAL    NOT NULL,
    updated_at                  REAL    NOT NULL
);
"""

CREATE_STEPS = """
CREATE TABLE IF NOT EXISTS steps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    runbook_id       INTEGER NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
    step_number      INTEGER NOT NULL,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL DEFAULT '',
    commands         TEXT    NOT NULL DEFAULT '[]',
    expected_output  TEXT    NOT NULL DEFAULT '',
    depends_on       TEXT    NOT NULL DEFAULT '[]',
    is_optional      INTEGER NOT NULL DEFAULT 0,
    timeout_seconds  INTEGER NOT NULL DEFAULT 60,
    is_rollback      INTEGER NOT NULL DEFAULT 0
);
"""

CREATE_INGEST_JOBS = """
CREATE TABLE IF NOT EXISTS ingest_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    runbook_id   INTEGER,
    error        TEXT    NOT NULL DEFAULT '',
    agent_log    TEXT    NOT NULL DEFAULT '[]',
    created_at   REAL    NOT NULL,
    updated_at   REAL    NOT NULL
);
"""

ALL_TABLES = [CREATE_RUNBOOKS, CREATE_STEPS, CREATE_INGEST_JOBS]
