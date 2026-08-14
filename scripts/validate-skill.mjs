#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const folder = path.resolve(process.argv[2] || "");
const errors = [];
const skillFile = path.join(folder, "SKILL.md");
const sourceFile = path.join(folder, "references", "source.md");
const evalFile = path.join(folder, "evals", "checklist.md");

if (!existsSync(skillFile)) errors.push("缺少 SKILL.md");
if (!existsSync(sourceFile)) errors.push("缺少 references/source.md");
if (!existsSync(evalFile)) errors.push("缺少 evals/checklist.md");

if (existsSync(skillFile)) {
  const content = readFileSync(skillFile, "utf8");
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) errors.push("SKILL.md 缺少 YAML frontmatter");
  const name = frontmatter?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter?.[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) errors.push("name 必须是 lowercase-kebab-case");
  if (name && name !== path.basename(folder)) errors.push("name 必须与 Skill 文件夹名一致");
  if (!description || description.length < 20) errors.push("description 需要说明何时调用以及解决什么问题");
  if (!/##\s+(Inputs|输入)/i.test(content)) errors.push("SKILL.md 缺少 Inputs/输入章节");
  if (!/##\s+(Workflow|流程|SOP)/i.test(content)) errors.push("SKILL.md 缺少 Workflow/流程/SOP 章节");
  if (!/##\s+(Output|输出)/i.test(content)) errors.push("SKILL.md 缺少 Output/输出章节");
}

const result = { ok: errors.length === 0, folder, errors };
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

