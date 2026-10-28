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
| `.github/workflows/deploy.yml` | 推到 main 自動部署 Firebase Hosting |

## 設定步驟
1. Firebase Console 建立新專案。
2. Authentication → 登入方式 → 啟用 Google。
3. Firestore Database → 建立資料庫（正式版模式）→ 規則 → 貼上 `firestore.rules` → 發布。
4. AI Logic → 開始使用 → 選 **Gemini Developer API**。
5. 專案設定 → 新增網頁應用程式 → 複製 firebaseConfig 貼到 `public/config.js`。
6. GitHub repo → Settings → Secrets and variables → Actions：
   - Secret `FIREBASE_SERVICE_ACCOUNT`：Firebase 專案設定 → 服務帳戶 → 產生新的私密金鑰，整份 JSON 貼上
   - Variable `FIREBASE_PROJECT_ID`：專案 ID
7. 推到 main → Actions 自動部署 → 網址 `https://<專案ID>.web.app`。
8. Authentication → 設定 → 授權網域，確認有 `<專案ID>.web.app`。

## 建議
- 正式使用前開啟 **App Check**（AI Logic 頁面），避免他人盜用 AI 額度。
- 更換教練 Email 時，`config.js` 與 `firestore.rules` 兩處都要改。
- 模型名稱可在 `config.js` 的 `AI_MODEL` 調整。
