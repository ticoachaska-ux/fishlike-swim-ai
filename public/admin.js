import { db, login, logout, watchAuth, isCoach, esc, fmtDate } from "./common.js?v=4";
import {
  collection, getDocs, doc, updateDoc, query, where, orderBy, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { renderReport } from "./render.js?v=4";
import {
  STROKES, AREAS, MAX_KB_IMAGES, saveCoachNote, imageFileToDataUrl,
} from "./kb.js?v=4";
import { KB_SEED } from "./kb-seed.js?v=4";
import {
  addDoc, setDoc, deleteDoc, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
    $("tabKb").hidden = b.dataset.tab !== "kb";
    if (b.dataset.tab === "analyses") loadAnalyses();
    if (b.dataset.tab === "kb") loadKb();
  };
});

document.querySelectorAll("#tabMembers .filters .chip").forEach((c) => {
  c.onclick = () => {
    filter = c.dataset.f;
    document.querySelectorAll("#tabMembers .filters .chip").forEach((x) => x.classList.toggle("active", x === c));
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
      <label class="check"><input type="checkbox" id="shareNote" ${a.coachNoteShared === false ? "" : "checked"}> 讓 AI 以後參考這則修正（不含學生姓名）</label>
      <button id="btnSaveComment" class="btn primary">儲存回覆</button> <span id="saveMsg" class="muted"></span>
    </div>`;
  $("btnSaveComment").onclick = async () => {
    const text = $("coachText").value.trim();
    const share = $("shareNote").checked;
    try {
      await updateDoc(doc(db, "analyses", a.id), { coachComment: text, coachNoteShared: share, coachCommentAt: serverTimestamp() });
      await saveCoachNote(a, text, share);
      a.coachComment = text;
      a.coachNoteShared = share;
      $("saveMsg").textContent = "已儲存";
    } catch (e) {
      $("saveMsg").textContent = "儲存失敗：" + e.message;
    }
  };
  $("analysisDetail").scrollIntoView({ behavior: "smooth" });
}

// ---------- 知識庫 ----------
let kb = [];
let kbStroke = STROKES[0];
let editing = null; // 編輯中的條目（含 images 暫存）

$("kbStrokes").innerHTML = STROKES.map((s) =>
  `<button class="chip ${s === kbStroke ? "active" : ""}" data-s="${s}">${s} <b data-count="${s}">0</b></button>`).join("");
$("kbStrokes").querySelectorAll(".chip").forEach((c) => {
  c.onclick = () => {
    kbStroke = c.dataset.s;
    $("kbStrokes").querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
    closeEditor();
    drawKb();
  };
});

async function loadKb() {
  $("kbList").innerHTML = `<p class="muted">載入中…</p>`;
  try {
    const snap = await getDocs(collection(db, "knowledge"));
    kb = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("btnKbSeed").hidden = kb.length > 0;
    drawKb();
    loadNotes();
  } catch (e) {
    $("kbList").innerHTML = `<p class="warn">載入失敗：${esc(e.message)}</p>`;
  }
}

function drawKb() {
  STROKES.forEach((s) => {
    const el = $("kbStrokes").querySelector(`[data-count="${s}"]`);
    if (el) el.textContent = kb.filter((k) => k.stroke === s).length;
  });
  const list = kb.filter((k) => k.stroke === kbStroke).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  if (!list.length) { $("kbList").innerHTML = `<p class="muted card">這個泳式還沒有條目。</p>`; return; }
  $("kbList").innerHTML = list.map((k) => `
    <div class="kb-item ${k.active === false ? "off" : ""}">
      <div class="kb-head">
        <span class="tag area">${esc(k.area)}</span>
        <b>${esc(k.title)}</b>
        ${k.active === false ? `<span class="muted small">（停用）</span>` : ""}
        <button class="btn small" data-edit="${k.id}">編輯</button>
      </div>
      <p class="small"><span class="muted">特徵：</span>${esc(k.signs)}</p>
      <p class="small"><span class="muted">修正：</span>${esc(k.fix)}</p>
      ${(k.images || []).length ? `<div class="kb-imgs">${k.images.map((im) =>
        `<figure><img src="${im.data}" alt=""><figcaption class="${im.kind === "correct" ? "ok" : "ng"}">${im.kind === "correct" ? "✓ 正確" : "✗ 錯誤"} ${esc(im.caption || "")}</figcaption></figure>`).join("")}</div>` : ""}
    </div>`).join("");
  $("kbList").querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => openEditor(kb.find((k) => k.id === b.dataset.edit));
  });
}

$("btnKbNew").onclick = () => openEditor({
  stroke: kbStroke, area: AREAS[0], title: "", signs: "", cause: "", fix: "", drill: "",
  order: kb.filter((k) => k.stroke === kbStroke).length + 1, active: true, images: [],
});

function closeEditor() { editing = null; $("kbEditor").innerHTML = ""; }

function openEditor(item) {
  editing = { ...item, images: [...(item.images || [])] };
  const opt = (arr, v) => arr.map((x) => `<option ${x === v ? "selected" : ""}>${x}</option>`).join("");
  $("kbEditor").innerHTML = `
    <div class="card editor">
      <h3>${item.id ? "編輯條目" : "新增條目"}</h3>
      <div class="grid2">
        <label>泳式<select id="kStroke">${opt(STROKES, item.stroke)}</select></label>
        <label>部位<select id="kArea">${opt(AREAS, item.area)}</select></label>
        <label>排序<input id="kOrder" type="number" min="1" value="${esc(item.order ?? 1)}"></label>
      </div>
      <label>錯誤名稱<input id="kTitle" value="${esc(item.title)}" placeholder="例如：換氣抬頭過高"></label>
      <label>畫面特徵（AI 用來辨識，寫越具體越好）<textarea id="kSigns" rows="3">${esc(item.signs)}</textarea></label>
      <label>原因與影響<textarea id="kCause" rows="2">${esc(item.cause)}</textarea></label>
      <label>修正方法／口訣<textarea id="kFix" rows="2">${esc(item.fix)}</textarea></label>
      <label>分解練習<textarea id="kDrill" rows="2">${esc(item.drill)}</textarea></label>
      <label class="check"><input type="checkbox" id="kActive" ${item.active === false ? "" : "checked"}> 啟用（AI 會參考）</label>
      <h4>示範圖（最多 ${MAX_KB_IMAGES} 張）</h4>
      <div id="kImgs" class="kb-imgs"></div>
      <div class="row" id="kImgAdd">
        <label>類型<select id="kImgKind"><option value="wrong">✗ 錯誤示範</option><option value="correct">✓ 正確示範</option></select></label>
        <label>說明<input id="kImgCap" placeholder="例如：頭抬太高"></label>
        <label class="btn small filebtn">選擇圖片<input id="kImgFile" type="file" accept="image/*" hidden></label>
      </div>
      <div class="row">
        <button id="kSave" class="btn primary">儲存</button>
        <button id="kCancel" class="btn">取消</button>
        ${item.id ? `<button id="kDelete" class="btn danger">刪除</button>` : ""}
        <span id="kMsg" class="muted small"></span>
      </div>
    </div>`;
  drawEditorImages();
  $("kImgFile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (editing.images.length >= MAX_KB_IMAGES) { alert(`最多 ${MAX_KB_IMAGES} 張`); return; }
    $("kMsg").textContent = "處理圖片中…";
    editing.images.push({ data: await imageFileToDataUrl(f), kind: $("kImgKind").value, caption: $("kImgCap").value.trim() });
    $("kImgCap").value = "";
    e.target.value = "";
    $("kMsg").textContent = "";
    drawEditorImages();
  };
  $("kCancel").onclick = closeEditor;
  $("kSave").onclick = saveEditor;
  if (item.id) $("kDelete").onclick = deleteEditor;
  $("kbEditor").scrollIntoView({ behavior: "smooth" });
}

function drawEditorImages() {
  $("kImgs").innerHTML = editing.images.map((im, i) => `
    <figure><img src="${im.data}" alt="">
      <figcaption class="${im.kind === "correct" ? "ok" : "ng"}">${im.kind === "correct" ? "✓ 正確" : "✗ 錯誤"} ${esc(im.caption || "")}</figcaption>
      <button class="btn small danger" data-rm="${i}">移除</button></figure>`).join("");
  $("kImgs").querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => { editing.images.splice(+b.dataset.rm, 1); drawEditorImages(); };
  });
  $("kImgAdd").hidden = editing.images.length >= MAX_KB_IMAGES;
}

async function saveEditor() {
  const data = {
    stroke: $("kStroke").value,
    area: $("kArea").value,
    order: parseInt($("kOrder").value, 10) || 99,
    title: $("kTitle").value.trim(),
    signs: $("kSigns").value.trim(),
    cause: $("kCause").value.trim(),
    fix: $("kFix").value.trim(),
    drill: $("kDrill").value.trim(),
    active: $("kActive").checked,
    images: editing.images,
    updatedAt: serverTimestamp(),
  };
  if (!data.title || !data.signs) { $("kMsg").textContent = "請填寫錯誤名稱與畫面特徵"; return; }
  $("kSave").disabled = true;
  $("kMsg").textContent = "儲存中…";
  try {
    if (editing.id) await setDoc(doc(db, "knowledge", editing.id), data);
    else await addDoc(collection(db, "knowledge"), data);
    kbStroke = data.stroke;
    closeEditor();
    await loadKb();
    $("kbStrokes").querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x.dataset.s === kbStroke));
  } catch (e) {
    $("kMsg").textContent = "儲存失敗：" + e.message;
    $("kSave").disabled = false;
  }
}

async function deleteEditor() {
  if (!confirm(`確定刪除「${editing.title}」？`)) return;
  try {
    await deleteDoc(doc(db, "knowledge", editing.id));
    closeEditor();
    await loadKb();
  } catch (e) {
    $("kMsg").textContent = "刪除失敗：" + e.message;
  }
}

$("btnKbSeed").onclick = async () => {
  $("btnKbSeed").disabled = true;
  try {
    const batch = writeBatch(db);
    KB_SEED.forEach((k) => batch.set(doc(collection(db, "knowledge")), { ...k, active: true, images: [], updatedAt: serverTimestamp() }));
    await batch.commit();
    await loadKb();
  } catch (e) {
    alert("載入失敗：" + e.message);
    $("btnKbSeed").disabled = false;
  }
};

async function loadNotes() {
  try {
    const snap = await getDocs(collection(db, "coachNotes"));
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    $("noteList").innerHTML = notes.length ? notes.map((n) => `
      <div class="item note"><div><b>${esc(n.stroke)}</b> · <small>${fmtDate(n.createdAt)}</small><br>${esc(n.comment)}
        ${n.aiIssues?.length ? `<br><small class="muted">AI 原本判斷：${esc(n.aiIssues.join("、"))}</small>` : ""}</div>
        <button class="btn small danger" data-note="${esc(n.id)}">移除</button></div>`).join("")
      : `<p class="muted card">目前沒有。</p>`;
    $("noteList").querySelectorAll("[data-note]").forEach((b) => {
      b.onclick = async () => {
        await deleteDoc(doc(db, "coachNotes", b.dataset.note));
        await updateDoc(doc(db, "analyses", b.dataset.note), { coachNoteShared: false }).catch(() => {});
        loadNotes();
      };
    });
  } catch (e) {
    $("noteList").innerHTML = `<p class="warn">載入失敗：${esc(e.message)}</p>`;
  }
}
