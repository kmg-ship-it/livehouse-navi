import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesLens, pickBest, normalize, tierOf } from "../scripts/match.mjs";

const { lenses } = JSON.parse(await readFile(new URL("../site/data/lenses.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(lenses.map((l) => [l.id, l]));

test("全レンズに必須項目がある", () => {
  const ids = new Set();
  for (const l of lenses) {
    for (const k of ["id", "mk", "name", "mount", "fmt", "min", "max", "F", "priceTier", "scenes", "note", "search", "match"]) assert.ok(l[k] !== undefined, `${l.id} の ${k}`);
    assert.ok(!ids.has(l.id), `ID重複 ${l.id}`);
    ids.add(l.id);
    assert.ok(l.min <= l.max);
  }
});

test("正規化", () => {
  assert.equal(normalize("ＸＦ56mmF1.2 R WR"), "xf56mmf12rwr");
  assert.equal(normalize("NIKKOR Z 85mm f/1.8 S"), "nikkorz85mmf18s");
});

test("純正レンズの照合と中古の除外", () => {
  const l = byId["fuji-xf56f12wr"];
  assert.ok(matchesLens("【新品】富士フイルム フジノンレンズ XF56mmF1.2 R WR", l));
  assert.ok(!matchesLens("【中古】富士フイルム XF56mmF1.2 R WR", l));
  assert.ok(!matchesLens("XF56mmF1.2 R WR 用 レンズフード", l));
  assert.ok(!matchesLens("富士フイルム XF56mmF1.2 R APD", l));
});

test("サードパーティはマウント違いを弾く", () => {
  const e = byId["sigma-56f14-e"];
  assert.ok(matchesLens("SIGMA 56mm F1.4 DC DN | Contemporary ソニーEマウント用", e));
  assert.ok(!matchesLens("SIGMA 56mm F1.4 DC DN | Contemporary 富士フイルムXマウント用", e));
  const tz = byId["tamron-35150-z"], te = byId["tamron-35150-e"];
  assert.ok(matchesLens("タムロン 35-150mm F/2-2.8 Di III VXD (Model A058Z) ニコンZ", tz));
  assert.ok(!matchesLens("タムロン 35-150mm F/2-2.8 Di III VXD (Model A058Z) ニコンZ", te));
  assert.ok(matchesLens("タムロン 35-150mm F/2-2.8 Di III VXD Model A058 ソニーE", te));
});

test("新旧モデルの区別", () => {
  assert.ok(!matchesLens("ニコン NIKKOR Z 70-200mm f/2.8 VR S II", byId["nikon-z70200f28s"]));
  assert.ok(matchesLens("ニコン NIKKOR Z 70-200mm f/2.8 VR S II", byId["nikon-z70200f28s2"]));
  assert.ok(!matchesLens("Canon RF70-200mm F2.8 L IS USM Z ホワイト", byId["canon-rf70200f28"]));
});

test("最安の選択と異常値の除外", () => {
  const l = byId["fuji-xf90f2"];
  const items = [
    { itemName: "富士フイルム XF90mmF2 R LM WR", itemPrice: 98000, itemUrl: "a", shopName: "A" },
    { itemName: "富士フイルム XF90mmF2 R LM WR 国内正規品", itemPrice: 95800, affiliateUrl: "b", shopName: "B" },
    { itemName: "XF90mmF2 R LM WR 互換 フード", itemPrice: 1200, itemUrl: "c" },
    { itemName: "富士フイルム XF90mmF2 R LM WR 誤登録", itemPrice: 9800, itemUrl: "d" },
    { itemName: "富士フイルム XF90mmF2 R LM WR", itemPrice: 101000, itemUrl: "e" }
  ];
  const best = pickBest(items, l);
  assert.equal(best.price, 95800);
  assert.equal(best.url, "b");
  assert.equal(tierOf(best.price), "mid");
  assert.equal(pickBest([{ itemName: "別のレンズ", itemPrice: 1 }], l), null);
});

test("APIリクエストの組み立てとエラー処理", async () => {
  process.env.RAKUTEN_APP_ID = "app-uuid";
  process.env.RAKUTEN_ACCESS_KEY = "pk_test";
  process.env.RAKUTEN_AFFILIATE_ID = "aff";
  process.env.RAKUTEN_SITE_URL = "https://example.com/";
  const { search } = await import("../scripts/fetch-prices.mjs");
  let seen;
  const okFetch = async (url, opts) => { seen = { url: new URL(url), opts }; return new Response(JSON.stringify({ Items: [{ itemName: "x", itemPrice: 1 }] }), { status: 200 }); };
  const items = await search("XF90mmF2", { fetchImpl: okFetch });
  assert.equal(items.length, 1);
  assert.match(seen.url.href, /^https:\/\/openapi\.rakuten\.co\.jp\/ichibams\/api\/IchibaItem\/Search\//);
  assert.equal(seen.url.searchParams.get("accessKey"), "pk_test");
  assert.equal(seen.url.searchParams.get("affiliateId"), "aff");
  assert.equal(seen.url.searchParams.get("formatVersion"), "2");
  assert.equal(seen.opts.headers.Origin, "https://example.com");
  const errFetch = async () => new Response(JSON.stringify({ errors: { errorCode: 403, errorMessage: "Invalid Access Key" } }), { status: 403 });
  await assert.rejects(() => search("x", { fetchImpl: errFetch }), /Invalid Access Key/);
});
