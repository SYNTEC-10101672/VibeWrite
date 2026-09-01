# Design: copilot-server

## Context

- VibeWrite 整體路線：step a（extension 骨架，已完成）→ **本 change（copilot server）** → 下一個 change（extension 管線：popup 設定＋client＋hello）→ step c（選字、預覽 UI、寫回）
- 後端選擇歷程（2026-09-01 探索討論）：Z.ai coding plan 直呼＝條款明文禁止（自製工具＋非 coding 內容）；`opencode run` 橋接＝三 flag 全亮；GitHub Copilot SDK＝官方文件明文支援「app 代表使用者」，條款最乾淨。使用者有 Copilot 訂閱且 credits 用不完
- **Spike 實證（2026-09-01，/tmp/opencode/vw-spike）**：
  - `@github/copilot-sdk@1.0.11` 在 container 安裝成功；npm allowScripts 封鎖 `koffi` install script 但平台包 `@github/copilot-linux-x64` 自帶 prebuilt（`runtime.node`、`cli-native.node`），無影響
  - CLI runtime `copilot` v1.0.82 在 container 可執行
  - device flow 登入成功（`SYNTEC-10101672`）；keychain 不可用時自動 fallback 存 `~/.copilot/config.json`（實測權限 0600）
  - 成本實測：`auto` 8.47／4.69 credits（浮動）、`gemini-3.7-flash` 1.51、**`gpt-5-mini` 0.46**（同一 prompt 對照）
  - 輸入底薪 ~18-33k tokens（agent runtime 內建 system prompt，無法削減）；CLI 冷啟動 ~3.5s＋模型 ~5s
  - 模型目錄：`gpt-5-mini`、`gpt-5.6-sol/terra/luna`、`claude-sonnet-5`、`claude-haiku-4.5`、`gemini-3.7-flash`、`kimi-k3`、`grok-4.6` 等
- 環境事實（已查證）：Node v22.22.2；container PID 1 是 sshd，**無 systemd 使用者實例、無 cron**；docker 映射 host 10800-10819 → container 22, 8000-8018；container 8000、8010 已佔用，**8018 空閒**；tailscaled 已運行（container tailnet IP `100.127.182.47`）；使用者 Mac（`macbook-air`）已在其 tailnet

## Goals / Non-Goals

**Goals:**

- 單一 OpenAI 相容端點 `POST /v1/chat/completions`，讓未來 extension 的 client 程式碼同時相容 Z.ai 直連與本服務（只換 base URL＋header）
- 兩扇門可達：tailnet（Mac）與公司區網（Windows）
- `restart.sh` 一條路同時解決「container 重啟後救活」與「部署新版」
- 邊際條件（Q1-Q7）全部有明確處理

**Non-Goals:**

- extension 任何改動（popup、client、manifest）——下一個 change
- 模型選單／映射表（鎖定 `gpt-5-mini`，env 可改但無 per-request 選擇）
- streaming、常駐 session 優化（延遲 ~5-10s 先接受）
- 多使用者、複雜 auth（shared secret 到頂）
- `/healthz`、401→502 專屬映射（Q2 定案：catch-all 500＋原始錯誤訊息）
- rate limit（secret 熵 2²⁵⁶，暴力猜測不可行）
- token 過期自動救援（device flow 需人工瀏覽器，GitHub 設計使然）

## Decisions

### 核心架構決策（D1-D6）

| # | 決策 | 理由 |
|---|---|---|
| D1 | `server/` 自包含子專案（自己的 package.json／tsconfig） | 與 extension 的契約同一 repo 原子更新；extension 的 tsc-only build 不受 server deps 污染 |
| D2 | 授權＝device flow（已完成）＋fine-grained PAT 為備援 | spike 實證可行；文件確認 fallback 存檔案。PAT 規格：`github_pat_` 開頭＋「Copilot Requests」權限（classic `ghp_` 不被支援） |
| D3 | OpenAI 相容 `/v1/chat/completions`＋model 鎖定 `gpt-5-mini` | 協定殼＝未來 client 一份程式碼吃多 backend；鎖定理由＝實測 18 倍價差（0.46 vs 8.46） |
| D4 | pm2 常駐（＋pm2-logrotate） | container 無 init/cron；pm2 在 PID 1=sshd 環境可 daemonize，且顧 crash 自動重啟 |
| D5 | bind `0.0.0.0:8018`＋`X-VW-Key` shared secret | 兩扇門共用同一 port；secret 存 `server/.env` |
| D6 | per-request session | 實作最簡；SDK 官方文件本為多 session backend 設計（Q3 併發定案：不特別處理＋T5 保險） |

### 網路拓撲（D5 細節）

```
家裡 Mac ──── tailnet（加密）────▶ 100.127.182.47:8018 ─────┐
                                                             ├──▶ Node server（container 內，listen 0.0.0.0:8018）
公司 Windows ── 公司區網 ──▶ build host:10819 ─docker映射──▶ 8018 ┘
```

- 兩台機器各自的 browser 未來在 popup 存自己的 base URL（`chrome.storage.local` per-machine，零切換邏輯）
- 區網那扇門明文 HTTP——個人寫作文字＋secret header，風險已知可接受；tailnet 門全程加密

### 邊際條件決策（Q1-Q7，grill 定案）

| # | 邊際情境 | 定案 |
|---|---|---|
| Q1 | container 重啟後服務復活 | `server/restart.sh`：`pm2 startOrReload ecosystem.config.js && pm2 save`（冪等；死→救活、活→換新版＝部署腳本同一支）。container 內零魔法（不改 bashrc、不依賴 cron）；Mac 端一鍵遠端復活指令寫 README |
| Q2 | token 過期／credits 用完／GitHub 限流 | 不做專屬機制：catch-all 回 500＋原始錯誤訊息（GitHub 的錯誤文字原樣帶出，可辨識原因）。README 記 2 分鐘 SOP：`server/node_modules/@github/copilot-linux-x64/copilot login --device-code` → `bash server/restart.sh`。錯誤可見性：近期＝extension badge「!」＋F12 console；step c＝預覽 UI 面板 |
| Q3 | 兩台機器同時請求 | 不處理（SDK 設計內場景）；T5 併發測試實證；若真撞，串行 queue 是五分鐘補救 |
| Q4 | 請求卡死 | server 端 SDK 呼叫 60 秒 timeout→500；client 端（未來 extension）65 秒——故意長於 server，讓錯誤訊息有機會回傳 |
| Q5 | 輸入上限 | 64KB（≈2 萬中文字，使用者實際 20-30 字／次）→ 413。防的是 client bug 燒 credits，不是日常使用 |
| Q6 | secret 管理 | `server/.env`（gitignore；`openssl rand -hex 32` 產生）；pm2 dump 內含 env 但位於 home 目錄 0600，與 token 檔同等級，可接受。無 rate limit（熵即防禦） |
| Q7 | log | 一行式結構化（時間、狀態碼、耗時），**不含** prompt／回應內容與 secret（公司機器不留私人寫作）。`pm2-logrotate`：max_size 1M、retain 3——硬上限 ~3MB |

### 實作要點

- HTTP 層：原生 `node:http`，零框架——單端點的複雜度撐不起 express
- 環境變數：`PORT=8018`、`VW_SECRET=<openssl rand -hex 32>`、`COPILOT_MODEL=gpt-5-mini`；`.env.example` 進版控、`.env` 不進
- timeout 實作：SDK 呼叫包 `AbortSignal.timeout(60_000)`
- 64KB 檢查：先查 `Content-Length`，再於串接 body 時累計，超限即斷→413
- 回應形狀：`{ "choices": [{ "message": { "role": "assistant", "content": "..." } }], "model": "<實際模型>" }`——`model` 回填實際值供 T6 驗證鎖定
- SDK 回應取文字：用 SDK 程式 API 的訊息物件（乾淨），**不解析** CLI stdout

## Risks / Trade-offs

- [SDK 1.0.x 快速 churn，API 可能變] → 鎖精確版本 `1.0.11`（=spike 驗證版）；升級是刻意決策
- [agent prompt 底薪 18-20k tokens 削不掉] → `gpt-5-mini` 單價下 0.46 credits/次，使用者額度（即便 Pro 1500/月）綽綽有餘
- [SDK 併發行為未實證] → T5 兩發併發 curl 驗證；失敗 fallback＝串行 queue（數行）
- [60s timeout 行為難自動測] → 不測，3 行 code 由 code review 承擔
- [Windows PowerShell JSON 引號問題] → README 提供 `-d "@body.json"` 檔案備案（必贏）
- [pm2 dump／`.env` 明文存 secret] → 均在使用者 home 0600；個人 container 威脅模型下可接受
- [使用者 Mac 的 tailnet 門尚未實測] → tailnet 通道本身已驗證活躍（Mac 與 container 有既有流量），換 port 風險極低；部署後補一次手動 curl 即可

## Migration Plan

全新目錄，無遷移。Rollback：`pm2 delete vibewrite-server && pm2 save`＋刪除 `server/` 目錄。

## Open Questions

（無——grill 已收斂全部邊際條件，見 Q1-Q7）
