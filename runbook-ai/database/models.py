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
    source_type                 TEXT    NOT NULL DEFAULT 'internal',
    source_name                 TEXT    NOT NULL DEFAULT 'Internal Runbook',
    source_url                  TEXT    NOT NULL DEFAULT '',
    ingested_at                 REAL    NOT NULL DEFAULT 0,
    tenant_id                   INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
    tenant_id    INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    created_at   REAL    NOT NULL,
    updated_at   REAL    NOT NULL
);
"""

CREATE_TENANTS = """
CREATE TABLE IF NOT EXISTS tenants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    slug        TEXT    NOT NULL UNIQUE,
    plan        TEXT    NOT NULL DEFAULT 'free',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  REAL    NOT NULL
);
"""

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL UNIQUE,
    hashed_password TEXT    NOT NULL,
    full_name       TEXT    NOT NULL DEFAULT '',
    role            TEXT    NOT NULL DEFAULT 'viewer',
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      REAL    NOT NULL,
    updated_at      REAL    NOT NULL
);
"""

CREATE_GRAPH_CACHE = """
CREATE TABLE IF NOT EXISTS graph_cache (
    runbook_id      INTEGER PRIMARY KEY REFERENCES runbooks(id) ON DELETE CASCADE,
    graph_json      TEXT    NOT NULL,
    critical_path   TEXT    NOT NULL DEFAULT '[]',
    parallel_groups TEXT    NOT NULL DEFAULT '[]',
    bottleneck_steps TEXT   NOT NULL DEFAULT '[]',
    has_cycle       INTEGER NOT NULL DEFAULT 0,
    estimated_parallel_duration_minutes INTEGER NOT NULL DEFAULT 0,
    updated_at      REAL    NOT NULL
);
"""

# BUG FIX: runbook_conflicts was queried by multi_source_composer and written by
# conflict_detector but never created — every access silently failed with
# "no such table: runbook_conflicts" (caught by bare except → returned []).
CREATE_RUNBOOK_CONFLICTS = """
CREATE TABLE IF NOT EXISTS runbook_conflicts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    runbook_a_id    INTEGER NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
    runbook_b_id    INTEGER NOT NULL REFERENCES runbooks(id) ON DELETE CASCADE,
    step_a          INTEGER,
    step_b          INTEGER,
    conflict_type   TEXT    NOT NULL DEFAULT 'VALUE_CONFLICT',
    severity        TEXT    NOT NULL DEFAULT 'MEDIUM',
    description     TEXT    NOT NULL DEFAULT '',
    recommendation  TEXT    NOT NULL DEFAULT '',
    tenant_id       INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    created_at      REAL    NOT NULL
);
"""

# Indexes — applied after table creation; IF NOT EXISTS makes them idempotent
CREATE_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_runbooks_tenant_status       ON runbooks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_runbooks_category_status     ON runbooks(category, status);
CREATE INDEX IF NOT EXISTS idx_runbooks_severity_status     ON runbooks(severity, status);
CREATE INDEX IF NOT EXISTS idx_steps_runbook_rollback       ON steps(runbook_id, is_rollback);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_tenant           ON ingest_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant                 ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_runbook_pair       ON runbook_conflicts(runbook_a_id, runbook_b_id, tenant_id);
"""

# Tables ordered so FK dependencies are created first
ALL_TABLES = [
    CREATE_TENANTS,
    CREATE_USERS,
    CREATE_RUNBOOKS,
    CREATE_STEPS,
    CREATE_INGEST_JOBS,
    CREATE_GRAPH_CACHE,
    CREATE_RUNBOOK_CONFLICTS,
]
