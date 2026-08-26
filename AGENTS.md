# VibeWrite — Agent 情報

## 常用指令

- `npm run build` — 編譯到 `dist/`（含複製 manifest）
- `npm run watch` — tsc watch（不會複製 manifest，改 manifest 需重跑 build）
- `npm run lint` — biome check（`src` `tests`）
- `xvfb-run -a npx playwright test` — 自動測試；須 xvfb + xdotool 環境，裸跑 `npm test` 會失敗

## 專案結構

- `src/` — TypeScript 源碼（`background.ts` service worker、`content.ts` content script）
- `dist/` — build 產物（gitignore；load unpacked 載入此目錄）
- `tests/` — Playwright 測試與 fixtures

## 鐵律

1. `src/background.ts` 所有事件 listener 必須同步註冊於 top-level：MV3 service worker 休眠喚醒後會重跑 top-level code，`addListener` 前不得有 `await`，否則喚醒瞬間的事件會掉。
2. `src/content.ts` 開頭必須冪等檢查：`dataset.vibewrite` 已存在即不再裝載——每次按鍵都觸發完整注入，Chrome 不去重。

領域語彙見 `CONTEXT.md`。

## 完成定義

三者全綠才算完成：`npx tsc --noEmit`、`npm run lint`、`xvfb-run -a npx playwright test`。

Coding style 事實來源 = `biome.json`（機器可執行），無 prose 描述；新檔案以 `npx @biomejs/biome check --write src tests` 整形。
