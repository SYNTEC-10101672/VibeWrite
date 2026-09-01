# Tasks: copilot-server

實作順序由內而外：scaffold → 端點骨架（auth/limit/error）→ SDK 整合 → 部署 → 測試 → 文件。每個任務附驗證方式；T0-T7 為驗收契約。

## 1. Scaffold `server/` 子專案

- [x] 建立 `server/package.json`：`name: "@vibewrite/server"`、`type: "module"`、scripts（`build`: `tsc`）
- [x] dependencies：`@github/copilot-sdk@1.0.11`（鎖精確版本，見 design Risks）；devDependencies：`typescript`、`@types/node`
- [x] 建立 `server/tsconfig.json`（`outDir: dist`、`module: NodeNext`、`strict: true`）
- [x] 更新根 `.gitignore`：加入 `server/.env`、`server/node_modules/`、`server/dist/`
- [x] 建立 `server/.env.example`：`PORT=8018`、`VW_SECRET=`（註明 `openssl rand -hex 32` 產生）、`COPILOT_MODEL=gpt-5-mini`

驗證：`cd server && npm install && npm run build` exit 0（此時尚無 .ts 檔，可先放空 `src/main.ts` 佔位）

## 2. `server/src/main.ts`：HTTP 骨架（auth／limit／error）

- [x] 原生 `node:http` server，listen `0.0.0.0:${PORT}`（預設 8018）
- [x] 載入 `server/.env`（手寫 3 行 parser 或 `node:util` parseArgs 風格，不裝 dotenv——或最簡：從 `process.env` 讀，由 pm2 ecosystem `env_file`／`env` 注入，擇一，實作者決定並保持零額外依賴）
- [x] 路由：僅 `POST /v1/chat/completions`，其他 → 404
- [x] `X-VW-Key` 檢查：缺失或不符 `VW_SECRET` → 401（此路徑不得讀 body 之外做任何事，絕不觸發 SDK）
- [x] body 上限：`Content-Length` 預檢＋串接累計，>64KB → 413
- [x] JSON parse 失敗或缺 `messages` → 400
- [x] 單行 log：`<ISO時間> <方法> <路徑> <狀態碼> <耗時ms>`

驗證：T1、T2、T3 通過（見下方測試契約；此時 T4 尚未實作 SDK 可先回 501）

## 3. SDK 整合（核心）

- [x] import `CopilotClient` 等 `@github/copilot-sdk` API（以 nodejs 子路徑為準，安裝後讀 `server/node_modules/@github/copilot-sdk` 的型別定義確認正確建構式）
- [x] per-request：每個合法請求建立 session → 送入 `messages`（OpenAI 形狀轉 SDK 預期格式）→ 取回最終 assistant 文字
- [x] 模型：一律用 `process.env.COPILOT_MODEL`（預設 `gpt-5-mini`），忽略請求 `model`
- [x] 逾時：SDK 呼叫以 `AbortSignal.timeout(60_000)` 包裹，逾時 → 500 `copilot timeout`
- [x] catch-all：任何 SDK／GitHub 錯誤 → 500＋原始 `error.message`
- [x] 回應：`{ choices: [{ message: { role: "assistant", content } }], model: <實際模型> }`

驗證：T4（happy path）、T6（模型鎖定）通過

## 4. 生命週期：pm2／restart.sh

- [x] `server/ecosystem.config.js`：app 名 `vibewrite-server`、script `dist/main.js`、cwd `server/`、env 由 `.env` 而來
- [x] `server/restart.sh`：`pm2 startOrReload ecosystem.config.js && pm2 save`（可執行權限）
- [x] 安裝 logrotate：`npm i -g pm2 && pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 1M && pm2 set pm2-logrotate:retain 3`

驗證：T7（restart.sh 連跑兩次 → online）

## 5. 部署上線

- [x] `openssl rand -hex 32` 產生 secret → `server/.env`
- [x] `bash server/restart.sh` 上線
- [x] 確認 pm2 logrotate 生效（`pm2 conf pm2-logrotate`）

驗證：container 內 T4 全綠

## 6. 文件

- [x] `README.md` 新增章節：server 是什麼、部署五步（install → build → .env → restart.sh → logrotate）、restart.sh 冪等語意（死→救活／活→部署新版）、token 過期 SOP（`server/node_modules/@github/copilot-linux-x64/copilot login --device-code` → `bash server/restart.sh`）、Windows 手動 QA 指令（`curl.exe` ＋ `-d "@body.json"` 備案）、Mac 遠端復活一鍵指令
- [x] `AGENTS.md` 常用指令加 server 區塊：`cd server && npm run build`、`bash server/restart.sh`、測試方式（T* curl）
- [x] `package.json` 根 lint script 擴及 `server/src`（biome）

驗證：`npm run lint` 通過

## 7. 驗收測試（手動 QA）

- [x] 使用者在公司 Windows 以 `curl.exe` 打 `http://<build-host>:10819/v1/chat/completions` → 200（含引號備案 `body.json`）

## Tests

前置：服務已上線（任務 5）。`KEY` 取法：`KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2)`。

- [x] T0: build 與 lint 全綠
  > Command: `cd server && npm run build && cd .. && npm run lint`
  > Expected: 兩指令 exit 0，無錯誤輸出

- [x] T1: 未帶密鑰 → 401
  > Command: `curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}'`
  > Expected: `401`

- [x] T2: 缺 messages → 400
  > Command: `KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2); curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -H "X-VW-Key: $KEY" -d '{"foo":1}'`
  > Expected: `400`

- [x] T3: 超 64KB body → 413
  > Command: `KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2); python3 -c "print('{\"messages\":[{\"role\":\"user\",\"content\":\"'+ 'x'*70000 + '\"}]}')" > /tmp/opencode/big.json; curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -H "X-VW-Key: $KEY" -d @/tmp/opencode/big.json`
  > Expected: `413`

- [x] T4: 正常請求 → 200 且 content 非空
  > Command: `KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2); curl -s -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -H "X-VW-Key: $KEY" -d '{"messages":[{"role":"user","content":"Reply with exactly: OK"}]}' | python3 -c "import json,sys; d=json.load(sys.stdin); c=d['choices'][0]['message']['content']; print('OK' if c else 'EMPTY', d['model'])"`
  > Expected: `OK gpt-5-mini`（或環境設定之 COPILOT_MODEL）

- [x] T5: 兩個併發請求皆 200
  > Command: `KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2); for i in 1 2; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -H "X-VW-Key: $KEY" -d '{"messages":[{"role":"user","content":"Reply with exactly: OK"}]}' & done; wait`
  > Expected: 兩行皆為 `200`

- [x] T6: 要求昂貴模型仍鎖定 gpt-5-mini
  > Command: `KEY=$(grep '^VW_SECRET=' server/.env | cut -d= -f2); curl -s -X POST http://127.0.0.1:8018/v1/chat/completions -H "Content-Type: application/json" -H "X-VW-Key: $KEY" -d '{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"Reply with exactly: OK"}]}' | python3 -c "import json,sys; print(json.load(sys.stdin)['model'])"`
  > Expected: `gpt-5-mini`

- [x] T7: restart.sh 冪等
  > Command: `bash server/restart.sh && bash server/restart.sh && sleep 2 && pm2 jlist | python3 -c "import json,sys; print([p['pm2_env']['status'] for p in json.load(sys.stdin) if p['name']=='vibewrite-server'][0])"`
  > Expected: `online`

手動 QA（非自動 T*）：

- Windows 區網門：`curl.exe -s -X POST "http://<build-host>:10819/v1/chat/completions" -H "Content-Type: application/json" -H "X-VW-Key: <secret>" -d "@body.json"` → 200
