import {
  db, login, logout, watchAuth, ensureMember, isCoach, esc, fmtDate,
} from "./common.js?v=3";
import {
  collection, addDoc, getDocs, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { extractVideoFrames, imageFileToFrame, analyzeFrames } from "./analyzer.js?v=3";
import { renderReport } from "./render.js?v=3";
import { MAX_IMAGES, DEFAULT_FRAME_COUNT } from "./config.js?v=3";

const $ = (id) => document.getElementById(id);
let currentUser = null;
let frames = [];          // { full, thumb, time, label, on }
let isVideo = false;
let videoFile = null;
let busy = false;

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
    const m = await ensureMember(user);
    if (isCoach(user) || m.status === "approved") return show("vApp");
    if (m.status === "blocked") return show("vBlocked");
    $("pendingEmail").textContent = user.email;
    show("vPending");
  } catch (e) {
    alert("讀取會員資料失敗：" + e.message);
  }
});

$("btnLogin").onclick = () => login().catch((e) => alert("登入失敗：" + e.message));
$("btnRefresh").onclick = () => location.reload();

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
      createdAt: serverTimestamp(),
    };
    $("status").innerHTML = "";
    $("result").innerHTML = renderReport({ ...rec, studentName: "", createdAt: new Date() });
    $("result").scrollIntoView({ behavior: "smooth" });
    try {
      await addDoc(collection(db, "analyses"), rec);
    } catch (e) {
      $("status").innerHTML = `<span class="warn">分析完成，但儲存紀錄失敗：${esc(e.message)}</span>`;
    }
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
          <small>${fmtDate(h.createdAt)} · ${h.result?.issues?.length || 0} 個問題${h.coachComment ? " · 💬 教練回覆" : ""}</small></div>
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
