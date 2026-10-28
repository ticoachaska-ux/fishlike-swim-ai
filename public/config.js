// ===== 魚式游泳 AI 影像分析系統：設定檔 =====
// 只需要改這個檔案。

// 1) Firebase 專案設定：到 Firebase Console → 專案設定 → 一般 → 你的應用程式 → 「設定」複製貼上
export const firebaseConfig = {
  apiKey: "請填入",
  authDomain: "請填入.firebaseapp.com",
  projectId: "請填入",
  storageBucket: "請填入.firebasestorage.app",
  messagingSenderId: "請填入",
  appId: "請填入",
};

// 2) 教練帳號（可核准學生、看所有學生的分析）。改這裡時，firestore.rules 也要一起改。
export const COACH_EMAILS = ["ticoachaska@gmail.com"];

// 3) AI 模型（Firebase AI Logic / Gemini Developer API）
export const AI_MODEL = "gemini-3.8-flash";

// 4) 影片自動擷取的畫面數
export const DEFAULT_FRAME_COUNT = 6;
export const MAX_IMAGES = 8;
