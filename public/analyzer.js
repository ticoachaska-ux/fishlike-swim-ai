// 影像處理（抽幀、縮圖）與 AI 判讀
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-ai.js";
import { app } from "./common.js?v=5";
import { AI_MODELS } from "./config.js?v=5";
import { loadKnowledge, loadCoachNotes, MAX_PROMPT_REF_IMAGES } from "./kb.js?v=5";

const ai = getAI(app, { backend: new GoogleAIBackend() });
const models = AI_MODELS.map((name) => ({
  name,
  m: getGenerativeModel(ai, {
    model: name,
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  }),
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isBusy = (msg) => /\b(500|503|429)\b|high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|quota/i.test(msg);

// 依序嘗試各模型；伺服器忙碌時每個模型重試 2 次，再換下一個
async function generateWithFallback(parts, onStatus) {
  let lastErr;
  for (const { name, m } of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await m.generateContent(parts);
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message || e);
        console.warn(`[AI] ${name} 第 ${attempt + 1} 次失敗：`, msg);
        if (!isBusy(msg)) throw e;
        onStatus?.(`AI 伺服器忙碌，自動重試中…`);
        await sleep(2000 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

// ---------- 影像處理 ----------
function drawScaled(source, w, h, maxW, quality) {
  const scale = Math.min(1, maxW / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

function makeFrame(source, w, h, time = null, label = "") {
  return {
    full: drawScaled(source, w, h, 960, 0.82),   // 送 AI
    thumb: drawScaled(source, w, h, 260, 0.6),   // 存紀錄、顯示
    time,
    label,
  };
}

export async function imageFileToFrame(file, idx) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return makeFrame(img, img.naturalWidth, img.naturalHeight, null, `圖片 ${idx + 1}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = t;
    setTimeout(done, 5000);
  });
}

// 從影片平均擷取 n 張畫面（避開最前與最後）
export async function extractVideoFrames(file, n, onProgress) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("這個影片格式瀏覽器無法讀取，請改用 MP4，或先截圖上傳。"));
      setTimeout(() => reject(new Error("讀取影片逾時，請改用較短的影片。")), 20000);
    });
    // 部分 Android 瀏覽器要先播放一下才抓得到畫面
    try { await video.play(); video.pause(); } catch { /* 忽略 */ }

    const d = video.duration;
    if (!isFinite(d) || d <= 0) throw new Error("讀不到影片長度，請改用 MP4。");
    const w = video.videoWidth, h = video.videoHeight;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(d - 0.05, d * (i + 0.5) / n);
      await seek(video, t);
      frames.push(makeFrame(video, w, h, t, `${t.toFixed(1)} 秒`));
      onProgress?.(i + 1, n);
    }
    return { frames, duration: d };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// ---------- AI 判讀 ----------
function buildPrompt({ stroke, angle, level, note, frames, isVideo }, kb = [], notes = [], refs = []) {
  const list = frames.map((f, i) => `第 ${i + 1} 張：${f.label}`).join("\n");
  const kbText = kb.length ? `
【教練知識庫：${stroke}常見錯誤】（請優先依此判讀，名稱、修正、練習請沿用教練寫法）
${kb.map((k, i) => `K${i + 1}. ${k.title}（${k.area}）
  畫面特徵：${k.signs}
  原因與影響：${k.cause || "—"}
  修正方法：${k.fix || "—"}
  分解練習：${k.drill || "—"}`).join("\n")}
` : "";
  const refText = refs.length ? `
【示範參考圖】學生畫面之後附上的圖片是教練提供的示範，不是學生本人，不要分析它們：
${refs.map((r, i) => `參考圖 R${i + 1}：${r.kind === "correct" ? "正確示範" : "錯誤示範"} — ${r.title}${r.caption ? "（" + r.caption + "）" : ""}`).join("\n")}
` : "";
  const noteText = notes.length ? `
【教練過去的修正意見】（教練曾修正 AI 的判斷，請記取並遵守）
${notes.map((n) => `- ${n.angle ? n.angle + "；" : ""}AI 當時判斷：${(n.aiIssues || []).join("、") || "—"} → 教練修正：${n.comment}`).join("\n")}
` : "";
  return `你是一位專業游泳教練，專長技術動作分析，教學理念重視「流線型、減少阻力、放鬆省力」。
請根據學生上傳的${isVideo ? "影片擷取畫面（依時間順序）" : "照片"}，找出錯誤動作並提供解決方案。

學生資料：
- 泳式：${stroke}
- 拍攝角度：${angle}
- 程度：${level}
- 學生想問的問題：${note || "（未填寫）"}

畫面清單（學生本人，共 ${frames.length} 張，請只分析這些）：
${list}
${kbText}${refText}${noteText}
分析重點（依泳式挑相關的）：頭部位置與視線、身體軸線與水平、髖部高度、入水點與入水角度、抱水（高肘）、推水路徑與長度、出水與移臂、換氣時機與幅度、打腿幅度與膝蓋彎曲、蛙式收腿/翻腳/夾腿、蝶式波浪與手腳配合、整體節奏。

規則：
1. 只描述畫面中真的看得到的現象；看不清楚的部位要說明看不清楚，不要猜測。
2. 錯誤依影響大小排序，最多 5 項，最重要的放第一。
3. 每個錯誤都要指出出現在第幾張畫面（frame，1 開始；若無法對應填 0）。
4. 用繁體中文、口語、學生看得懂的說法，避免艱深術語；用到術語時順便解釋。
5. 若畫面不是游泳或完全無法判讀，issues 給空陣列，並在 imageQuality 說明原因與重拍建議。
6. 若某個錯誤符合知識庫條目，title、fix、drill 請沿用該條目內容（可依畫面補充），並在 kb 欄填條目名稱；知識庫沒有的錯誤也可以提出，kb 填空字串。
7. 不要因為知識庫有某條目就硬套，畫面看不到就不要列。

只輸出以下 JSON，不要任何其他文字：
{
  "summary": "整體評語，2-3 句",
  "score": 1 到 10 的整數（技術完成度）,
  "strengths": ["做得好的地方，1-3 項"],
  "issues": [
    {
      "frame": 數字,
      "title": "錯誤名稱（短）",
      "area": "頭部 / 身體軸線 / 手臂 / 換氣 / 腿部 / 節奏 其一",
      "severity": "高 / 中 / 低 其一",
      "observation": "畫面中看到什麼",
      "cause": "為什麼會這樣、會造成什麼影響",
      "fix": "怎麼修正（具體的身體感覺或口訣）",
      "drill": "建議的分解練習名稱與做法",
      "kb": "符合的知識庫條目名稱，沒有就空字串"
    }
  ],
  "practicePlan": ["下次練習的 3-5 個步驟，含組數或距離"],
  "imageQuality": "拍攝建議（角度、光線、距離），沒有問題就寫空字串"
}`;
}

function parseJSON(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("AI 回覆格式錯誤，請再試一次。");
  }
}

export async function analyzeFrames(opts) {
  // 讀取知識庫與教練修正（失敗不影響分析）
  let kb = [], notes = [];
  try { [kb, notes] = await Promise.all([loadKnowledge(opts.stroke), loadCoachNotes(opts.stroke)]); }
  catch (e) { console.warn("[KB] 讀取失敗，改用一般分析", e); }
  const refs = [];
  for (const k of kb) for (const im of k.images || []) {
    if (refs.length < MAX_PROMPT_REF_IMAGES) refs.push({ ...im, title: k.title });
  }
  const parts = [buildPrompt(opts, kb, notes, refs)];
  for (const f of opts.frames) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: f.full.split(",")[1] } });
  }
  for (const r of refs) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: r.data.split(",")[1] } });
  }
  let result;
  try {
    result = await generateWithFallback(parts, opts.onStatus);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error("今天的 AI 使用量已達上限，請明天再試。");
    if (isBusy(msg)) throw new Error("Google AI 伺服器目前太忙，請過幾分鐘再按一次「開始 AI 分析」。");
    if (/api-not-enabled|not been used|disabled/i.test(msg)) throw new Error("Firebase AI Logic 尚未啟用，請教練到 Firebase Console 開啟。");
    throw new Error("AI 分析失敗：" + msg);
  }
  const data = parseJSON(result.response.text());
  data.issues = Array.isArray(data.issues) ? data.issues.slice(0, 5) : [];
  data.strengths = Array.isArray(data.strengths) ? data.strengths : [];
  data.practicePlan = Array.isArray(data.practicePlan) ? data.practicePlan : [];
  const s = parseInt(data.score, 10);
  data.score = Number.isFinite(s) ? Math.max(1, Math.min(10, s)) : null;
  data.kbUsed = { entries: kb.length, refImages: refs.length, coachNotes: notes.length };
  return data;
}
