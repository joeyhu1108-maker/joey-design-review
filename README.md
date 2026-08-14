# Joey Design Review

Public review pages for design work explicitly submitted from the local Codex workflow.

Lifecycle states are kept separate:

`source → build → uploaded → deployed → verified → approved → skill generated`

The repository intentionally contains no Feishu tokens, private user identifiers, or local configuration.

## Workflow

1. Submit a specific file with `scripts/publish-review-item.mjs`; `--public` is mandatory.
2. The script commits and pushes only that review item, waits for GitHub Pages, and verifies the public page.
3. Only after verification does it create the Feishu review record and attach the preview.
4. Joey records the decision in Feishu as `已通过` or `需修改`.
5. The scheduled Codex automation turns only approved, unprocessed records into validated Skills under `skills/` and writes the commit-pinned link back to Feishu.

Example dry run:

```bash
node scripts/publish-review-item.mjs \
  --file /absolute/path/to/design.png \
  --title "Design title" \
  --project "Project name" \
  --kind "设计图" \
  --slug design-title \
  --public \
  --dry-run
```
