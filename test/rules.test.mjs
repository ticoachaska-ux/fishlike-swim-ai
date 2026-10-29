// Firestore 規則測試（訂閱方案、次數、權限）
// 在 Cloud Shell 執行：cd ~/f/test && npm i && npx firebase emulators:exec --only firestore -P demo-fishlike "node rules.test.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, writeBatch, collection, Timestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-fishlike",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

const d = new Date();
const MONTH = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
const future = Timestamp.fromDate(new Date(Date.now() + 30 * 864e5));
const past = Timestamp.fromDate(new Date(Date.now() - 864e5));

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "users/basic"), { status: "approved", plan: "basic", monthlyQuota: 2, planExpiresAt: future });
  await setDoc(doc(db, "users/basic2"), { status: "approved", plan: "basic", monthlyQuota: 5, planExpiresAt: future });
  await setDoc(doc(db, "users/pro"), { status: "approved", plan: "pro", monthlyQuota: 5, planExpiresAt: future });
  await setDoc(doc(db, "users/noplan"), { status: "approved" });
  await setDoc(doc(db, "users/expired"), { status: "approved", plan: "basic", monthlyQuota: 5, planExpiresAt: past });
  await setDoc(doc(db, "users/pending"), { status: "pending" });
  await setDoc(doc(db, "knowledge/k1"), { stroke: "自由式", title: "t" });
});

const as = (uid, email = `${uid}@test.com`) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const coach = env.authenticatedContext("coach", { email: "ticoachaska@gmail.com", email_verified: true }).firestore();

// 寫一筆分析並把用量設成 count
function analyze(db, uid, count, extra = {}, month = MONTH) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "analyses")), { uid, stroke: "自由式", ...extra });
  if (count !== null) b.update(doc(db, "users", uid), { usageMonth: month, usageCount: count });
  return b.commit();
}

let pass = 0, fail = 0;
async function t(name, p) {
  try { await p; pass++; console.log("  ✓", name); }
  catch (e) { fail++; console.log("  ✗", name, "-", e.message.split("\n")[0]); }
}

const basic = as("basic"), pro = as("pro");
console.log("訂閱與次數");
await t("基本方案第 1 次分析成功", assertSucceeds(analyze(basic, "basic", 1)));
await t("基本方案第 2 次分析成功", assertSucceeds(analyze(basic, "basic", 2)));
await t("超過每月 2 次被拒絕", assertFails(analyze(basic, "basic", 3)));
await t("沒有扣次數的分析被拒絕", assertFails(analyze(pro, "pro", null)));
await t("一次跳 2 次被拒絕", assertFails(analyze(pro, "pro", 2)));
await t("偽造月份重置次數被拒絕", assertFails(analyze(basic, "basic", 1, {}, "1999-1")));
await t("未開通方案被拒絕", assertFails(analyze(as("noplan"), "noplan", 1)));
await t("已到期被拒絕", assertFails(analyze(as("expired"), "expired", 1)));
await t("待核准帳號被拒絕", assertFails(analyze(as("pending"), "pending", 1)));
await t("幫別人建立分析被拒絕", assertFails(analyze(basic, "pro", 1)));

console.log("教練回覆");
await t("基本方案要求教練回覆被拒絕", assertFails(analyze(as("basic2"), "basic2", 1, { needsCoachReply: true })));
await t("進階方案要求教練回覆成功", assertSucceeds(analyze(pro, "pro", 1, { needsCoachReply: true })));
await t("學生自己寫 coachComment 被拒絕", assertFails(analyze(pro, "pro", 2, { coachComment: "x" })));

console.log("學生不能改自己的方案");
await t("改 plan 被拒絕", assertFails(updateDoc(doc(basic, "users/basic"), { plan: "pro" })));
await t("延長到期日被拒絕", assertFails(updateDoc(doc(basic, "users/basic"), { planExpiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 864e5)) })));
await t("改次數上限被拒絕", assertFails(updateDoc(doc(basic, "users/basic"), { monthlyQuota: 99 })));
await t("用量歸零被拒絕", assertFails(updateDoc(doc(basic, "users/basic"), { usageCount: 0 })));
await t("改自己 status 被拒絕", assertFails(updateDoc(doc(as("pending"), "users/pending"), { status: "approved" })));
await t("更新姓名與登入時間成功", assertSucceeds(updateDoc(doc(basic, "users/basic"), { name: "A", lastLoginAt: future })));

console.log("新會員");
await t("新會員建立 pending 成功", assertSucceeds(setDoc(doc(as("new1"), "users/new1"), { uid: "new1", email: "n", name: "", photo: "", status: "pending" })));
await t("新會員自帶方案被拒絕", assertFails(setDoc(doc(as("new2"), "users/new2"), { uid: "new2", status: "pending", plan: "pro", planExpiresAt: future, monthlyQuota: 99 })));

console.log("教練");
await t("教練開通方案成功", assertSucceeds(updateDoc(doc(coach, "users/noplan"), { plan: "basic", monthlyQuota: 8, planExpiresAt: future })));
await t("開通後學生可以分析", assertSucceeds(analyze(as("noplan"), "noplan", 1)));
await t("教練分析不扣次數成功", assertSucceeds(analyze(coach, "coach", null)));
await t("教練寫知識庫成功", assertSucceeds(setDoc(doc(coach, "knowledge/k2"), { stroke: "蛙式" })));

console.log("知識庫讀取");
await t("訂閱學生可讀知識庫", assertSucceeds(getDoc(doc(basic, "knowledge/k1"))));
await t("待核准不可讀知識庫", assertFails(getDoc(doc(as("pending"), "knowledge/k1"))));
await t("學生不可寫知識庫", assertFails(setDoc(doc(basic, "knowledge/k3"), { stroke: "蛙式" })));

await env.cleanup();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
