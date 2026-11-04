# ライブハウス撮影ナビ

地下アイドルのライブ・撮影会・コスプレ撮影向けのレンズ選びツールです。
距離と構図から必要な焦点距離を計算し、5マウント約55本のレンズを、楽天市場の最新価格とアフィリエイトリンク付きで表示します。

```
site/                 公開するサイト本体
  index.html          ツール本体
  about.html          運営者情報
  privacy.html        プライバシーポリシー・広告について
  assets/             CSS・JS・OGP画像・ファビコン
  data/lenses.json    レンズのマスターデータ（手で編集する）
  data/prices.json    価格データ（毎日自動で更新される）
scripts/
  fetch-prices.mjs    楽天APIで価格を取得
  match.mjs           検索結果からそのレンズの新品だけを選ぶロジック
  build.mjs           dist/ を生成（URL差し込み・sitemap・robots・CNAME）
test/                 照合ロジックのテスト（npm test）
.github/workflows/    毎朝5時台に価格更新 → GitHub Pagesへ公開
site.config.json      サイトURL・運営者情報
```

外部パッケージは使っていません。必要なのは Node.js 20 以上だけです。

---

## 公開までの手順

### 1. 運営者情報を書く

`site.config.json` を開いて、`operatorName`（ハンドルネームで可）、`operatorProfile`、`contact`（XのアカウントやGoogleフォームのURL）を書き換えます。
運営者情報と問い合わせ先は、アフィリエイトの審査やGoogleの評価で見られる部分です。

### 2. GitHubにリポジトリを作る

1. GitHubで新しいリポジトリを作る（例: `livehouse-navi`。公開リポジトリならPagesは無料です）
2. このフォルダをpushする

```bash
git remote add origin https://github.com/<ユーザー名>/livehouse-navi.git
git push -u origin main
```

3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする

この時点で `https://<ユーザー名>.github.io/livehouse-navi/` に公開されます（価格はまだ空で、目安の価格帯が表示されます）。

### 3. 楽天アフィリエイトと楽天APIの登録

**楽天アフィリエイト**（報酬を受け取るため）

1. 楽天会員でログインし、楽天アフィリエイトに登録する
2. 「アフィリエイトID」を控える

**楽天ウェブサービス**（価格を取得するため）

楽天のAPIは2026年に新しくなり、旧APIは5月14日に停止しました。新しい形式のアプリIDとアクセスキーが必要です。

1. Rakuten Developers で新規アプリを登録する
2. アプリの種類は **「Webアプリケーション」** を選び、許可するサイトURLに公開するドメインを登録する
   - 「API/バックエンドサービス」型は呼び出し元のIPアドレスを登録する方式ですが、GitHub ActionsはIPアドレスが毎回変わるので使えません
3. **アプリID**（UUID形式）と**アクセスキー**（`pk_` で始まる）を控える。アクセスキーは画面からコピーすると途中で切れることがあるので、文字数を確認してください

### 4. GitHubに鍵とURLを登録する

リポジトリの **Settings → Secrets and variables → Actions**

| 種類 | 名前 | 値 |
|---|---|---|
| Secret | `RAKUTEN_APP_ID` | アプリID |
| Secret | `RAKUTEN_ACCESS_KEY` | アクセスキー |
| Secret | `RAKUTEN_AFFILIATE_ID` | アフィリエイトID |
| Variable | `SITE_URL` | `https://あなたのドメイン`（末尾の `/` なし） |
| Variable | `CUSTOM_DOMAIN` | `あなたのドメイン`（例: `livehouse-navi.com`） |

登録したら **Actions → 価格更新とサイト公開 → Run workflow** で手動実行します。ログに `✔ fuji-xf90f2 ¥95,800` のような行が出れば成功です。以後は毎日 日本時間5:23 に自動で更新されます。

### 5. 独自ドメインをつなぐ

1. ドメインを取得する（Cloudflare Registrar、お名前.com、Xserverドメインなど。`.com` で年1,500〜2,000円前後）
2. ドメイン会社のDNS設定で次を登録する

| タイプ | 名前 | 値 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `<ユーザー名>.github.io` |

3. GitHubの **Settings → Pages → Custom domain** にドメインを入れて保存し、数分〜数時間後に **Enforce HTTPS** にチェックを入れる
4. 乗っ取り防止のため、GitHubの **Settings（アカウント）→ Pages → Verified domains** でドメインの所有確認をしておくと安全です

### 6. 公開後にやること

- Google Search Console にドメインを登録し、`https://あなたのドメイン/sitemap.xml` を送信する
- ページ上部の「PR」表記は消さない（ステマ規制への対応です）
- Amazonアソシエイトに参加したら、`privacy.html` のコメントアウトされた一文を有効にする

---

## 日々の運用

**レンズを追加・修正する**：`site/data/lenses.json` を編集してpushするだけです。

- `match`：楽天の商品名との照合ルール。正規化（全角→半角、小文字化、記号と空白を除去）した商品名に対して、内側の配列は「どれか1つ」、外側は「すべて」が含まれていれば一致とみなします
- `exclude`：含まれていたら除外する語。後継モデルや別マウント版との混同を防ぎます（例: `a058z`）
- `priceTier`：価格が取れなかったときに表示する目安
- 追加したら `npm test` で必須項目の抜けやIDの重複をチェックできます

**価格をローカルで試す**

```bash
cp .env.example .env   # 値を入れる
set -a; . ./.env; set +a
npm run prices -- --only=fuji-xf90f2
npm run serve          # http://localhost:3000 で確認
```

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| `accessKey must be present` | アクセスキーのSecretが空か、名前が違う |
| `Invalid Access Key`（403） | キーの値が途中で切れている。再コピーして文字数を確認 |
| `REFERRER_MISSING` や `Authentication service error`（503） | アプリ種別が「Webアプリケーション」になっているか、`SITE_URL` が登録したサイトURLと一致しているかを確認 |
| 404 | APIのバージョン違い。Actionsの環境変数に `RAKUTEN_API_VERSION=20220601` を足して試す |
| 特定のレンズだけ「一致する新品が見つかりません」 | `lenses.json` の `search` と `match` を、実際の楽天の商品名に合わせて調整 |

価格の取得に失敗した日は、前回の価格のまま公開されます（サイトは止まりません）。
