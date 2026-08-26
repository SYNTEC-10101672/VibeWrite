# Tasks: step-a-extension-skeleton

## 1. 專案骨架

- [x] 1.1 建立 `package.json`：`"scripts": { "build": "tsc && cp manifest.json dist/", "watch": "tsc --watch", "lint": "biome check src tests", "test": "playwright test" }`，`devDependencies`: `typescript`、`@types/chrome`、`@types/node`、`@playwright/test`、`@biomejs/biome`
- [x] 1.2 建立 `tsconfig.json`：`"target": "ES2022"`、`"module": "ES2022"`、`"moduleResolution": "bundler"`、`"outDir": "dist"`、`"rootDir": "src"`、`"strict": true`；service worker 與 content script 各自是 entry（無 bundle），以 `scripts` 陣列或兩次編譯保證 `dist/background.js`、`dist/content.js` 都產出
- [x] 1.3 建立 `biome.json`：`npx @biomejs/biome init` 產生官方預設 config（formatter 相容 Prettier 風格），不改動 preset；此後所有新檔案以 `npx @biomejs/biome check --write src tests` 整形
- [x] 1.4 建立 `.gitignore`：`node_modules/`、`dist/`、`playwright-report/`、`test-results/`
- [x] 1.5 建立 `manifest.json`（repo 根目錄）：`manifest_version: 3`、`permissions: ["activeTab", "scripting"]`、`background.service_worker: "background.js"`、`commands.trigger.suggested_key: { "default": "Ctrl+M", "mac": "Ctrl+M" }`

## 2. Extension 本體

- [x] 2.1 建立 `src/background.ts`：top-level 同步註冊 `chrome.commands.onCommand.addListener((command, tab) => {...})`；handler 內 `chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })`，`.catch()` 只 `console.warn`（安靜失敗，不得重試）
- [x] 2.2 建立 `src/content.ts`：開頭冪等檢查 `if (document.documentElement.dataset.vibewrite) return;`；設 `document.documentElement.dataset.vibewrite = 'injected'`；`console.log('[vibewrite] content script loaded')`
- [x] 2.3 執行 `npm install && npm run build`，確認 `dist/` 產出 `manifest.json` + `background.js` + `content.js` 三檔

## 3. 自動測試

- [x] 3.1 建立 `playwright.config.ts`：`testDir: './tests'`、單一 project（chromium）、禁用內建 HTTP server 設定（fixture 用 `context.route` 免 server）
- [x] 3.2 建立 `tests/fixtures/test.html`：極簡 HTML（`<h1>VibeWrite test page</h1>` + 一個 `textarea`，後者供 step c 沿用）
- [x] 3.3 建立 `tests/injection.spec.ts`：
  - fixture 覆寫 launch：`chromium.launchPersistentContext('')`（暫存 profile 目錄）+ args `--disable-extensions-except=<repo>/dist`、`--load-extension=<repo>/dist`、`--no-first-run`、`--window-position=0,0`
  - 測前 `npm run build`（globalSetup 或 fixture 內 `execSync` 擇一，保證 dist 新鮮）
  - 測項 1（全鏈）：`context.route('http://local.test/', fulfill fixture HTML)` → `page.goto` → `page.bringToFront()` → `execSync('xdotool key ctrl+m')`（環境須已有 `DISPLAY`）→ `page.waitForFunction(() => document.documentElement.dataset.vibewrite === 'injected')` 斷言 marker
  - 測項 2（冪等）：marker 存在後再 `xdotool key ctrl+m` 一次 → 等 1 秒 → 斷言無第二層副作用（行為不變，marker 值仍 `'injected'`）
- [x] 3.4 執行 `xvfb-run -a npx playwright test`，全綠

## 4. 收尾

- [x] 4.1 建立 `AGENTS.md`（repo 根目錄，極簡）：
  - 常用指令：`npm run build` / `npm run watch` / `npm run lint`（= `biome check src tests`）/ `xvfb-run -a npx playwright test`
  - 專案結構：`src/`（TS 源碼）、`dist/`（build 產物，gitignore，load unpacked 指此）、`tests/`（Playwright + fixtures）
  - 鐵律 1：`src/background.ts` 所有事件 listener 必須同步註冊於 top-level（MV3 service worker 休眠喚醒後重跑 top-level code，註冊前不得有 await）
  - 鐵律 2：content script 開頭必須冪等檢查（`dataset.vibewrite` 已存在即 return）
  - 領域語彙見 `CONTEXT.md`
  - 完成定義：`npx tsc --noEmit` + `npm run lint` + `xvfb-run -a npx playwright test` 三者全綠
  - coding style 事實來源 = `biome.json`（機器可執行），不另寫 prose 描述
- [x] 4.2 更新 `README.md`：手動 QA 步驟（load unpacked `dist/`、`Ctrl+M`、F12 Elements 看 `data-vibewrite`）、無痕視窗開啟方式一句話（`chrome://extensions` → 詳細資料 → 在無痕模式下允許）、散佈路徑 B 說明（server build → zip `dist/`）
- [x] 4.3 `git add` 全部新檔案並 commit（訊息：`feat: step a extension skeleton`）

## Tests

- [x] T1: build 產出完整可載入
  > Command: `npm run build && ls dist/`
  > Expected: 列出 `background.js  content.js  manifest.json`（三檔齊全，exit code 0）

- [x] T2: 全鏈注入自動測通過
  > Command: `xvfb-run -a npx playwright test`
  > Expected: 全部 test passed（exit code 0）；report 顯示 marker 斷言 `=== 'injected'` 成功

- [x] T3: 型別檢查通過
  > Command: `npx tsc --noEmit`
  > Expected: 無任何錯誤輸出（exit code 0）

- [x] T4: coding style 檢查通過
  > Command: `npm run lint`
  > Expected: biome check 無任何 error/diagnostic（exit code 0）

- [x] T5: 權限組零警告（人工檢核點，自動化豁免；2026-08-26 Mac 實機 QA 通過：零警告、Ctrl+M 注入 Notion 成功）
  > Command: 手動：`chrome://extensions` → Load unpacked `dist/` → 觀察安裝流程
  > Expected: Chrome 不顯示權限警告對話框；`chrome://extensions/shortcuts` 顯示 VibeWrite 的 trigger 綁 `Ctrl+M`
  > 豁免說明：安裝警告與快捷鍵 UI 無對應自動化 API，屬人工 QA（Mac 首測一併執行）
