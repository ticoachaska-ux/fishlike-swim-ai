// 共用：Firebase 初始化、登入、會員狀態
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  initializeAppCheck, ReCaptchaEnterpriseProvider,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app-check.js";
import { firebaseConfig, COACH_EMAILS, RECAPTCHA_ENTERPRISE_SITE_KEY } from "./config.js?v=4";

export const app = initializeApp(firebaseConfig);

// App Check：AI Logic 已強制驗證，必須在呼叫 AI 前初始化
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
export const auth = getAuth(app);
export const db = getFirestore(app);

export const isCoach = (user) => !!user && COACH_EMAILS.includes((user.email || "").toLowerCase());

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // 手機或內建瀏覽器擋彈出視窗時改用轉址
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      throw e;
    }
  }
}

export const logout = () => signOut(auth);
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

// 取得（或建立）會員資料：新學生預設 pending，等教練核准
export async function ensureMember(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const data = {
      uid: user.uid,
      email: user.email || "",
      name: user.displayName || "",
      photo: user.photoURL || "",
      status: "pending",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return data;
  }
  updateDoc(ref, { lastLoginAt: serverTimestamp(), name: user.displayName || "", photo: user.photoURL || "" }).catch(() => {});
  return snap.data();
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d) return "";
  return d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
