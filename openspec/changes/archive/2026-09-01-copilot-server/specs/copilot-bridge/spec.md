# copilot-bridge Specification

## Purpose

定義 VibeWrite 的 Copilot 橋接服務：在開發 container 內以 Node 常駐、暴露單一 OpenAI 相容端點 `POST /v1/chat/completions`，經 `@github/copilot-sdk` 以 per-request session 呼叫 GitHub Copilot，供使用者個人裝置（tailnet 與公司區網兩條路徑）作為寫作改善的 AI 後端。

## ADDED Requirements

### Requirement: OpenAI 相容端點
服務 SHALL 於 `POST /v1/chat/completions` 接受 OpenAI Chat Completions 形狀的 JSON body（必填 `messages`；`model` 欄位可填但見「模型鎖定」），並回應 `{ "choices": [{ "message": { "role": "assistant", "content": "<文字>" } }], "model": "<實際使用的模型>" }`。

#### Scenario: 帶密鑰的正常請求
- **WHEN** client 對 `http://127.0.0.1:8018/v1/chat/completions` 發送 `POST`，header 含正確 `X-VW-Key`，body 為 `{"messages":[{"role":"user","content":"hello"}]}`
- **THEN** 回應 200，`choices[0].message.content` 為非空字串

#### Scenario: 路徑與方法不符
- **WHEN** client 對任何其他路徑或以 GET 呼叫
- **THEN** 回應 404

### Requirement: 共享密鑰驗證
服務 SHALL 要求每個請求帶 `X-VW-Key` header 且值等於 `server/.env` 中的 `VW_SECRET`；缺失或不符時回應 401，且不得觸發任何 Copilot SDK 呼叫（零 credits 消耗）。服務 SHALL 不實作任何 rate limit 或鎖定機制（密鑰熵即防禦）。

#### Scenario: 未帶密鑰
- **WHEN** 發送不帶 `X-VW-Key` 的 POST 請求
- **THEN** 回應 401

#### Scenario: 密鑰錯誤
- **WHEN** `X-VW-Key` 值與 `VW_SECRET` 不符
- **THEN** 回應 401

### Requirement: 模型鎖定
服務 SHALL 忽略請求中的 `model` 值，一律以環境變數 `COPILOT_MODEL`（預設 `gpt-5-mini`）發起 Copilot session，並於回應的 `model` 欄位回填實際使用的模型 ID。

#### Scenario: 要求昂貴模型
- **WHEN** body 含 `"model": "gpt-5.6-sol"`（高成本模型）
- **THEN** 回應 200 且回應 `model` 欄位為 `gpt-5-mini`

### Requirement: 請求限制
服務 SHALL 拒絕超過 64KB 的 request body（413）； SHALL 拒絕非 JSON 或缺少 `messages` 的 body（400）。

#### Scenario: 超大 body
- **WHEN** body 大小超過 64KB
- **THEN** 回應 413

#### Scenario: 缺 messages 的 body
- **WHEN** body 為合法 JSON 但無 `messages` 欄位
- **THEN** 回應 400

### Requirement: 錯誤處理與逾時
服務 SHALL 對每個 Copilot SDK 呼叫設定 60 秒逾時（逾時回 500＋`copilot timeout`）； SHALL 對 SDK／GitHub 端的任何錯誤（token 過期、credits 用盡、限流）以 500 回應並附原始錯誤訊息，不得靜默吞掉或無限懸掛。

#### Scenario: SDK 呼叫逾時
- **WHEN** Copilot session 超過 60 秒未完成
- **THEN** 回應 500，body 含 `copilot timeout`

#### Scenario: GitHub 端拒絕（如 token 過期）
- **WHEN** SDK 回拋含 401／token 字樣的錯誤
- **THEN** 回應 500，body 含該原始錯誤訊息（可辨識原因，修法見 README SOP）

### Requirement: 服務生命週期
服務 SHALL 以 pm2 常駐於 container（名稱 `vibewrite-server`），並提供 `server/restart.sh`：冪等執行 `pm2 startOrReload ecosystem.config.js && pm2 save`——程序不存在則啟動、存在則 reload（部署新版同一支腳本）。container 重啟後的復活由使用者從 Mac 遠端執行本腳本（README 記錄指令）。

#### Scenario: 連續執行兩次 restart
- **WHEN** 任意狀態下連續執行 `bash server/restart.sh` 兩次
- **THEN** 兩次結束後 `pm2 jlist` 中 `vibewrite-server` 的 status 為 `online`

### Requirement: 最小日誌
服務 SHALL 對每個請求輸出一行結構化日誌（時間、方法、路徑、狀態碼、耗時）， SHALL NOT 將 prompt、AI 回應內容或 `VW_SECRET` 寫入任何日誌。日誌總量 SHALL 由 `pm2-logrotate`（`max_size` 1MB、`retain` 3）約束於 ~3MB 硬上限。

#### Scenario: 日誌不含寫作內容
- **WHEN** 任一請求完成後檢視 pm2 日誌（`~/.pm2/logs/`）
- **THEN** 可見狀態碼與耗時，不可見請求的 `messages` 內容

