#!/usr/bin/env node
// site/ を dist/ にコピーし、URLや運営者情報の差し込み、sitemap.xml・robots.txt・CNAME を生成する
import { cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "site"), DIST = path.join(ROOT, "dist");
const cfg = JSON.parse(await readFile(path.join(ROOT, "site.config.json"), "utf8"));
const siteUrl = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, "");
const domain = process.env.CUSTOM_DOMAIN ?? cfg.customDomain;

await rm(DIST, { recursive: true, force: true });
await cp(SRC, DIST, { recursive: true });

const vars = {
  SITE_URL: siteUrl,
  OPERATOR_NAME: cfg.operatorName,
  OPERATOR_PROFILE: cfg.operatorProfile,
  CONTACT: cfg.contact
};
const pages = (await readdir(DIST)).filter((f) => f.endsWith(".html"));
for (const f of pages) {
  const p = path.join(DIST, f);
  let html = await readFile(p, "utf8");
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  await writeFile(p, html);
}

const today = new Date().toISOString().slice(0, 10);
const urls = pages.map((f) => `${siteUrl}/${f === "index.html" ? "" : f}`);
await writeFile(path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") + "\n</urlset>\n");
await writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
if (domain) await writeFile(path.join(DIST, "CNAME"), domain + "\n");
await writeFile(path.join(DIST, ".nojekyll"), "");

console.log(`ビルド完了: dist/ （${pages.length}ページ, SITE_URL=${siteUrl}${domain ? ", CNAME=" + domain : ""}）`);
