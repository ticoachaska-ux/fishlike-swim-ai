# 修改紀錄

每次修改都記在這裡（最新的在最上面）。更新程式後記得把所有 `?v=` 版本號加 1。

## v3 — 2026-10-28
- **修正**：瀏覽器一直使用舊版暫存程式 → 所有程式與樣式檔加上 `?v=3` 版本號，更新後會自動載入新版。

## v2 — 2026-10-28
- **修正**：第一次測試 AI 回傳 500/503「high demand」（Google 伺服器忙碌，gemini-3.8-flash）。
- AI 模型改為備援清單 `gemini-3.5-flash` → `gemini-3.8-flash` → `gemini-3.5-flash-lite`（`config.js` 的 `AI_MODELS`）。
- 忙碌時每個模型自動重試 2 次再換下一個，畫面顯示「自動重試中…」；全部失敗時顯示中文提示。

## v1 — 2026-10-28 初版上線
- 學生端：Google 登入、教練核准制、上傳影片（自動擷取 4/6/8 張關鍵畫面）或照片（最多 8 張）、選泳式／角度／程度、AI 分析報告（評分、優點、最多 5 個錯誤動作含畫面、原因、修正、分解練習、練習計畫、拍攝建議）、我的紀錄。
- 教練後台（`admin.html`）：核准／拒絕／停用學員、查看學員分析、補充回覆。
- AI：Firebase AI Logic + Gemini Developer API（免費版）；登入頁註明僅限 18 歲以上，分析前告知影像交由 Google 處理。
- 安全：Firestore 規則（學生只能看自己的、教練看全部）；App Check 使用 reCAPTCHA Enterprise（Fraud Defense）。
- 部署：Firebase Hosting，網址 https://fishlike-swim-ai.web.app
