// 楽天の検索結果から「そのレンズの新品」だけを選び出すロジック（テストしやすいよう分離）

// 商品名に含まれていたら除外する語（中古・アクセサリー・セット品など）
export const NG_WORDS = [
  "中古", "ジャンク", "レンタル", "互換", "フード", "キャップ", "フィルター", "プロテクター",
  "ケース", "ポーチ", "保護", "レンズペン", "下取", "アダプター", "訳あり", "展示", "未使用",
  "キット", "ボディ", "セット", "ステッカー", "シール", "パーツ", "修理", "クリーニング", "中古品", "used"
];

// 全角→半角、小文字化、記号と空白を除去
export function normalize(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-zぁ-んァ-ヶー一-龠]/g, "");
}

export function matchesLens(itemName, lens) {
  const n = normalize(itemName);
  if (NG_WORDS.some((w) => n.includes(normalize(w)))) return false;
  if ((lens.exclude || []).some((w) => n.includes(normalize(w)))) return false;
  return (lens.match || []).every((group) => group.some((tok) => n.includes(normalize(tok))));
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 一致した商品の中から最安を選ぶ。極端に安いもの（付属品の混入など）は中央値の45%未満で除外
export function pickBest(items, lens) {
  const ok = items.filter((it) => matchesLens(it.itemName, lens) && Number(it.itemPrice) > 0);
  if (!ok.length) return null;
  const med = median(ok.map((it) => Number(it.itemPrice)));
  const sane = ok.filter((it) => Number(it.itemPrice) >= med * 0.45);
  sane.sort((a, b) => Number(a.itemPrice) - Number(b.itemPrice));
  const best = sane[0];
  return {
    price: Number(best.itemPrice),
    url: best.affiliateUrl || best.itemUrl,
    shop: best.shopName || "",
    title: best.itemName,
    matched: ok.length
  };
}

export function tierOf(price) {
  if (price < 50000) return "low";
  if (price < 120000) return "mid";
  return "high";
}
