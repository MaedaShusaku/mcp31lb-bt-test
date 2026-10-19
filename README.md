# MCP31LB トップレベルHTTPS 印刷比較テスト

Star 精密 MCP31LB（Bluetooth）を、Star webPRNT Browser（iPad）から
**iframe の外（トップレベルHTTPS）** で印刷し、印刷完了応答（onReceive）が
返るかを検証するための最小ページです。

- Mac不要・追加費用不要。iPad と MCP31LB と Star webPRNT Browser だけで動作。
- このリポジトリには **当方で作成したテスト画面（index.html）のみ**を含みます。
- **Star webPRNT SDK は再配布しません。** スター精密の公式公開リポジトリ
  （https://github.com/star-micronics/starwebprnt-sdk ）の配布物を
  jsDelivr CDN 経由で参照します（版は検証済みコミットに固定）。
- 顧客情報・予約情報・料金・伝票デザイン・APIキー・認証情報は一切含みません。

## 使い方
1. GitHub Pages（HTTPS）で公開する。
2. iPad の Star webPRNT Browser でそのURLを開く。
3. 「① トップレベル印刷テスト」を1回だけ押す。
4. 「ログをテキスト化」でログをコピーして共有する。

## ファイル
- `index.html` … テスト画面（診断ログ・監視タイマー・結果不明保留・重複印刷防止）
- SDK（StarWebPrintBuilder.js / StarWebPrintTrader.js）は公式CDN参照（同梱せず）
