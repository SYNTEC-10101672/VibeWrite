# VibeWrite — 開發計畫（v0.1）

> Chrome Extension：任何網頁上「選字 → 快捷鍵 → AI 一鍵改善 → 寫回」
> 替代沒訂閱的 Notion AI 改善寫作功能。

## 已定案的決策

| 項目 | 決策 |
|---|---|
| 形式 | Chrome Extension（Manifest V3） |
| 觸發 | 快捷鍵 `Ctrl+Shift+E`（Mac: `Cmd+Shift+E`） |
| 權限 | `activeTab`（按鍵當下才作用於當前分頁，不安裝常駐、無安裝警告） |
| AI backend | Z.ai（OpenAI 相容 API / GLM 模型），endpoint 可設定 |
| 功能 | v0.1 一鍵改善（單一動作）；多動作選單留 v0.2 |
| 之後 | Notion 寫回 adapter、浮動按鈕、WeCom（桌面版不可行，出局） |

## 開發步驟

### a. Extension 骨架

- Manifest V3 + `commands` 註冊快捷鍵
- 按快捷鍵 → 對當前分頁執行 content script（activeTab 模式）
- Content script 先只做 `console.log` 證明活著

驗證：
- Server 自動測：Playwright（chromium + xvfb-run）載入 unpacked extension，開本地測試頁，證明 content script 有注入
- 手動（你的電腦）：`chrome://extensions` → 開發人員模式 → 載入未封裝 → 按 `Ctrl+Shift+E` → F12 console 看到 log

### b. AI 溝通管道

- Settings 頁（Options page）：endpoint / API key / model name，存 `chrome.storage.sync`（跨裝置同步）
- Service worker 用 `fetch` 呼 OpenAI 相容 API（`/chat/completions`）
- 按快捷鍵 → 送一段硬編文字 → 回傳結果 log 出來

驗證：
- Server 自動測：mock 一個 OpenAI 相容的本地 HTTP server，證明 request 格式正確、response 有解析
- 手動：填真實 Z.ai key，按快捷鍵，console 看到 GLM 回的文字

### c. 一鍵改善本體（工程量大宗）

- 取得選取文字（selection API）
- 套用 system prompt（放在 settings，可自行調整）
- 預覽 UI：彈窗顯示 before/after，Enter 接受、Esc 取消（Shadow DOM，樣式不與網頁打架）
- 寫回：
  - `textarea` / `input`：直接改 value
  - `contenteditable`：`document.execCommand('insertText')` 或 dispatch `beforeinput`
  - 寫回失敗 → fallback：結果放剪貼簿 + 顯示「已複製」

驗證：
- Server 自動測：本地測試頁放 textarea + contenteditable，Playwright 模擬選字 → 觸發（測試用入口，快捷鍵本身瀏覽器層級模擬不可靠）→ 斷言文字被替換
- 手動：Notion 實站測寫回（最難的一關，進度條在這裡）

## 測試環境

| 環境 | 用途 |
|---|---|
| Linux server（本機） | Playwright + chromium + xvfb-run 自動測（TDD 主力） |
| 你的電腦（Mac / 公司 Windows） | 手動 QA：load unpacked、真實快捷鍵、Notion 實站 |
