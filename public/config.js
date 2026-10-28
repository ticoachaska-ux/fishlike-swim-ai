// ===== 魚式游泳 AI 影像分析系統：設定檔 =====
// 只需要改這個檔案。

// 1) Firebase 專案設定：到 Firebase Console → 專案設定 → 一般 → 你的應用程式 → 「設定」複製貼上
export const firebaseConfig = {
  apiKey: "AIzaSyAXljnHYfjFbkKyLzCbElvoDTmb7JCKl2Y",
  authDomain: "fishlike-swim-ai.firebaseapp.com",
  projectId: "fishlike-swim-ai",
  storageBucket: "fishlike-swim-ai.firebasestorage.app",
  messagingSenderId: "828004382032",
  appId: "1:828004382032:web:265aa545cc4c6a3e282855",
};

// 2) 教練帳號（可核准學生、看所有學生的分析）。改這裡時，firestore.rules 也要一起改。
export const COACH_EMAILS = ["ticoachaska@gmail.com"];

// 3) AI 模型（Firebase AI Logic / Gemini Developer API）
export const AI_MODEL = "gemini-3.8-flash";

// 4) 影片自動擷取的畫面數
export const DEFAULT_FRAME_COUNT = 6;
export const MAX_IMAGES = 8;
