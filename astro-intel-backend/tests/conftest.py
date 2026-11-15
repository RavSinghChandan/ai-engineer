import os

# main.py starts the durable-workflow recovery sweep on import; in the test process it
# would claim tasks other tests are driving by hand.
os.environ.setdefault("WORKFLOW_RECOVERY_ENABLED", "false")

# The AuditService's jsonl sink writes outside the app database; keep test records out of the repo.
import tempfile as _tempfile
os.environ.setdefault("AUDIT_EXTERNAL_PATH",
                      os.path.join(_tempfile.mkdtemp(prefix="astro-audit-"), "execution_records.jsonl"))
