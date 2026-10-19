# MCP31LB トップレベルHTTPS 印刷比較テスト

Star 精密 MCP31LB（Bluetooth）を、Star webPRNT Browser（iPad）から
**iframe の外（トップレベルHTTPS）** で印刷し、印刷完了応答（onReceive）が
返るかを検証するための最小ページです。

- Mac不要・追加費用不要。iPad と MCP31LB と Star webPRNT Browser だけで動作。
- このリポジトリには印刷通信テストに必要な HTML / JavaScript / Star公式SDK のみを含みます。
- 顧客情報・予約情報・料金・伝票デザイン・APIキー・認証情報は一切含みません。

## 使い方
1. GitHub Pages 等（HTTPS）で公開する。
2. iPad の Star webPRNT Browser でそのURLを開く。
3. 「① トップレベル印刷テスト」を1回だけ押す。
4. 「ログをテキスト化」でログをコピーして共有する。

## ファイル
- `index.html` … テスト画面（診断ログ・監視タイマー・結果不明保留・重複印刷防止）
- `js/StarWebPrintBuilder.js` / `js/StarWebPrintTrader.js` … Star Micronics 公式 SDK
