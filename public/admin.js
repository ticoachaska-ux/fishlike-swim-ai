import { db, login, logout, watchAuth, isCoach, esc, fmtDate } from "./common.js?v=3";
import {
  collection, getDocs, doc, updateDoc, query, where, orderBy, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { renderReport } from "./render.js?v=3";

const $ = (id) => document.getElementById(id);
let members = [];
let filter = "pending";
let analyses = [];

watchAuth(async (user) => {
  $("vLogin").hidden = !!user;
  $("btnLogout").hidden = !user;
  $("vDenied").hidden = !user || isCoach(user);
  $("vAdmin").hidden = !user || !isCoach(user);
  if (user && isCoach(user)) await loadMembers();
});

$("btnLogin").onclick = () => login().catch((e) => alert("登入失敗：" + e.message));
$("btnLogout").onclick = logout;

document.querySelectorAll(".tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    $("tabMembers").hidden = b.dataset.tab !== "members";
    $("tabAnalyses").hidden = b.dataset.tab !== "analyses";
    if (b.dataset.tab === "analyses") loadAnalyses();
  };
});

document.querySelectorAll(".filters .chip").forEach((c) => {
  c.onclick = () => {
    filter = c.dataset.f;
    document.querySelectorAll(".filters .chip").forEach((x) => x.classList.toggle("active", x === c));
    drawMembers();
  };
});

// ---------- 學員管理 ----------
async function loadMembers() {
  $("memberList").innerHTML = `<p class="muted">載入中…</p>`;
  try {
    const snap = await getDocs(collection(db, "users"));
    members = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    drawMembers();
    $("studentSel").innerHTML = `<option value="">全部學員（最新 50 筆）</option>` +
      members.filter((m) => m.status === "approved")
        .map((m) => `<option value="${esc(m.id)}">${esc(m.name || m.email)}</option>`).join("");
  } catch (e) {
    $("memberList").innerHTML = `<p class="warn">載入失敗：${esc(e.message)}（請確認 firestore.rules 已部署）</p>`;
  }
}

function drawMembers() {
  const count = (s) => members.filter((m) => m.status === s).length;
  $("cPending").textContent = count("pending");
  $("cApproved").textContent = count("approved");
  $("cBlocked").textContent = count("blocked");
  const list = members.filter((m) => m.status === filter);
  if (!list.length) { $("memberList").innerHTML = `<p class="muted card">沒有資料。</p>`; return; }
  $("memberList").innerHTML = list.map((m) => `
    <div class="item member">
      <img src="${esc(m.photo || "")}" alt="" referrerpolicy="no-referrer">
      <div><b>${esc(m.name || "(未命名)")}</b><br><small>${esc(m.email)}<br>申請：${fmtDate(m.createdAt)}</small></div>
      <div class="actions">
        ${m.status !== "approved" ? `<button class="btn small primary" data-act="approved" data-id="${esc(m.id)}">核准</button>` : ""}
        ${m.status !== "blocked" ? `<button class="btn small danger" data-act="blocked" data-id="${esc(m.id)}">${m.status === "pending" ? "拒絕" : "停用"}</button>` : ""}
      </div>
    </div>`).join("");
  $("memberList").querySelectorAll("[data-act]").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        await updateDoc(doc(db, "users", b.dataset.id), { status: b.dataset.act, reviewedAt: serverTimestamp() });
        members.find((m) => m.id === b.dataset.id).status = b.dataset.act;
        drawMembers();
      } catch (e) {
        alert("更新失敗：" + e.message);
        b.disabled = false;
      }
    };
  });
}

// ---------- 學員分析 ----------
$("studentSel").onchange = loadAnalyses;

async function loadAnalyses() {
  $("analysisDetail").innerHTML = "";
  $("analysisList").innerHTML = `<p class="muted">載入中…</p>`;
  const uid = $("studentSel").value;
  try {
    const q = uid
      ? query(collection(db, "analyses"), where("uid", "==", uid))
      : query(collection(db, "analyses"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    analyses = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!analyses.length) { $("analysisList").innerHTML = `<p class="muted card">沒有分析紀錄。</p>`; return; }
    $("analysisList").innerHTML = analyses.map((a, i) => `
      <button class="item" data-i="${i}">
        <img src="${a.thumbs?.[0] || ""}" alt="">
        <div><b>${esc(a.studentName)}</b> · ${esc(a.stroke)}<br>
          <small>${fmtDate(a.createdAt)} · ${a.result?.issues?.length || 0} 個問題${a.coachComment ? " · 已回覆" : ""}</small></div>
        ${a.result?.score ? `<span class="pill">${a.result.score}</span>` : ""}
      </button>`).join("");
    $("analysisList").querySelectorAll(".item").forEach((el) => { el.onclick = () => openAnalysis(+el.dataset.i); });
  } catch (e) {
    $("analysisList").innerHTML = `<p class="warn">載入失敗：${esc(e.message)}</p>`;
  }
}

function openAnalysis(i) {
  const a = analyses[i];
  $("analysisDetail").innerHTML = renderReport(a) + `
    <div class="card">
      <h3>教練補充 / 修正 AI 的說法</h3>
      <textarea id="coachText" rows="4" placeholder="學生會在「我的紀錄」看到這段文字">${esc(a.coachComment || "")}</textarea>
      <button id="btnSaveComment" class="btn primary">儲存回覆</button> <span id="saveMsg" class="muted"></span>
    </div>`;
  $("btnSaveComment").onclick = async () => {
    const text = $("coachText").value.trim();
    try {
      await updateDoc(doc(db, "analyses", a.id), { coachComment: text, coachCommentAt: serverTimestamp() });
      a.coachComment = text;
      $("saveMsg").textContent = "已儲存";
    } catch (e) {
      $("saveMsg").textContent = "儲存失敗：" + e.message;
    }
  };
  $("analysisDetail").scrollIntoView({ behavior: "smooth" });
}
