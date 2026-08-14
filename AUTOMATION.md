# Approved design → Skill automation

The scheduled Codex run uses `scripts/query-approved.mjs` to read only the Feishu view `已通过待沉淀`.

For every returned record it must:

1. Mark `Skill 状态` as `生成中`.
2. Inspect the pinned GitHub preview and the reviewer comment.
3. Use the local `ux-skill-capture` instructions to extract a reusable Skill.
4. Create `skills/<lowercase-kebab-name>/SKILL.md`, `references/source.md`, and `evals/checklist.md`.
5. Run `node scripts/validate-skill.mjs skills/<name>`.
6. Commit and push only that Skill folder.
7. Update Feishu with `Skill 状态`, `Skill 名称`, the commit-pinned GitHub link, and validation result.

The display title should use the `ZONE-` prefix. The technical folder and frontmatter `name` remain lowercase kebab-case.

Failed validation must never be reported as `已生成`.
