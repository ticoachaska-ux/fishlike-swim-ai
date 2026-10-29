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

// App Check（reCAPTCHA Enterprise 網站金鑰，公開值）
export const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LdgkAQuAAAAAAN4tSeBMGaGOGxPpL8rNLqPpVh0";

// 2) 教練帳號（可核准學生、看所有學生的分析）。改這裡時，firestore.rules 也要一起改。
export const COACH_EMAILS = ["ticoachaska@gmail.com"];

// 3) AI 模型（Firebase AI Logic / Gemini Developer API）
// 依序使用；前一個忙碌時自動換下一個
export const AI_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];

// 4) 影片自動擷取的畫面數
export const DEFAULT_FRAME_COUNT = 6;
export const MAX_IMAGES = 8;

// 5) 訂閱方案（教練在後台手動開通）。改價格、次數、付款說明只要改這裡。
export const PLANS = {
  basic: {
    name: "基本方案",
    monthlyQuota: 8,          // 每月可分析次數
    coachReply: false,        // 是否含教練親自回覆
    price: "價格請洽教練",
    desc: "每月 8 次魚式 AI 動作分析＋個人練習計畫",
  },
  pro: {
    name: "進階方案",
    monthlyQuota: 20,
    coachReply: true,
    price: "價格請洽教練",
    desc: "每月 20 次魚式 AI 動作分析＋練習計畫＋教練親自回覆",
  },
};

// 學生看到的付款說明（例如轉帳帳號、LINE ID）
export const PAYMENT_INFO = "請透過 LINE 或現場聯絡教練付款，教練開通後重新整理此頁即可使用。";
