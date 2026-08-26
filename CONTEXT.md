# VibeWrite

Chrome Extension：任何網頁上「選字 → 快捷鍵 → AI 一鍵改善 → 寫回」。此 glossary 固定我們的語言，避免同義詞漂移。

## Language

**Content script**:
被 Chrome 塞進網頁裡跑的 code，能讀寫該網頁的 DOM（手）。
_Avoid_: 腳本、插入程式、page script

**Service worker（background）**:
Extension 的背景程式，負責監聽快捷鍵、注入、呼叫 AI API（嘴）。不碰網頁 DOM。
_Avoid_: background.js（指檔案時可用，指概念時不用）、背景腳本

**注入（inject）**:
把 content script 放進當前分頁執行的動作。
_Avoid_: 插入、嵌入

**限制頁面（restricted page）**:
Chrome 禁止 extension code 進入的畫面（`chrome://` 內部頁、Web Store）。注入必然失敗，屬已知限制，非 bug。
_Avoid_: 白名單頁、封鎖頁
