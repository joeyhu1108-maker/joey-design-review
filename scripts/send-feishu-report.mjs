#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));

if (!args.title || !args.body) {
  fail("用法: node scripts/send-feishu-report.mjs --title <标题> --body <摘要> [--key <幂等键>] [--dry-run]");
}

const title = normalize(args.title, 80);
const body = normalize(args.body, 1800);
const idempotencyKey = makeKey(args.key || `${title}-${body}`);
const markdown = `## ${title}\n\n${body}`;

if (args.dryRun) {
  console.log(JSON.stringify({ dryRun: true, title, body, idempotencyKey }, null, 2));
  process.exit(0);
}

const config = readEnv(path.join(repoRoot, ".local", "review.env"));
if (!config.FEISHU_REPORT_USER_ID) fail("缺少 FEISHU_REPORT_USER_ID");
if (config.FEISHU_REPORT_IDENTITY !== "bot") fail("统一汇报只允许使用 bot 身份");

const output = execFileSync("lark-cli", [
  "im", "+messages-send",
  "--user-id", config.FEISHU_REPORT_USER_ID,
  "--as", "bot",
  "--idempotency-key", idempotencyKey,
  "--markdown", markdown,
  "--format", "json"
], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
  env: {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1"
  }
});

const result = JSON.parse(output);
if (result.ok !== true) fail("飞书机器人汇报失败");
console.log(JSON.stringify({ ok: true, messageId: result.data?.message_id, chatId: result.data?.chat_id }, null, 2));

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value.startsWith("--")) result[toCamel(value.slice(2))] = values[++index];
  }
  return result;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalize(value, maximum) {
  const cleaned = value.trim().replace(/\n{3,}/g, "\n\n");
  return cleaned.length <= maximum ? cleaned : `${cleaned.slice(0, maximum - 12)}\n\n…已截断`;
}

function makeKey(value) {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (safe && safe.length <= 50) return safe;
  return `report-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function readEnv(file) {
  if (!existsSync(file)) fail(`缺少本地配置文件: ${file}`);
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

