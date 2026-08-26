# Design: step-a-extension-skeleton

## Context

- Greenfield repo：無任何程式碼，僅 `README.md` 與 `CONTEXT.md`（glossary）
- 產品願景：任何網頁上「選字 → 快捷鍵 → AI 一鍵改善 → 寫回」。整體開發分三步：本 change（step a，骨架與注入鏈）→ step b（Settings 頁、`chrome.storage.sync`、OpenAI 相容 API 管道）→ step c（selection 抓取、before/after 預覽 UI、寫回 textarea/contenteditable、剪貼簿 fallback）
- 開發環境：Linux server（Playwright + chromium + `xvfb-run` + `xdotool` 已齊，spike 於 `/tmp/vibewrite-spike` 驗證過全鏈）；使用者手動 QA 在 Mac / Windows（無 Node，靠 server build `dist/` 交付）
- spike 結論（已實證）：
  - `page.keyboard.press` 走 CDP 合成鍵，**到不了** Chrome 瀏覽器層 accelerator → 測試必死
  - `Xvfb :99` + `xdotool key` 送真 OS 層按鍵 → command 觸發 → `executeScript` → marker 全鏈通
  - 純 `["activeTab", "scripting"]`（無 host_permissions）即足夠：command 按下本身授予 activeTab

## Goals / Non-Goals

**Goals:**

- 按 `Ctrl+M` → 對按鍵當下的分頁注入 content script，留下可斷言的 DOM marker
- 全鏈自動測（按鍵 → command → 注入 → marker），可在 Linux server 無頭跑
- TypeScript 工具鏈（`tsc`，無 bundler）定型檔案結構，step b/c 直接沿用
- Coding style 機制（Biome）與 agent 情報（AGENTS.md）在第一批 code 前就位，之後所有 code 生下來就符合

**Non-Goals:**

- AI 呼叫、selection、預覽 UI、寫回（step b/c）
- Settings 頁（step b）
- 注入失敗的使用者可見回饋（badge 等，未來步驟）
- `chrome.runtime.onMessage` 任務觸發管道（step c；本步只鋪冪等防護）

## Decisions

### D1. 快捷鍵 `Ctrl+M`（default 與 mac 同鍵）

- 原案 `Ctrl+Shift+E` 難按。候選 `Ctrl+Q` / `Ctrl+M` 皆經 spike 實測可用且無 Chrome / Notion 衝突；`Ctrl+Space` 撞中文輸入法、`Ctrl+E` 被 Chrome 佔用，出局
- Mac 不用 `Cmd` 系列：`Cmd+M`（縮小視窗）、`Cmd+Q`（離開）皆系統釘死，故 mac 也設 `Ctrl+M`，跨機一致
- `suggested_key` 只是建議值，使用者可於 `chrome://extensions/shortcuts` 自行改，不影響 code

### D2. 注入方式：`executeScript({ files: ['content.js'] })`

- `func` 形式有序列化限制，step c 的 content script 會長大（UI、listener）；檔案式一步到位
- 含義：`dist/content.js` 必須存在於 load unpacked 目錄，build 流程負責产出

### D3. Tab 來源：`onCommand` callback 附帶的 `tab` 參數

- 不用 `tabs.query({ active: true, currentWindow: true })`：MV3 service worker 無「目前視窗」概念，多視窗時可能注錯分頁
- callback 的 `tab` 是 Chrome 目擊事實（按鍵發生在哪個 tab），零推理、少一次 API 呼叫

### D4. 冪等防護：marker 檢查在 content script 開頭

- 每次按鍵都會完整執行一次注入（Chrome 不去重）；step c 的 listener / UI 疊兩份會真的壞
- `content.ts` 開頭：`if (document.documentElement.dataset.vibewrite) return;`
- marker 語義 = 「此分頁已裝載」；重複觸發（step c）靠 `chrome.tabs.sendMessage`，本步不實作但此架構已預留

### D5. SW 紀律：listener 同步註冊於 top-level

- MV3 SW 閒置約 30 秒即休眠，事件會喚醒它並重跑 top-level code；`addListener` 前若有 `await`，喚醒瞬間到註冊完成之間的事件會掉
- 規則寫死：`background.ts` 所有事件 listener 放檔案最頂層、同步註冊；非同步工作（如讀 storage）等事件進來再做

### D6. 語言與 build：TypeScript + `tsc`，無 bundler

- 使用者拍板。專案將超過 3 個檔案且 step c 邏輯複雜，型別在 CI 擋得住值得
- dev loop：`tsc --watch` 自動編 → `chrome://extensions` reload extension（後者本來就要做，增量摩擦僅一個背景 watch）
- build script：`tsc && cp manifest.json dist/`；`dist/` 進 `.gitignore`；交付走「server build → 壓 zip 給使用者」路徑 B

### D6a. Coding style：Biome，config 即事實來源

- 選 Biome（formatter + linter 合一）而非 Prettier + ESLint 組合：一個 dev dep、一份 `biome.json`、一條 `npm run lint` 同時驗格式與慣例；格式輸出相容 Prettier，逃離成本趨近零
- `biome.json` 用 `@biomejs/biome init` 官方 preset，不另行調校（避免 bikheshed，工具預設 = 最多人用的樣子）
- 原則：style 的事實只存在於機器可執行之處（`biome.json` + `npm run lint`）；不寫 prose 版 style 文件、不做成 skill——兩份事實必然漂移
- 專案層級 `AGENTS.md` 只放一行指令（`npm run lint`）與完成定義，不放規則內容

### D7. 測試掛載：`launchPersistentContext` + `Xvfb` + `xdotool`

- MV3 service worker 生命週期在一般 `launch()` 下不正常，必須 persistent context（Playwright 官方 extension pattern）
- 測試流程：fixture 覆寫 launch → 開本地測試頁（`context.route` fulfill，免 HTTP server）→ `bringToFront()`（無 WM 環境 focus 靠它，spike 驗證）→ 子進程 `xdotool key ctrl+m`（繼承 `DISPLAY`）→ `waitForFunction` 輪詢 marker
- 跑法：`xvfb-run -a npx playwright test`；spec 內以 `execSync('xdotool key ctrl+m')` 送鍵
- 斷言目标：`document.documentElement.dataset.vibewrite === 'injected'`

### D8. 邊際條件處理（grill 結案）

| 情境 | 處理 |
|---|---|
| 限制頁面（`chrome://` 內部頁、Web Store） | `executeScript` reject → catch 只 log（SW console），使用者無感。已知限制，非 bug |
| 連按兩次 | D4 冪等防護吸收 |
| 無痕視窗 | extension 預設不啟用，按鍵無反應。README 一句話帶過怎麼開 |

## Risks / Trade-offs

- [`xdotool` 送鍵依賴視窗 focus] → 測試前必 `bringToFront()` + `--window-position=0,0` 固定視窗位置；spike 已驗證此組合穩定
- [SW 被休眠後 `commands.getAll` 顯示的綁定與實際行為不一致（Chrome 少數版本 bug）] → 不依賴 `getAll` 做斷言，直接以 marker 為準
- [`Ctrl+M` 未來可能與某網站自訂快捷鍵撞（網頁內 handler 攔截）] → Chrome 層 command 優先於網頁 keydown；真撞時使用者可自行改鍵，不影響架構
- [Mac 實機行為未自動測] → 手動 QA 清單首項：Mac load unpacked → `Ctrl+M` → F12 Elements 看 `<html data-vibewrite="injected">`
- [CI 環境需 xvfb + xdotool] → 已裝；`.github` 或未來 runner 變更時需重驗（目前僅本機 server 跑）

## Migration Plan

Greenfield 無遷移。Rollback = 刪除新增檔案。

## Open Questions

（無——決策已全部拍板，見 proposal 與 grill 紀錄）
