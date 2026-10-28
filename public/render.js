// 分析結果畫面（學生端與教練後台共用）
import { esc, fmtDate } from "./common.js?v=4";

const SEV = { 高: "sev-high", 中: "sev-mid", 低: "sev-low" };

export function renderReport(rec) {
  const r = rec.result || {};
  const thumbs = rec.thumbs || [];
  const labels = rec.frameLabels || [];
  const issues = (r.issues || []).map((it, i) => {
    const fi = (parseInt(it.frame, 10) || 0) - 1;
    const img = thumbs[fi]
      ? `<figure class="issue-img"><img src="${thumbs[fi]}" alt="第 ${fi + 1} 張"><figcaption>第 ${fi + 1} 張 · ${esc(labels[fi] || "")}</figcaption></figure>`
      : "";
    return `
      <article class="issue">
        <header>
          <span class="num">${i + 1}</span>
          <h4>${esc(it.title)}</h4>
          <span class="tag ${SEV[it.severity] || "sev-mid"}">${esc(it.severity || "中")}</span>
        </header>
        ${it.kb ? `<div class="kb-tag">📘 教練知識庫：${esc(it.kb)}</div>` : ""}
        ${img}
        <dl>
          <dt>部位</dt><dd>${esc(it.area)}</dd>
          <dt>看到的問題</dt><dd>${esc(it.observation)}</dd>
          <dt>原因與影響</dt><dd>${esc(it.cause)}</dd>
          <dt>修正方法</dt><dd>${esc(it.fix)}</dd>
          <dt>分解練習</dt><dd>${esc(it.drill)}</dd>
        </dl>
      </article>`;
  }).join("");

  return `
    <div class="report">
      <div class="report-head">
        <div>
          <div class="meta">${esc(rec.stroke)} · ${esc(rec.angle)} · ${fmtDate(rec.createdAt)}</div>
          ${rec.studentName ? `<div class="meta">學生：${esc(rec.studentName)}</div>` : ""}
          <p class="summary">${esc(r.summary)}</p>
        </div>
        ${r.score ? `<div class="score"><b>${r.score}</b><small>/10</small></div>` : ""}
      </div>
      ${rec.note ? `<p class="ask">學生提問：${esc(rec.note)}</p>` : ""}
      <div class="strip">${thumbs.map((t, i) => `<figure><img src="${t}" alt=""><figcaption>${i + 1}</figcaption></figure>`).join("")}</div>
      ${r.strengths?.length ? `<section><h3>做得好的地方</h3><ul class="good">${r.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}
      <section><h3>需要修正的動作</h3>${issues || `<p class="muted">沒有找到明顯錯誤。</p>`}</section>
      ${r.practicePlan?.length ? `<section><h3>下次練習計畫</h3><ol class="plan">${r.practicePlan.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></section>` : ""}
      ${r.imageQuality ? `<section class="hint"><h3>拍攝建議</h3><p>${esc(r.imageQuality)}</p></section>` : ""}
      ${rec.coachComment ? `<section class="coach"><h3>教練補充</h3><p>${esc(rec.coachComment)}</p></section>` : ""}
      ${r.kbUsed && (r.kbUsed.entries || r.kbUsed.coachNotes) ? `<p class="disclaimer">本次參考教練知識庫 ${r.kbUsed.entries} 條${r.kbUsed.refImages ? `、示範圖 ${r.kbUsed.refImages} 張` : ""}${r.kbUsed.coachNotes ? `、教練修正 ${r.kbUsed.coachNotes} 則` : ""}。</p>` : ""}
      <p class="disclaimer">AI 分析僅供參考，請以教練現場指導為準。</p>
    </div>`;
}
