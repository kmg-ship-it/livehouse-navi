(async function () {
  const FRAME = { face: { h: 0.35, label: "顔アップ" }, bust: { h: 0.7, label: "バストアップ" }, knee: { h: 1.2, label: "膝上" }, full: { h: 1.9, label: "全身" } };
  const PRESETS = {
    live: [["最前・柵前", 1.5], ["2〜3列目", 3], ["フロア中央", 6], ["後方", 10]],
    session: [["個撮・寄り", 1.5], ["個撮・引き", 3], ["囲み撮影", 4.5]],
    cos: [["寄り", 1.5], ["標準", 3], ["背景込み", 6]]
  };
  const DEFAULT = { live: { d: 3, frame: "bust" }, session: { d: 2, frame: "bust" }, cos: { d: 3, frame: "full" } };
  const PRICE = { low: "〜5万円", mid: "5〜12万円", high: "12万円〜" };
  const PRICE_RANK = { low: 1, mid: 2, high: 3 };
  const MOUNT_LABEL = { E: "Sony E", RF: "Canon RF", Z: "Nikon Z", X: "FUJIFILM X", MFT: "マイクロフォーサーズ" };
  const SYS = {
    all: {},
    "sony-ff": { mount: "E", fmt: "FF", crop: 1 },
    "sony-apsc": { mount: "E", fmt: "APSC", crop: 1.5 },
    "canon-ff": { mount: "RF", fmt: "FF", crop: 1 },
    "canon-apsc": { mount: "RF", fmt: "APSC", crop: 1.6 },
    "nikon-ff": { mount: "Z", fmt: "FF", crop: 1 },
    "nikon-dx": { mount: "Z", fmt: "APSC", crop: 1.5 },
    fuji: { mount: "X", fmt: "APSC", crop: 1.5 },
    mft: { mount: "MFT", fmt: "MFT", crop: 2 }
  };
  const naturalCrop = (l) => (l.fmt === "FF" ? 1 : l.fmt === "MFT" ? 2 : l.mount === "RF" ? 1.6 : 1.5);

  const GUIDE = {
    live: {
      title: "ライブハウスの設定の目安",
      set: [["シャッター", "1/250〜1/500秒"], ["絞り", "開放〜F2.8"], ["ISO", "オート 上限6400〜12800"], ["AF", "AF-C ＋ 顔・瞳検出"]],
      tips: ["激しく踊る曲では1/500秒以上にすると止まりやすくなります。", "LED照明では電子シャッターだと縞（バンディング）が出やすいので、メカシャッターがおすすめです。", "赤や青の照明が強い場面はRAWで撮っておくと、あとで色を整えられます。", "センサーが小さいほど高感度ノイズが出やすいので、APS-Cやマイクロフォーサーズでは明るい単焦点が効きます。", "フラッシュはほぼ全ての現場で禁止です。"],
      dofF: [1.2, 1.4, 2, 2.8]
    },
    session: {
      title: "撮影会の設定の目安",
      set: [["シャッター", "1/125〜1/250秒"], ["絞り", "F1.4〜2.8"], ["ISO", "100〜1600"], ["AF", "AF-S/AF-C ＋ 瞳検出"]],
      tips: ["開放で顔アップを撮るとピントの幅が数cmしかありません。下の被写界深度を目安に。", "囲み撮影では人の頭が入りやすいので、少し上から縦位置で狙うのが基本です。", "ストロボやレフ板が使えるかは主催者のルールで確認してください。"],
      dofF: [1.4, 2, 2.8, 4]
    },
    cos: {
      title: "コスプレ撮影の設定の目安",
      set: [["シャッター", "1/200秒前後"], ["絞り", "F2〜5.6"], ["ISO", "100〜800"], ["AF", "AF-S ＋ 瞳検出"]],
      tips: ["衣装や小物まで見せたいときはF4〜5.6まで絞ると全身がくっきり写ります。", "屋外は逆光＋レフ板で肌がきれいに出ます。", "イベント会場の撮影エリアや、撮影時の声かけのルールを事前に確認しましょう。"],
      dofF: [1.4, 2, 2.8, 5.6]
    }
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const form = $("form");
  const val = (name) => form.querySelector(`input[name="${name}"]:checked`).value;
  const r0 = (n) => Math.round(n);
  let showAll = false;

  // データ読み込み
  let LENSES = [], PRICES = { items: {} };
  try {
    LENSES = (await (await fetch("data/lenses.json", { cache: "no-cache" })).json()).lenses;
  } catch (e) {
    $("lenses").innerHTML = `<div class="empty">レンズデータを読み込めませんでした。ページを再読み込みしてください。</div>`;
    return;
  }
  try {
    const r = await fetch("data/prices.json", { cache: "no-cache" });
    if (r.ok) PRICES = await r.json();
  } catch { /* 価格なしでも動く */ }

  const fmtDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  if (PRICES.updatedAt) $("price-updated").textContent = `最終更新は${new Date(PRICES.updatedAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}です`;

  const priceOf = (l) => PRICES.items?.[l.id];
  const tierOf = (l) => priceOf(l)?.tier || l.priceTier;
  const searchUrl = (l) => "https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(l.search) + "/";

  function renderPresets(scene) {
    $("presets").innerHTML = PRESETS[scene].map(([t, d]) => `<button type="button" class="chip" data-d="${d}">${t} ${d}m</button>`).join("");
  }

  // フルサイズ換算で必要な焦点距離
  const reqEquiv = (d, frame, orient) => (orient === "v" ? 36 : 24) * d / FRAME[frame].h;

  function fitOf(eqMin, eqMax, req, isPrime) {
    if (req >= eqMin * 0.92 && req <= eqMax * 1.12) return { kind: "ok", label: isPrime ? "ぴったり" : "ズーム範囲内", score: 0 };
    if (req > eqMax) {
      const r = req / eqMax;
      return r <= 1.6 ? { kind: "crop", label: `トリミング約${r0(100 / (r * r))}%`, score: 1 + (r - 1) } : null;
    }
    const r = req / eqMin;
    return r >= 0.75 ? { kind: "tight", label: "少しきつめ", score: 2 + (1 - r) } : null;
  }

  function dof(f, N, dM, coc) {
    const s = dM * 1000;
    const H = (f * f) / (N * coc) + f;
    const near = (s * (H - f)) / (H + s - 2 * f);
    const far = s < H ? (s * (H - f)) / (H - s) : Infinity;
    return { near, far };
  }
  const cm = (mm) => (mm === Infinity ? "∞" : mm >= 1000 ? (mm / 1000).toFixed(2) + " m" : r0(mm / 10) + " cm");

  function scaleSVG(req, picks) {
    const W = 680, left = 230, right = 20, rowH = 26, top = 34;
    const rows = picks.slice(0, 6);
    const H = top + rows.length * rowH + 30;
    const lo = Math.log(20), hi = Math.log(520);
    const x = (v) => left + ((Math.log(Math.min(Math.max(v, 20), 520)) - lo) / (hi - lo)) * (W - left - right);
    const ticks = [24, 35, 50, 85, 135, 200, 300, 450];
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="フルサイズ換算の焦点距離スケールと各レンズの範囲">`;
    ticks.forEach((t) => { s += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 24}"/><text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}</text>`; });
    s += `<line class="axis" x1="${left}" x2="${W - right}" y1="${H - 24}" y2="${H - 24}"/>`;
    s += `<text class="tick" x="${left - 10}" y="${H - 8}" text-anchor="end">換算 mm</text>`;
    rows.forEach((p, i) => {
      const y = top + i * rowH + 8;
      let nm = `${p.lens.mk} ${p.lens.name}`;
      if (nm.length > 30) nm = nm.slice(0, 29) + "…";
      s += `<text class="lname" x="${left - 10}" y="${y + 4}" text-anchor="end">${esc(nm)}</text>`;
      const cls = p.fit.kind === "ok" ? "bar-ok" : "bar-crop";
      if (p.eqMin === p.eqMax) s += `<circle class="${cls}" cx="${x(p.eqMin)}" cy="${y}" r="6"/>`;
      else s += `<rect class="${cls}" x="${x(p.eqMin)}" y="${y - 5}" width="${Math.max(x(p.eqMax) - x(p.eqMin), 4)}" height="10" rx="5"/>`;
    });
    const mx = x(req);
    s += `<line class="marker" x1="${mx}" x2="${mx}" y1="${top - 12}" y2="${H - 24}"/>`;
    s += `<text class="marker-lbl" x="${mx}" y="${top - 18}" text-anchor="${mx > W - 90 ? "end" : "middle"}">必要 換算${r0(req)}mm${req > 520 ? "+" : ""}</text>`;
    return s + "</svg>";
  }

  function card({ lens, crop, eqMin, eqMax, fit }) {
    const fl = lens.min === lens.max ? `${lens.min}mm` : `${lens.min}-${lens.max}mm`;
    const eq = eqMin === eqMax ? `${r0(eqMin)}mm` : `${r0(eqMin)}-${r0(eqMax)}mm`;
    const ap = lens.Fmax ? `F${lens.F}-${lens.Fmax}` : `F${lens.F}`;
    const fmtLabel = lens.fmt === "FF" ? "フルサイズ用" : lens.fmt === "MFT" ? "" : "APS-C用";
    const sysTag = `${MOUNT_LABEL[lens.mount]}${fmtLabel ? "・" + fmtLabel : ""}`;
    const p = priceOf(lens);
    const priceHtml = p
      ? `<div class="price"><b>¥${p.price.toLocaleString("ja-JP")}</b><small>楽天最安・${fmtDate(p.checkedAt)}時点</small></div>`
      : `<div class="price"><small>価格帯の目安 ${PRICE[lens.priceTier]}</small></div>`;
    const href = p?.url || searchUrl(lens);
    return `<article class="lens">
      <div class="top"><div><div class="maker">${esc(lens.mk)}</div><div class="name">${esc(lens.name)}</div></div><span class="fit ${fit.kind}">${fit.label}</span></div>
      <div class="specs"><span><b>${fl}</b>${crop !== 1 ? `（換算${eq}）` : ""}</span><span><b>${ap}</b></span></div>
      ${priceHtml}
      <p>${esc(lens.note)}</p>
      <div class="tags"><span class="tag sys">${sysTag}</span>${(lens.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <a class="buy" href="${esc(href)}" target="_blank" rel="noopener sponsored">${p ? "楽天で見る" : "楽天で価格を見る"}</a>
    </article>`;
  }

  function update() {
    const sysKey = $("system").value, sys = SYS[sysKey], isAll = sysKey === "all";
    const scene = val("scene"), frame = val("frame"), orient = val("orient"), budget = val("budget");
    const d = parseFloat($("dist").value);
    $("dist-out").textContent = d.toFixed(1) + " m";
    const req = reqEquiv(d, frame, orient);
    const sysName = $("system").selectedOptions[0].textContent;

    if (isAll) {
      $("focal").innerHTML = `${r0(req)}<small>mm</small>`;
      $("basis").textContent = "フルサイズで必要な焦点距離";
      $("equiv").textContent = `APS-C 約${r0(req / 1.5)}mm ／ マイクロフォーサーズ 約${r0(req / 2)}mm`;
    } else {
      $("focal").innerHTML = `${r0(req / sys.crop)}<small>mm</small>`;
      $("basis").textContent = `${sysName}で必要な焦点距離`;
      $("equiv").textContent = sys.crop === 1 ? "フルサイズ（換算なし）" : `フルサイズ換算 約${r0(req)}mm`;
    }
    $("summary").textContent = `${d.toFixed(1)}m先の${FRAME[frame].label}を${orient === "v" ? "縦" : "横"}位置で画面いっぱいに撮る場合`;

    const picks = LENSES
      .filter((l) => isAll || (l.mount === sys.mount && (sys.fmt !== "FF" || l.fmt === "FF")))
      .filter((l) => l.scenes.includes(scene))
      .filter((l) => budget === "all" || PRICE_RANK[tierOf(l)] <= PRICE_RANK[budget])
      .map((l) => {
        const crop = isAll ? naturalCrop(l) : sys.crop;
        const eqMin = l.min * crop, eqMax = l.max * crop;
        return { lens: l, crop, eqMin, eqMax, eqF: l.F * crop, fit: fitOf(eqMin, eqMax, req, l.min === l.max) };
      })
      .filter((p) => p.fit);
    picks.sort((a, b) => a.fit.score - b.fit.score || (scene === "live" ? a.eqF - b.eqF : 0) || PRICE_RANK[tierOf(a.lens)] - PRICE_RANK[tierOf(b.lens)]);

    $("scale").innerHTML = picks.length ? scaleSVG(req, picks) : "";
    const LIMIT = 12;
    const shown = showAll ? picks : picks.slice(0, LIMIT);
    $("count").textContent = picks.length ? (picks.length > shown.length ? `${picks.length}本中 上位${shown.length}本` : `${picks.length}本が候補`) : "";
    $("more").hidden = picks.length <= LIMIT || showAll;
    $("more").textContent = `すべて表示（${picks.length}本）`;

    $("lenses").innerHTML = picks.length
      ? shown.map(card).join("")
      : `<div class="empty">この距離と構図に届くレンズが条件内にありません。${req > 200 ? "構図を広げる（バストアップ→膝上など）か、望遠ズームで撮ってトリミングするのが現実的です。" : "予算の条件を広げてみてください。"}</div>`;

    const g = GUIDE[scene];
    $("set-title").textContent = g.title;
    $("settings").innerHTML = g.set.map(([k, v]) => `<div class="setting"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
    $("tips").innerHTML = g.tips.map((t) => `<li>${t}</li>`).join("");
    const crop = isAll ? 1 : sys.crop, f = req / crop, coc = 0.03 / crop;
    $("dof").innerHTML = `<caption>${isAll ? "フルサイズ" : esc(sysName)}・${r0(f)}mm・${d.toFixed(1)}mでピントが合う範囲（被写界深度）</caption>
      <tr><th>絞り</th><th>手前</th><th>奥</th><th>合計の幅</th></tr>` +
      g.dofF.map((N) => { const r = dof(f, N, d, coc); return `<tr><td>F${N}</td><td>${cm(d * 1000 - r.near)}</td><td>${cm(r.far - d * 1000)}</td><td>${cm(r.far - r.near)}</td></tr>`; }).join("");
  }

  form.addEventListener("change", (e) => {
    if (e.target.name === "scene") {
      const sc = e.target.value;
      renderPresets(sc);
      $("dist").value = DEFAULT[sc].d;
      form.querySelector(`input[name="frame"][value="${DEFAULT[sc].frame}"]`).checked = true;
    }
    showAll = false;
    update();
  });
  $("dist").addEventListener("input", update);
  $("presets").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    $("dist").value = b.dataset.d;
    update();
  });
  $("more").addEventListener("click", () => { showAll = true; update(); });
  form.addEventListener("submit", (e) => e.preventDefault());

  renderPresets("live");
  update();
})();
