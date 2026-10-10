# 財經脈動 Market Pulse

五個財經 RSS 來源的新聞面板，提供標題跑馬燈、公司與主題文字雲、新聞關鍵字標籤，以及公司簡稱／全名／股票代碼搜尋。

線上網站：https://market-pulse-eason-1010.silkyhorse.chatgpt.site/

## 本機啟動

安裝 Node.js 22.13 以上版本（建議 Node.js 24），在專案目錄執行：

```sh
node local/server.mjs
```

開啟 http://127.0.0.1:4188/ 。本機版本不需要安裝 npm 套件。Windows 也可以雙擊 `local/啟動面板.cmd`。

本機服務只監聽 loopback 位址，每五分鐘收集一次來源，快取保存於 `.cache/rss/`；該目錄不納入 Git。RSS 提供的全部項目皆會讀取，沒有十則上限，但各來源自己的近期項目數不同。

## 功能與資料

- MoneyDJ 財經、鉅亨台股、中央社財經、中央社科技、經濟日報。
- 依網址與標題去重，顯示台北時間，點擊標題開啟原始新聞。
- 熱詞計算涵蓋所有已載入新聞，每篇新聞對同一詞只計一次，依標題命中、來源樣本量、主題類型計分。
- 文字雲全部橫向顯示，點擊熱詞或新聞標籤可篩選新聞。
- `data/taiwan-companies.csv` 是使用者提供的 1,988 筆公司資料；`local/companies.json` 是清理後的名稱與代碼。辨識詞庫嵌入 `local/word-cloud.js`。
- 公司全名、簡稱與代碼會合併成同一個公司標籤；保留國際公司別名與財經主題。
- 高明鐵（4573）是依新聞原文確認的補充詞條，原始 CSV 未包含它。
- 使用詞語邊界、同名規則、年份與金額排除減少誤判。這是規則式辨識，仍可能有漏判或誤判。

新聞內容由原始媒體提供，RSS 僅包含近期新聞或摘要。GitHub 儲存庫不包含已抓取的新聞快取。

## 修改與測試

修改 `local/index.html` 的版面、`local/word-cloud.js` 的關鍵字規則後，執行：

```sh
node scripts/sync-dashboard.mjs
node tests/company-keywords.mjs
node tests/word-cloud.mjs
```

同步程式會把關鍵字程式嵌入本機 HTML，並更新線上版的 HTML 模組。測試涵蓋公司全名、代碼、重複計數、年份與金額誤判、關鍵字搜尋，以及文字雲邊界與碰撞。

## 線上版架構

線上版使用 Vinext 與 Cloudflare Workers，網站首頁由 `build/sites-worker.ts` 接入 `lib/dashboard-server.ts`。D1 保存近七天收集到的 RSS 快照，來源暫時失敗時回傳上一份快取。使用者開啟網站後，每五分鐘更新；目前沒有雲端背景排程。

```text
local/                 不需要 npm 依賴的本機版本
lib/dashboard-html.ts  同步產生的線上 HTML
lib/dashboard-server.ts 線上 RSS API、來源限制與 D1 快取
build/sites-worker.ts  Workers 入口
db/schema.ts           新聞快照資料表
drizzle/               D1 migration
data/                  原始公司 CSV
tests/                 關鍵字及文字雲測試
```

若要建置完整線上版：

```sh
npm ci
npm run sync:dashboard
npm run build
```

已有的 Sites 發布設定位於 `.openai/hosting.json`。部署到新的 Sites 專案時必須改用新專案 ID，保留 D1 綁定名稱 `DB`；透過 Sites 發布時會套用 migrations。單純推送 GitHub 不會自動更新既有 Sites 網站，也不是 GitHub Pages 靜態部署。

Vinext starter 的執行環境、預覽與本機 D1 指令請參考 [docs/vinext-starter.md](docs/vinext-starter.md)。
