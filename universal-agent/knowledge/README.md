# Knowledge Base

Drop your domain documents here. The agent reads them on startup.

Supported formats:
- `.txt` — plain text
- `.md` — Markdown
- `.pdf` — PDFs (requires `pip install pypdf`)

## How to enable

In `config/agent.config.yaml`:

```yaml
knowledge_base:
  enabled: true
  source_dir: "./knowledge"
```

## Example

If you drop a file `pricing.md` here containing your app's pricing plans,
users can ask "What does the Pro plan cost?" and the agent will answer
from your document instead of guessing.
