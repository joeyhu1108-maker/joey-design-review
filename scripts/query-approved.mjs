#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const configPath = path.join(repoRoot, ".local", "review.env");
if (!existsSync(configPath)) throw new Error(`缺少本地配置: ${configPath}`);

const config = Object.fromEntries(readFileSync(configPath, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));

const fields = ["作品名称", "项目", "作品类型", "GitHub 预览链接", "GitHub 源码链接", "提交 SHA", "审阅意见", "审阅状态", "Skill 状态"];
const args = ["base", "+record-list", "--base-token", config.FEISHU_BASE_TOKEN, "--table-id", config.FEISHU_TABLE_ID, "--view-id", config.FEISHU_APPROVED_VIEW_ID, "--limit", "200", "--as", "user", "--format", "json"];
for (const field of fields) args.push("--field-id", field);

const output = execFileSync("lark-cli", args, { cwd: repoRoot, encoding: "utf8" });
process.stdout.write(output);

