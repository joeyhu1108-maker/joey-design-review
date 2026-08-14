# Global Feishu reporting policy

All active Codex automations use `scripts/send-feishu-report.mjs` to send concise bot DMs to Joey.

Send only when at least one of these is true:

- a new actionable task or reminder appears;
- a due date is near, reached, or overdue;
- a project changes lifecycle state;
- a deliverable is completed and verified;
- an automation fails or becomes blocked;
- Joey needs to approve a decision.

Do not message for an unchanged normal check. Do not include tokens, user IDs, passwords, raw personal contact details, or unnecessary local paths.

Every status must distinguish:

`idea → source → build → uploaded → deployed → verified → business result`

Recommended message shape:

1. Current status
2. What changed
3. Joey's next action, if any
4. Evidence link
