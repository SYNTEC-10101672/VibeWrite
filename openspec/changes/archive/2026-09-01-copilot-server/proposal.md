# Proposal: copilot-server

## Why

VibeWrite 的 AI 命脈需要一個後端。使用者的選擇（2026-09-01 探索討論定案）：GitHub Copilot 訂閱的 AI credits 用不完，且官方 `@github/copilot-sdk` 明文支援「自己的 app 代表使用者呼叫」（有別於 Z.ai coding plan 的條款灰區）——條款最乾淨、額度零成本。Spike 已實證整條鏈在目標 container 可行（SDK 安裝、CLI runtime 執行、device flow 登入、真實對話、成本實測）。此 change **只做 server**，不碰 extension——extension 管線是下一個 change。

## What Changes

- 新增 `server/` 自包含子專案：`package.json`（runtime dep 僅 `@github/copilot-sdk@1.0.11`）、`tsconfig.json`、`ecosystem.config.js`（pm2）、`.env.example`、`restart.sh`
- 新增 `server/src/main.ts`：原生 `node:http`（零框架）實作 `POST /v1/chat/completions`（OpenAI 相容形狀）：
  - `X-VW-Key` header 驗證，缺失或錯誤 → 401（不觸發 SDK 呼叫、零 credits 消耗）
  - 非 JSON body 或缺 `messages` → 400
  - request body 超過 64KB → 413
  - `model` 欄位接受任意值但一律使用 `COPILOT_MODEL`（預設 `gpt-5-mini`）；回應的 `model` 欄位回填實際使用的模型
  - 每個請求建立一個 per-request session 呼叫 Copilot SDK，60 秒 timeout 超時 → 500
  - 任何 SDK／GitHub 端錯誤（token 過期、credits 用完、限流）→ catch-all 500 ＋ 原始錯誤訊息
  - 最小結構化 log（時間、狀態碼、耗時；**不記** prompt／回應內容與 secret）
- 部署配置：pm2 常駐（container PID 1 是 sshd，無 init/cron）＋ `pm2-logrotate`（1MB×3 份硬上限）
- 修改 `README.md`：部署步驟、`restart.sh` 說明（冪等：死了救活／活著換新版）、token 過期重登 SOP、Windows 手動 QA 指令（含 PowerShell 引號地獄的 `body.json` 備案）
- 修改 `AGENTS.md`：常用指令加 server 區塊（build／restart／測試）
- 修改 `.gitignore`：`server/.env`、`server/node_modules/`、`server/dist/`

## Capabilities

### New Capabilities

- `copilot-bridge`: OpenAI 相容的 Copilot 橋接服務——單端點、共享密鑰驗證、模型鎖定、請求限制、錯誤處理、冪等 restart、內容不入 log

### Modified Capabilities

（無——`shortcut-injection` 與 extension 的 `src/`、`tests/`、`manifest.json` 一行不動）

## Impact

- 新增：`server/` 目錄（約 6 個檔案）
- 修改：`README.md`、`AGENTS.md`、`.gitignore`
- 新 dependencies（僅 server 子專案）：`@github/copilot-sdk@1.0.11`（鎖精確版本，SDK 還在 1.0.x 快速變動期）、`typescript`＋`@types/node`（dev）
- 基礎設施事實（已實證）：Node v22.22.2（SDK 要求 ≥22.12 ✅）；container 無 init/cron → pm2；container port 8018 空閒（8000、8010 已被佔用）；docker 映射 host 10819 → container 8018；tailscale 已在 container 運行（`100.127.182.47`），使用者 Mac 已在 tailnet 上
- 前置（spike 已完成，非本 change 工作項）：device flow 登入完成（`SYNTEC-10101672`），token 位於 `~/.copilot/config.json`（權限 0600）
- 成本事實（實測）：`gpt-5-mini` 每次 ~0.46 credits（`auto` 8.47、`gemini-3.7-flash` 1.51——鎖 mini 的理由）；輸入底薪 ~18-20k tokens 為 agent runtime 內建，無法削減
- 部署後消費：每次真實請求 ~0.5-1 credit（使用者 20-30 字改善場景），對任何 Copilot 方案額度皆可忽略
