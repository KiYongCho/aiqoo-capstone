/* api.service.js
 * - Q&A API 호출 전담
 * - named export: askQA  (qa.js에서 import { askQA } 로 사용)
 * - 호환성: default export도 함께 제공(다른 파일이 default로 import해도 안 깨지게)
 */

export const API_BASE = "https://aiqa-capstone.onrender.com";

/**
 * 안전한 JSON 파서
 */
function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

/**
 * 공통 fetch 래퍼
 */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = safeJsonParse(text);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Q&A 요청
 * - qa.js에서 askQA(text)로 호출하므로 string 인자를 기본으로 받습니다.
 * - 확장 대비: 객체 형태({question, t, caption, videoId})도 허용
 *
 * @param {string|{question:string, t?:number, caption?:string, videoId?:string}} input
 * @returns {Promise<string>} answerText
 */
export async function askQA(input) {
  let payload;

  if (typeof input === "string") {
    const q = input.trim();
    if (!q) return "";
    payload = { question: q };
  } else if (input && typeof input === "object") {
    const q = String(input.question || "").trim();
    if (!q) return "";
    payload = {
      question: q,
      t: typeof input.t === "number" ? input.t : undefined,
      caption: input.caption ? String(input.caption) : undefined,
      videoId: input.videoId ? String(input.videoId) : undefined,
    };
  } else {
    return "";
  }

  // 백엔드 엔드포인트: /api/qa
  const data = await fetchJson(`${API_BASE}/api/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // 다양한 응답 포맷 방어
  const answer =
    (data && (data.answer || data.output || data.result || data.message)) ?? "";

  return String(answer || "");
}

// ✅ 호환성: 혹시 다른 곳에서 `import askQA from ...` 형태로 쓰고 있으면 깨질 수 있어 default도 제공
export default askQA;
