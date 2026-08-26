# VibeWrite

使用 AI 來調整寫作：任何網頁上「選字 → 快捷鍵 → AI 一鍵改善 → 寫回」。

## 手動 QA

1. `npm run build`（或取得 build 好的 `dist/`）
2. Chrome 開啟 `chrome://extensions` → 開啟「開發人員模式」→「載入未封裝」→ 選擇 `dist/`
3. 到任意可注入的網頁按 `Ctrl+M`
4. F12 → Elements：`<html>` 出現 `data-vibewrite="injected"` 即成功（Console 會顯示 `[vibewrite] content script loaded`）

已知限制（非 bug）：`chrome://` 內部頁、Web Store 等限制頁面注入必失敗，按鍵無反應屬預期。

無痕視窗：`chrome://extensions` → VibeWrite「詳細資料」→ 開啟「在無痕模式下允許」。

## 散佈（無 Node 環境的機器）

在 server 執行 `npm run build`，將 `dist/` 壓成 zip 傳給使用者；解壓後以「載入未封裝」安裝，步驟同上。

