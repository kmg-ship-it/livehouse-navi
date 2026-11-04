#!/usr/bin/env node
// GitHubのSecretsに紛れ込んだ前後の空白・改行を取り除く
for (const k of ["RAKUTEN_APP_ID", "RAKUTEN_ACCESS_KEY", "RAKUTEN_AFFILIATE_ID", "RAKUTEN_SITE_URL"]) if (process.env[k]) process.env[k] = process.env[k].trim();
// 診断用：キーの中身は出さず、形式と長さだけ表示する
if (process.env.RAKUTEN_APP_ID) console.log("[診断] APP_ID:", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.RAKUTEN_APP_ID) ? "UUID形式OK" : "UUID形式ではない", "長さ", process.env.RAKUTEN_APP_ID.length, "/ ACCESS_KEY:", (process.env.RAKUTEN_ACCESS_KEY || "").startsWith("pk_") ? "pk_で始まる" : "pk_で始まらない", "長さ", (process.env.RAKUTEN_ACCESS_KEY || "").length, "/ AFFILIATE_ID 長さ", (process.env.RAKUTEN_AFFILIATE_ID || "").length);
// 楽天市場 商品検索API（2026年の新API）で各レンズの最安価格とアフィリエイトURLを取得し、
// site/data/prices.json に書き出す。依存パッケージなし（Node.js 20以上）。
//
// 必要な環境変数:
//   RAKUTEN_APP_ID        アプリID（UUID形式）
//   RAKUTEN_ACCESS_KEY    アクセスキー（pk_ で始まる）
//   RAKUTEN_AFFILIATE_ID  アフィリエイトID（任意。入れると affiliateUrl が返る）
//   RAKUTEN_SITE_URL      アプリに登録したサイトURL（Webアプリケーション型のとき Referer/Origin に使う）
//   RAKUTEN_API_VERSION   任意。既定 20260701
//
// 使い方:  node scripts/fetch-prices.mjs            … 全レンズを取得
//          node scripts/fetch-prices.mjs --only=fuji-xf90f2   … 1本だけ試す

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pickBest, tierOf, NG_WORDS } from "./match.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LENSES = path.join(ROOT, "site/data/lenses.json");
const OUT = path.join(ROOT, "site/data/prices.json");

const env = process.env;
const VERSION = env.RAKUTEN_API_VERSION || "20260701";
const ENDPOINT = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/${VERSION}`;
const WAIT_MS = 1100; // 1秒1リクエスト程度に抑える

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 楽天のエラーは2種類の形がある（ドキュメント通りの error / 実際に返る errors）
function errorText(body) {
  if (!body || typeof body !== "object") return "";
  if (body.errors) return `${body.errors.errorCode ?? ""} ${body.errors.errorMessage ?? ""}`.trim();
  if (body.error) return `${body.error} ${body.error_description ?? ""}`.trim();
  return "";
}

export async function search(keyword, { fetchImpl = fetch } = {}) {
  const url = new URL(ENDPOINT);
  const q = {
    applicationId: env.RAKUTEN_APP_ID,
    accessKey: env.RAKUTEN_ACCESS_KEY,
    format: "json",
    formatVersion: "2",
    keyword,
    NGKeyword: "中古 ジャンク レンタル フード キャップ",
    hits: "30",
    sort: "standard",
    availability: "1",
    minPrice: "10000"
  };
  if (env.RAKUTEN_AFFILIATE_ID) q.affiliateId = env.RAKUTEN_AFFILIATE_ID;
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);

  const headers = { "User-Agent": "livehouse-navi-price-bot/1.0", Accept: "application/json" };
  if (env.RAKUTEN_SITE_URL) {
    headers.Referer = env.RAKUTEN_SITE_URL;
    headers.Origin = new URL(env.RAKUTEN_SITE_URL).origin;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetchImpl(url, { headers });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* HTMLが返ることもある */ }
    if (res.status === 429 || res.status >= 500) { await sleep(3000 * attempt); continue; }
    const err = errorText(body);
    if (!res.ok || err) throw new Error(`楽天API HTTP ${res.status}: ${err || text.slice(0, 200)}`);
    return body.Items || [];
  }
  throw new Error("楽天API: 再試行しても応答がありません");
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY) {
    console.error("RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY が未設定です。README の手順で設定してください。");
    process.exit(1);
  }
  const { lenses } = JSON.parse(await readFile(LENSES, "utf8"));
  let prev = { items: {} };
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* 初回 */ }

  const items = { ...prev.items };
  let ok = 0, miss = 0, fail = 0;
  const targets = only ? lenses.filter((l) => l.id === only) : lenses;

  for (const lens of targets) {
    try {
      const results = await search(lens.search);
      const best = pickBest(results, lens);
      if (best) {
        items[lens.id] = { ...best, tier: tierOf(best.price), checkedAt: new Date().toISOString() };
        ok++;
        console.log(`✔ ${lens.id}  ¥${best.price.toLocaleString()}  (${best.matched}件一致)`);
      } else {
        miss++;
        console.warn(`– ${lens.id}  一致する新品が見つかりません（前回の値を保持）`);
      }
    } catch (e) {
      fail++;
      console.error(`✖ ${lens.id}  ${e.message}`);
      if (/accessKey|Access Key|Authentication|REFERRER|403/.test(e.message)) {
        console.error("認証エラーのため中断します。アプリ種別・サイトURL・キーを確認してください。");
        break;
      }
    }
    await sleep(WAIT_MS);
  }

  // 1本も取れなかったときはファイルを書き換えない（前回の価格を残す）
  if (ok === 0) {
    console.error(`価格を1件も取得できませんでした（未一致 ${miss} / 失敗 ${fail}）。prices.json は更新しません。`);
    process.exit(fail ? 1 : 0);
  }
  const out = { updatedAt: new Date().toISOString(), source: "楽天市場", items };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n完了: 取得 ${ok} / 未一致 ${miss} / 失敗 ${fail}  → site/data/prices.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { NG_WORDS };
