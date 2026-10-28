// 動作知識庫與教練修正紀錄（AI 分析時參考）
import { db } from "./common.js?v=4";
import {
  collection, getDocs, query, where, doc, setDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export const STROKES = ["自由式", "蛙式", "仰式", "蝶式"];
export const AREAS = ["頭部", "身體軸線", "手臂", "換氣", "腿部", "節奏"];
export const MAX_KB_IMAGES = 2;        // 每個條目最多 2 張示範圖
export const MAX_PROMPT_REF_IMAGES = 6; // 每次分析最多附 6 張示範圖給 AI
export const MAX_COACH_NOTES = 8;       // 每次分析參考最近 8 則教練修正

// 某泳式的知識庫條目（只取啟用中的，依排序）
export async function loadKnowledge(stroke) {
  const snap = await getDocs(query(collection(db, "knowledge"), where("stroke", "==", stroke)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((k) => k.active !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

// 某泳式最近的教練修正意見
export async function loadCoachNotes(stroke) {
  const snap = await getDocs(query(collection(db, "coachNotes"), where("stroke", "==", stroke)));
  return snap.docs.map((d) => d.data())
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, MAX_COACH_NOTES);
}

// 教練回覆時，另存一份不含學生身分的修正紀錄給 AI 參考（以分析 ID 為文件 ID，重存會覆蓋）
export async function saveCoachNote(analysis, comment, share) {
  const ref = doc(db, "coachNotes", analysis.id);
  if (!comment || !share) { await deleteDoc(ref).catch(() => {}); return; }
  await setDoc(ref, {
    stroke: analysis.stroke,
    angle: analysis.angle || "",
    aiIssues: (analysis.result?.issues || []).map((i) => i.title).slice(0, 5),
    comment,
    createdAt: serverTimestamp(),
  });
}

// 示範圖縮小後存成 dataURL（每張約 50–120KB）
export async function imageFileToDataUrl(file, maxW = 640, quality = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
