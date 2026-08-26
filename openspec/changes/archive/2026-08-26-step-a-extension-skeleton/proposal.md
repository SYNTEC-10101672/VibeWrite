# Proposal: step-a-extension-skeleton

## Why

VibeWrite 的產品核心是「選字 → 快捷鍵 → AI 改善 → 寫回」，而這一切的命脈是「按鍵 → 注入 content script」這條鏈。目前 repo 是空的（無任何程式碼），需要先立起 extension 骨架並用自動測證明這條命脈活著，後續功能（step b：Settings 頁 + AI 溝通管道；step c：一鍵改善本體——selection、預覽 UI、寫回）才有地基可疊。

## What Changes

## What Changes

- 建立 TypeScript 專案骨架（`tsconfig.json`、`package.json`、`dist/` build 產物）
- 建立 coding style 機制：Biome（formatter + linter 合一，官方 preset、格式相容 Prettier），`biome.json` 為 style 唯一事實來源（機器可執行），不另寫 prose 描述
- 建立專案層級 `AGENTS.md`：agent 換事情報（常用指令、專案結構、MV3 鐵律、完成定義），coding style 僅一行指向 `npm run lint`
- 建立 MV3 `manifest.json`：註冊 `commands` 快捷鍵 `Ctrl+M`（default 與 mac 同鍵），權限 `["activeTab", "scripting"]`
- 建立 `src/background.ts`（service worker）：監聽 `onCommand`，以 callback 附帶的 `tab` 參數對該分頁執行 `chrome.scripting.executeScript({ files: ['content.js'] })`
- 建立 `src/content.ts`：冪等防護（檢查 `dataset.vibewrite` 已存在則不重複載入）+ 設 marker `document.documentElement.dataset.vibewrite = 'injected'` + `console.log` 供手動 QA
- 建立 Playwright 自動測：`launchPersistentContext` 載入 `dist/` extension、本地測試頁、`xdotool` 送真 OS 層按鍵、斷言 marker
- 已知限制（刻意的，不處理）：限制頁面（`chrome://` 內部頁、Web Store）注入必失敗 → 安靜失敗只 log；無痕視窗預設不啟用 → 按鍵無反應

## Capabilities

### New Capabilities

- `shortcut-injection`: 快捷鍵觸發的 content script 注入鏈——command 註冊、按鍵監聽、冪等注入、可斷言的注入痕跡

### Modified Capabilities

（無——首個 change，無既有 spec）

## Impact

- 新增 repo 檔案：`manifest.json`、`src/background.ts`、`src/content.ts`、`tests/`（fixture + spec）、`playwright.config.ts`、`tsconfig.json`、`package.json`、`biome.json`、`AGENTS.md`、`.gitignore`
- 新增 dev dependencies：`typescript`、`@types/chrome`、`@types/node`、`@playwright/test`、`@biomejs/biome`
- 更新 `README.md`：手動 QA 步驟與無痕視窗說明（目前僅一行專案描述）
- 測試 infra 依賴：Linux server 已裝 `xvfb-run`、`xdotool`、playwright chromium（spike 驗證過）
- 不影響任何現有程式碼（greenfield）
