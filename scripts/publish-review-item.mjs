#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));

if (!args.file || !args.title || !args.project || !args.kind) {
  fail("用法: node scripts/publish-review-item.mjs --file <文件> --title <标题> --project <项目> --kind <类型> --public [--slug <slug>] [--dry-run]");
}

const source = path.resolve(args.file);
if (!existsSync(source) || !statSync(source).isFile()) fail(`找不到文件: ${source}`);
if (!args.public && !args.dryRun) fail("公开 GitHub 前必须显式传入 --public");

const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".pdf", ".mp4"]);
const ext = path.extname(source).toLowerCase();
if (!allowed.has(ext)) fail(`暂不支持 ${ext || "无扩展名"}；支持 PNG/JPG/WebP/GIF/SVG/PDF/MP4`);
const allowedKinds = new Set(["设计图", "网页/H5", "Logo", "海报", "动效", "系统测试", "其他"]);
if (!allowedKinds.has(args.kind)) fail(`作品类型必须是: ${[...allowedKinds].join("、")}`);

const slug = args.slug || slugify(args.title);
if (!slug) fail("无法从标题生成 slug，请传入 --slug");

const assetName = `${slug}${ext}`;
const assetRelative = path.join("docs", "assets", "items", slug, assetName);
const pageRelative = path.join("docs", "items", slug, "index.html");
const assetTarget = path.join(repoRoot, assetRelative);
const pageTarget = path.join(repoRoot, pageRelative);
const nameWithOwner = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
const [owner, repository] = nameWithOwner.split("/");
const previewUrl = `https://${owner}.github.io/${repository}/items/${slug}/`;

if (existsSync(pageTarget)) fail(`slug 已存在: ${slug}`);

if (args.dryRun) {
  console.log(JSON.stringify({ dryRun: true, source, assetRelative, pageRelative, previewUrl }, null, 2));
  process.exit(0);
}

if (hasStagedChanges()) fail("Git 中已有暂存改动；请先处理后再发布，防止夹带无关文件");

const config = readEnv(path.join(repoRoot, ".local", "review.env"));
for (const key of ["FEISHU_BASE_TOKEN", "FEISHU_TABLE_ID", "FEISHU_ATTACHMENT_FIELD_ID"]) {
  if (!config[key]) fail(`缺少本地配置 ${key}`);
}

mkdirSync(path.dirname(assetTarget), { recursive: true });
mkdirSync(path.dirname(pageTarget), { recursive: true });
copyFileSync(source, assetTarget);
writeFileSync(pageTarget, renderPage({ title: args.title, project: args.project, kind: args.kind, slug, ext }), "utf8");

run("git", ["add", assetRelative, pageRelative]);
run("git", ["commit", "-m", `Publish review item: ${args.title}`]);
run("git", ["push"]);

const commit = run("git", ["rev-parse", "HEAD"]);
waitForPages(nameWithOwner, commit);
await verifyPage(previewUrl, args.title);

const sourceUrl = `https://github.com/${nameWithOwner}/tree/${commit}/docs/items/${slug}`;
const fields = {
  "作品名称": args.title,
  "项目": args.project,
  "作品类型": args.kind,
  "GitHub 预览链接": `[打开已部署审阅页](${previewUrl})`,
  "GitHub 源码链接": `[查看该提交源码](${sourceUrl})`,
  "提交 SHA": commit,
  "部署状态": "已验证",
  "审阅状态": "待审阅",
  "允许公开": true,
  "Skill 状态": "未生成"
};

const recordResult = runJson("lark-cli", [
  "base", "+record-upsert",
  "--base-token", config.FEISHU_BASE_TOKEN,
  "--table-id", config.FEISHU_TABLE_ID,
  "--as", "user",
  "--json", JSON.stringify(fields),
  "--format", "json"
]);
const recordId = recordResult?.data?.record?.record_id_list?.[0];
if (!recordId) fail("GitHub 已发布，但飞书记录创建失败：未返回 record_id");

run("lark-cli", [
  "base", "+record-upload-attachment",
  "--base-token", config.FEISHU_BASE_TOKEN,
  "--table-id", config.FEISHU_TABLE_ID,
  "--record-id", recordId,
  "--field-id", config.FEISHU_ATTACHMENT_FIELD_ID,
  "--file", path.relative(repoRoot, assetTarget),
  "--as", "user",
  "--format", "json"
], { cwd: repoRoot });

const reportMessageSent = sendReviewReport({ config, title: args.title, previewUrl, recordId });
console.log(JSON.stringify({ ok: true, title: args.title, previewUrl, sourceUrl, commit, recordId, reportMessageSent }, null, 2));

function parseArgs(values) {
  const result = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === "--public") result.public = true;
    else if (value === "--dry-run") result.dryRun = true;
    else if (value.startsWith("--")) result[toCamel(value.slice(2))] = values[++i];
  }
  return result;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readEnv(file) {
  if (!existsSync(file)) fail(`缺少本地配置文件: ${file}`);
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

function run(command, commandArgs, options = {}) {
  try {
    return execFileSync(command, commandArgs, { cwd: options.cwd || repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
  } catch (error) {
    fail(`${command} 执行失败${error.status ? `（退出码 ${error.status}）` : ""}`);
  }
}

function runJson(command, commandArgs) {
  const output = run(command, commandArgs);
  try { return JSON.parse(output); } catch { fail(`${command} 没有返回有效 JSON`); }
}

function hasStagedChanges() {
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: repoRoot, stdio: "ignore" });
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    fail("无法检查 Git 暂存区");
  }
}

function sendReviewReport({ config, title, previewUrl, recordId }) {
  if (!config.FEISHU_REPORT_USER_ID || config.FEISHU_REPORT_IDENTITY !== "bot") {
    console.warn("未配置机器人汇报，已跳过飞书私聊");
    return false;
  }
  const baseUrl = `https://my.feishu.cn/base/${config.FEISHU_BASE_TOKEN}`;
  const markdown = `## 新设计待你审阅\n\n- 作品：${title}\n- 部署状态：已验证\n- 审阅状态：待审阅\n\n[打开 GitHub 审阅页](${previewUrl})\n\n[进入飞书审阅表](${baseUrl})`;
  try {
    execFileSync("lark-cli", [
      "im", "+messages-send",
      "--user-id", config.FEISHU_REPORT_USER_ID,
      "--as", "bot",
      "--idempotency-key", `review-${recordId}`,
      "--markdown", markdown,
      "--format", "json"
    ], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    return true;
  } catch {
    console.warn("作品已发布且飞书记录已创建，但机器人私聊发送失败");
    return false;
  }
}

function waitForPages(repo, commit) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const output = run("gh", ["api", `repos/${repo}/pages/builds/latest`, "--jq", ".status + \" \" + .commit"]);
    if (output === `built ${commit}`) return;
    if (output.startsWith("errored ")) fail("GitHub Pages 构建失败");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  fail("GitHub Pages 在 3 分钟内未完成构建");
}

async function verifyPage(url, title) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok || !body.includes(title)) fail(`公网验证失败: HTTP ${response.status}`);
}

function renderPage({ title, project, kind, slug, ext }) {
  const safeTitle = escapeHtml(title);
  const safeProject = escapeHtml(project);
  const safeKind = escapeHtml(kind);
  const asset = `../../assets/items/${encodeURIComponent(slug)}/${encodeURIComponent(`${slug}${ext}`)}`;
  const media = ext === ".mp4"
    ? `<video class="review-image" controls src="${asset}"></video>`
    : ext === ".pdf"
      ? `<p><a href="${asset}">打开 PDF 原文件</a></p><iframe class="review-image" style="min-height:80vh" src="${asset}"></iframe>`
      : `<img class="review-image" src="${asset}" alt="${safeTitle}">`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle} · Joey Design Review</title><link rel="stylesheet" href="../../styles.css"></head>
<body><main><a class="back" href="../../">← 返回审阅列表</a><div class="eyebrow" style="margin-top:48px">${safeKind} · ${safeProject}</div><h1>${safeTitle}</h1><p class="lede">此页面对应飞书中的单条审阅记录。请在飞书填写意见并选择“已通过”或“需修改”。</p>${media}</main></body></html>\n`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
