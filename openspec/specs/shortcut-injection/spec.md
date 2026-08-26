# shortcut-injection Specification

## Purpose

定義 VibeWrite extension 的快捷鍵注入能力：以 Manifest V3 `commands` 綁定 `Ctrl+M`，於按鍵發生的分頁注入 content script，並保證冪等裝載、安靜失敗與全鏈自動測試。

## Requirements

### Requirement: 快捷鍵註冊
Extension SHALL 以 Manifest V3 `commands` 註冊快捷鍵 `Ctrl+M`（`suggested_key` 的 `default` 與 `mac` 皆為 `Ctrl+M`），並要求權限僅含 `activeTab` 與 `scripting`。

#### Scenario: Chrome 接受綁定
- **WHEN** extension 載入後查詢 `chrome.commands.getAll()`
- **THEN** 名為 trigger 的 command 之 `shortcut` 為 `Ctrl+M`

#### Scenario: 權限零安裝警告
- **WHEN** 使用者於 `chrome://extensions` load unpacked 載入 `dist/`
- **THEN** Chrome 不顯示任何安裝權限警告（activeTab + scripting 皆非警告級權限）

### Requirement: 按鍵觸發注入
Service worker SHALL 於 top-level 同步註冊 `chrome.commands.onCommand` listener，並以 callback 附帶的 `tab` 參數取得按鍵發生當下的分頁，對該分頁執行 `chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })`。

#### Scenario: 一般網頁上按鍵
- **WHEN** 使用者於可注入的網頁（如 `https://example.com` 或本地測試頁）按 `Ctrl+M`
- **THEN** content script 被注入該分頁並執行

#### Scenario: 多視窗下的正確分頁
- **WHEN** 存在多個 Chrome 視窗，使用者在非最後聚焦的視窗中之 active 分頁按 `Ctrl+M`
- **THEN** content script 注入按鍵發生的那個分頁（非其他視窗的分頁）

#### Scenario: service worker 休眠後按鍵
- **WHEN** service worker 已休眠（閒置逾約 30 秒），使用者按 `Ctrl+M`
- **THEN** service worker 被喚醒，事件不遺失，注入照常執行

### Requirement: 冪等裝載
Content script SHALL 於執行開頭檢查 `document.documentElement.dataset.vibewrite`：已存在則立即返回（不重複裝載）；不存在則設為 `'injected'` 並繼續執行（輸出 `console.log`）。

#### Scenario: 同分頁第二次按鍵
- **WHEN** 同一分頁已裝載過 content script，使用者再按 `Ctrl+M`（觸發第二次注入）
- **THEN** 第二次執行於 marker 檢查即返回，畫面行為與單次按鍵無異

#### Scenario: 注入痕跡可斷言
- **WHEN** content script 成功裝載於某分頁
- **THEN** 該分頁 `<html>` 元素帶有 `data-vibewrite="injected"` 屬性，且 F12 Elements 可見

### Requirement: 注入失敗安靜處理
限制頁面（`chrome://` 內部頁、Chrome Web Store）上 `executeScript` MUST 被 catch 且僅記 log 於 service worker console，不得拋出未處理錯誤、不得重試、不得顯示任何使用者可見回饋。

#### Scenario: 限制頁面上按鍵
- **WHEN** 使用者於 `chrome://settings` 按 `Ctrl+M`
- **THEN** 注入被 Chrome 拒絕，service worker 記 log，使用者畫面無反應（已知限制，非 bug）

#### Scenario: 無痕視窗按鍵
- **WHEN** extension 未獲准於無痕模式啟用，使用者在無痕視窗按 `Ctrl+M`
- **THEN** command 不觸發，畫面無反應（Chrome 預設行為，README 記載開啟方式）

### Requirement: 全鏈自動測
本能力 SHALL 具備自動測試：以 Playwright `launchPersistentContext` 載入 `dist/`、開本地測試頁、以 `xdotool` 送真 OS 層按鍵 `ctrl+m`、斷言 `document.documentElement.dataset.vibewrite === 'injected'`。測試 MUST 於 `xvfb-run` 環境下全部通過。

#### Scenario: 自動測全鏈綠燈
- **WHEN** 執行 `xvfb-run -a npx playwright test`
- **THEN** 所有測試通過，含「按鍵 → command → 注入 → marker」全鏈斷言

#### Scenario: build 產物完整
- **WHEN** 執行 `npm run build`
- **THEN** `dist/` 內含 `manifest.json`、`background.js`、`content.js`，可直接 load unpacked
