# 魚式游泳 AI 動作分析系統

學生上傳游泳影片或照片 → 系統自動擷取關鍵畫面 → AI（Gemini，經 Firebase AI Logic）找出錯誤動作，給出原因、修正方法、分解練習與練習計畫。

- Google 登入，新學生預設「待核准」，教練在 `admin.html` 核准/停用
- 影片在學生手機瀏覽器內擷取畫面，不上傳原始影片（不需 Cloud Storage，可用免費 Spark 方案）
- 分析紀錄存在 Firestore，學生看自己的、教練看全部，教練可補充回覆

## 檔案
| 檔案 | 用途 |
|---|---|
| `public/config.js` | **唯一需要修改**：Firebase 設定、教練 Email、AI 模型 |
| `public/index.html`, `app.js` | 學生端 |
| `public/admin.html`, `admin.js` | 教練後台 |
| `public/analyzer.js` | 抽幀、縮圖、AI 提示詞與判讀 |
| `public/render.js` | 分析報告畫面 |
| `firestore.rules` | 資料庫權限（貼到 Firebase Console） |
| `CHANGELOG.md` | 每次修改的紀錄 |


## 設定步驟
1. Firebase Console 建立新專案。
2. Authentication → 登入方式 → 啟用 Google。
3. Firestore Database → 建立資料庫（正式版模式）→ 規則 → 貼上 `firestore.rules` → 發布。
4. AI Logic → 開始使用 → 選 **Gemini Developer API**。
5. 專案設定 → 新增網頁應用程式 → 複製 firebaseConfig 貼到 `public/config.js`。
6. App Check → 應用程式 → 註冊 Fraud Defense（reCAPTCHA Enterprise）網站金鑰，填入 `config.js`。

## 部署（更新網站）
1. 改完程式，把所有 `?v=` 版本號加 1，並在 `CHANGELOG.md` 記錄修改內容。
2. 推到 GitHub main。
3. Firebase Console 右上角開 Cloud Shell，執行：
   `cd ~/f && git pull -q && firebase deploy --only hosting -P fishlike-swim-ai`
   （第一次：`git clone https://github.com/ticoachaska-ux/fishlike-swim-ai f`）

正式網址：https://fishlike-swim-ai.web.app　教練後台：/admin.html

## 建議
- 更換教練 Email 時，`config.js` 與 `firestore.rules` 兩處都要改。
- AI 模型備援清單在 `config.js` 的 `AI_MODELS` 調整。
- 修改紀錄見 `CHANGELOG.md`。
