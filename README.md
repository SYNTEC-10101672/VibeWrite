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

## server（Copilot 橋接服務）

`server/` 是自包含子專案：OpenAI 相容的 Copilot 橋接服務（`POST /v1/chat/completions`），供未來 extension client 與其他 OpenAI 形狀 client 使用。runtime 僅 `@github/copilot-sdk`（原生 node:http，零框架）。

### 部署

1. `cd server && npm install`
2. `cd server && npm run build`
3. `cp server/.env.example server/.env`，編輯：`VW_SECRET=$(openssl rand -hex 32)`（一個產生指令範例）；`PORT=8018`、`COPILOT_MODEL=gpt-5-mini` 預設即可
4. `bash server/restart.sh`（首次會自動 `npm i -g pm2` 前請先手動裝：`npm i -g pm2 && pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 1M && pm2 set pm2-logrotate:retain 3`）
5. 驗證：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8018/` → `404`（服務活著的最小探測，404=正常：只開放 POST /v1/chat/completions）

### restart.sh 冪等語意

一支腳本兩種用途：程序死了 → 救活；活著 → reload 部署新版（`pm2 startOrReload` + `pm2 save`）。container 重啟後的復活也是跑它。

### token 過期 SOP（約 2 分鐘）

症狀：回應 500 帶 GitHub 401/token 字樣。修法：

1. `server/node_modules/@github/copilot-linux-x64/copilot login --device-code`（瀏覽器輸入 device code 完成 GitHub 登入）
2. `bash server/restart.sh`

### Windows 手動 QA（公司區網）

Build host 的 docker 映射 host 10819 → container 8018，故對外用 10819：

```sh
curl.exe -s -X POST "http://<build-host>:10819/v1/chat/completions" -H "Content-Type: application/json" -H "X-VW-Key: <secret>" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}"
```

PowerShell 引號地獄備案：把 body 存成 `body.json` 檔案後 `-d "@body.json"`（必贏）。

### Mac 遠端復活一鍵指令（tailnet）

```sh
ssh <container> 'cd ~/personal/projects/VibeWrite && bash server/restart.sh'
```

### 已知邊界

請求 body 上限 64KB（413）；SDK 呼叫 60 秒逾時（500 `copilot timeout`）；模型鎖定 `COPILOT_MODEL`（預設 `gpt-5-mini`），請求的 `model` 欄位忽略。

