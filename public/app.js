import {
  db, login, logout, watchAuth, ensureMember, isCoach, esc, fmtDate, currentMonth, planStatus,
} from "./common.js?v=5";
import {
  collection, doc, getDoc, getDocs, query, where, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { extractVideoFrames, imageFileToFrame, analyzeFrames } from "./analyzer.js?v=5";
import { renderReport } from "./render.js?v=5";
import { MAX_IMAGES, DEFAULT_FRAME_COUNT, PLANS, PAYMENT_INFO } from "./config.js?v=5";

const $ = (id) => document.getElementById(id);
let currentUser = null;
let frames = [];          // { full, thumb, time, label, on }
let isVideo = false;
let videoFile = null;
let busy = false;
let member = null;        // 會員資料（含方案、本月用量）

function show(view) {
  for (const v of ["vLogin", "vPending", "vBlocked", "vApp"]) $(v).hidden = v !== view;
}

function renderUserBox(user) {
  $("userBox").innerHTML = user
    ? `${isCoach(user) ? `<a class="btn small" href="admin.html">教練後台</a>` : ""}
       <img src="${esc(user.photoURL || "")}" alt="" referrerpolicy="no-referrer">
       <button id="btnLogout" class="btn small">登出</button>`
    : "";
  $("btnLogout")?.addEventListener("click", logout);
}

watchAuth(async (user) => {
  currentUser = user;
  renderUserBox(user);
  if (!user) return show("vLogin");
  try {
    member = await ensureMember(user);
    if (isCoach(user) || member.status === "approved") { renderPlan(); return show("vApp"); }
    if (member.status === "blocked") return show("vBlocked");
    $("pendingEmail").textContent = user.email;
    $("planInfoPending").innerHTML = plansHtml();
    $("payInfoPending").textContent = PAYMENT_INFO;
    show("vPending");
  } catch (e) {
    alert("讀取會員資料失敗：" + e.message);
  }
});

$("btnLogin").onclick = () => login().catch((e) => alert("登入失敗：" + e.message));
$("btnRefresh").onclick = () => location.reload();

// ---------- 訂閱方案 ----------
function plansHtml() {
  return Object.values(PLANS).map((p) => `
    <div class="plan-card"><b>${esc(p.name)}</b><span class="price">${esc(p.price)}</span><p>${esc(p.desc)}</p></div>`).join("");
}

function renderPlan() {
  const coach = isCoach(currentUser);
  const st = planStatus(member);
  const p = PLANS[st.plan];
  if (coach) {
    $("planBar").innerHTML = `<span class="pill">教練</span> 不限次數`;
  } else if (st.active) {
    $("planBar").innerHTML = `<span class="pill">${esc(p?.name || st.plan)}</span>
      本月剩 <b>${st.left}</b> / ${st.quota} 次 · 到期 ${fmtDate(st.expires).slice(0, 10)}`;
  } else {
    $("planBar").innerHTML = st.expired ? `<span class="pill off">已到期</span> ${fmtDate(st.expires).slice(0, 10)}` : `<span class="pill off">未訂閱</span>`;
  }
  const canUse = coach || (st.active && st.left > 0);
  $("newForm").hidden = !canUse;
  $("noPlan").hidden = canUse;
  if (!canUse) {
    $("noPlanTitle").textContent = st.active ? "本月次數已用完" : st.expired ? "方案已到期" : "尚未訂閱";
    $("noPlanMsg").textContent = st.active
      ? `本月 ${st.quota} 次已用完，下個月 1 日會自動恢復，或聯絡教練升級方案。`
      : "訂閱後即可上傳游泳影片，取得魚式 AI 動作分析與練習計畫。";
    $("planInfo").innerHTML = plansHtml();
    $("payInfo").textContent = PAYMENT_INFO;
  }
  $("coachReplyRow").hidden = coach || !(st.active && PLANS[st.plan]?.coachReply);
}

// ---------- 分頁 ----------
document.querySelectorAll(".tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    $("tabNew").hidden = b.dataset.tab !== "new";
    $("tabHistory").hidden = b.dataset.tab !== "history";
    if (b.dataset.tab === "history") loadHistory();
  };
});

// ---------- 上傳與擷取 ----------
$("frameCount").value = String(DEFAULT_FRAME_COUNT);

$("fileInput").onchange = async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  $("result").innerHTML = "";
  const video = files.find((f) => f.type.startsWith("video/"));
  if (video) {
    isVideo = true;
    videoFile = video;
    $("extractRow").hidden = false;
    await doExtract();
  } else {
    isVideo = false;
    videoFile = null;
    $("extractRow").hidden = true;
    const imgs = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES);
    if (files.length > MAX_IMAGES) alert(`照片最多 ${MAX_IMAGES} 張，只取前 ${MAX_IMAGES} 張。`);
    setProgress("處理照片中…");
    try {
      frames = [];
      for (let i = 0; i < imgs.length; i++) frames.push({ ...(await imageFileToFrame(imgs[i], i)), on: true });
      setProgress("");
    } catch (err) {
      setProgress("照片讀取失敗：" + err.message);
    }
    drawFrames();
  }
};

$("btnReExtract").onclick = doExtract;

async function doExtract() {
  if (!videoFile) return;
  frames = [];
  drawFrames();
  const n = parseInt($("frameCount").value, 10);
  try {
    const { frames: fs, duration } = await extractVideoFrames(videoFile, n, (i, total) => setProgress(`擷取畫面 ${i}/${total}…`));
    frames = fs.map((f) => ({ ...f, on: true }));
    setProgress(`影片長度 ${duration.toFixed(1)} 秒，已擷取 ${frames.length} 張畫面。`);
    if (duration > 40) setProgress(`影片長度 ${duration.toFixed(1)} 秒。影片較長，建議剪成 5–20 秒、只拍 2–3 個划手週期，分析會更準。`);
  } catch (err) {
    setProgress(err.message);
  }
  drawFrames();
}

function setProgress(t) { $("progress").textContent = t; }

function drawFrames() {
  $("frames").innerHTML = frames.map((f, i) => `
    <button class="frame ${f.on ? "" : "off"}" data-i="${i}">
      <img src="${f.thumb}" alt="">
      <span>${i + 1} · ${esc(f.label)}</span>
    </button>`).join("");
  $("frames").querySelectorAll(".frame").forEach((el) => {
    el.onclick = () => { const f = frames[+el.dataset.i]; f.on = !f.on; drawFrames(); };
  });
  $("framesHint").hidden = frames.length === 0;
  $("btnAnalyze").disabled = busy || frames.filter((f) => f.on).length === 0;
}

// ---------- 分析 ----------
$("btnAnalyze").onclick = async () => {
  const chosen = frames.filter((f) => f.on);
  if (!chosen.length || busy) return;
  const coach = isCoach(currentUser);
  // 分析前重新讀取最新方案與用量
  if (!coach) {
    try { member = (await getDoc(doc(db, "users", currentUser.uid))).data(); } catch { /* 用舊資料 */ }
    const st = planStatus(member);
    if (!st.active || st.left <= 0) { renderPlan(); return; }
  }
  busy = true;
  $("btnAnalyze").disabled = true;
  $("result").innerHTML = "";
  $("status").innerHTML = `<div class="spinner"></div> AI 教練分析中，約需 10–40 秒…`;

  const form = {
    stroke: $("stroke").value,
    angle: $("angle").value,
    level: $("level").value,
    note: $("note").value.trim(),
  };
  try {
    const result = await analyzeFrames({
      ...form, frames: chosen, isVideo,
      onStatus: (t) => { $("status").innerHTML = `<div class="spinner"></div> ${esc(t)}`; },
    });
    const rec = {
      uid: currentUser.uid,
      studentName: currentUser.displayName || currentUser.email,
      studentEmail: currentUser.email,
      ...form,
      source: isVideo ? "video" : "image",
      frameLabels: chosen.map((f) => f.label),
      thumbs: chosen.map((f) => f.thumb),
      result,
      needsCoachReply: !coach && !!PLANS[member?.plan]?.coachReply && $("wantCoach").checked,
      createdAt: serverTimestamp(),
    };
    $("status").innerHTML = "";
    $("result").innerHTML = renderReport({ ...rec, studentName: "", createdAt: new Date() });
    $("result").scrollIntoView({ behavior: "smooth" });
    try {
      // 儲存紀錄並扣 1 次（同一批寫入，規則會檢查方案與次數）
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "analyses")), rec);
      if (!coach) {
        const st = planStatus(member);
        const usage = { usageMonth: currentMonth(), usageCount: st.used + 1 };
        batch.update(doc(db, "users", currentUser.uid), usage);
        member = { ...member, ...usage };
      }
      await batch.commit();
      if (rec.needsCoachReply) $("status").innerHTML = `<span class="muted">已送給教練，回覆後會出現在「我的紀錄」。</span>`;
    } catch (e) {
      $("status").innerHTML = `<span class="warn">分析完成，但儲存紀錄失敗：${esc(e.message)}</span>`;
    }
    renderPlan();
  } catch (e) {
    $("status").innerHTML = `<span class="warn">${esc(e.message)}</span>`;
  } finally {
    busy = false;
    drawFrames();
  }
};

// ---------- 歷史紀錄 ----------
let history = [];
async function loadHistory() {
  $("historyDetail").innerHTML = "";
  $("historyList").innerHTML = `<p class="muted">載入中…</p>`;
  try {
    const snap = await getDocs(query(collection(db, "analyses"), where("uid", "==", currentUser.uid)));
    history = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!history.length) {
      $("historyList").innerHTML = `<p class="muted card">還沒有分析紀錄。</p>`;
      return;
    }
    $("historyList").innerHTML = history.map((h, i) => `
      <button class="item" data-i="${i}">
        <img src="${h.thumbs?.[0] || ""}" alt="">
        <div><b>${esc(h.stroke)}</b> · ${esc(h.angle)}<br>
          <small>${fmtDate(h.createdAt)} · ${h.result?.issues?.length || 0} 個問題${h.coachComment ? " · 💬 教練回覆" : h.needsCoachReply ? " · ⏳ 等待教練回覆" : ""}</small></div>
        ${h.result?.score ? `<span class="pill">${h.result.score}</span>` : ""}
      </button>`).join("");
    $("historyList").querySelectorAll(".item").forEach((el) => {
      el.onclick = () => {
        $("historyDetail").innerHTML = renderReport({ ...history[+el.dataset.i], studentName: "" });
        $("historyDetail").scrollIntoView({ behavior: "smooth" });
      };
    });
  } catch (e) {
    $("historyList").innerHTML = `<p class="warn">載入失敗：${esc(e.message)}</p>`;
  }
}
