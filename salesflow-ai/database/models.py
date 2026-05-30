CREATE_LEADS = """
CREATE TABLE IF NOT EXISTS leads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id     TEXT    NOT NULL,
    platform      TEXT    NOT NULL DEFAULT 'instagram',
    sender_name   TEXT    NOT NULL DEFAULT '',
    funnel_stage  TEXT    NOT NULL DEFAULT 'NEW_LEAD',
    created_at    REAL    NOT NULL,
    updated_at    REAL    NOT NULL,
    UNIQUE(sender_id, platform)
);
"""

CREATE_INTERACTIONS = """
CREATE TABLE IF NOT EXISTS interactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id       INTEGER NOT NULL REFERENCES leads(id),
    role          TEXT    NOT NULL,   -- customer | agent
    content       TEXT    NOT NULL,
    intent        TEXT    NOT NULL DEFAULT '',
    platform      TEXT    NOT NULL DEFAULT '',
    message_type  TEXT    NOT NULL DEFAULT '',
    created_at    REAL    NOT NULL
);
"""

ALL_TABLES = [CREATE_LEADS, CREATE_INTERACTIONS]
