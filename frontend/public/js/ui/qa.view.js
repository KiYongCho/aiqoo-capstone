// /js/ui/qa.view.js
// - Q/A는 질문(❓)만 이모지 표시 (요구사항: 답변 레이어의 💡 제거)
// - 버튼 중앙 정렬 + 답변삭제 버튼 추가

import { normalizeText } from "/js/core/utils.js";
import { markdownToSafeHTML } from "/js/core/markdown.util.js";

function escapeHTML(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAnswerToHTML(answer) {
  const a = normalizeText(answer);
  if (!a) return "";
  return markdownToSafeHTML(a);
}

function getListContainer(containerEl) {
  if (!containerEl) return null;
  // qa.html에서는 #qaList 자체가 스크롤 컨테이너이자 리스트 컨테이너
  return containerEl;
}

export function clearQA(containerEl) {
  const list = getListContainer(containerEl);
  if (!list) return;
  list.innerHTML = "";
}

function actionBarHTML({ q, a, metaText }) {
  // ✅ 버튼 텍스트: 크게보기 / 카톡공유 / 복사하기 / 메일보내기 / 답변삭제
  // ✅ 모두 중앙 정렬
  return `
    <div class="aiqoo-qa-actions mt-2 flex flex-wrap gap-2 items-center justify-center">
      <button type="button" class="qa-pill-btn qa-answer-zoombtn"
        data-act="zoom"
        data-a="${escapeHTML(a)}"
        data-meta="${escapeHTML(metaText)}">🔎 크게보기</button>

      <button type="button" class="qa-pill-btn qa-share-kakao"
        data-act="kakao"
        data-q="${escapeHTML(q)}"
        data-a="${escapeHTML(a)}">💬 카톡공유</button>

      <button type="button" class="qa-pill-btn"
        data-act="copy"
        data-full="${escapeHTML(`❓ 질문\n${q}\n\n답변\n${a}`)}">📋 복사하기</button>

      <button type="button" class="qa-pill-btn"
        data-act="email"
        data-q="${escapeHTML(q)}"
        data-a="${escapeHTML(a)}"
        data-meta="${escapeHTML(metaText)}">✉️ 메일보내기</button>

      <button type="button" class="qa-pill-btn qa-pill-danger"
        data-act="delete"
        data-q="${escapeHTML(q)}"
        data-a="${escapeHTML(a)}"
        data-meta="${escapeHTML(metaText)}">🗑️ 답변삭제</button>
    </div>
  `;
}

/**
 * item: { id?, question, answer, createdAt?, meta?{tLabel?} }
 * options: { mode: "append"|"prepend"|"replace" }
 */
export function renderQA(containerEl, item, options = {}) {
  const list = getListContainer(containerEl);
  if (!list) return false;

  const mode = options.mode || "append";

  const q = normalizeText(item?.question);
  const a = normalizeText(item?.answer);

  // ✅ 빈 카드 방지
  if (!q || !a) return false;

  if (mode === "replace") {
    list.innerHTML = "";
  }

  const createdAt = normalizeText(item?.createdAt || "");
  const tLabel = normalizeText(item?.meta?.tLabel || "");
  const metaText = [createdAt, tLabel ? `⏱ ${tLabel}` : ""].filter(Boolean).join(" · ");

  const wrapper = document.createElement("div");
  wrapper.className = "aiqoo-qa-item";
  if (item?.id) wrapper.dataset.id = String(item.id);

  // ✅ 액션바를 답변 위/아래 모두 배치
  const actionsTop = actionBarHTML({ q, a, metaText });
  const actionsBottom = actionBarHTML({ q, a, metaText });

  wrapper.innerHTML = `
    <div class="aiqoo-qa-row aiqoo-qa-question">
      <span class="aiqoo-qa-icon" aria-hidden="true">❓</span>
      <span class="aiqoo-qa-text">${escapeHTML(q)}</span>
    </div>

    <div class="aiqoo-qa-row aiqoo-qa-answer">
      <div class="aiqoo-qa-text aiqoo-qa-answer-wrap">
        ${actionsTop}
        <div class="aiqoo-qa-answer-text">${formatAnswerToHTML(a)}</div>
        ${actionsBottom}
      </div>
    </div>

    <div class="mt-2 text-right text-[11px] font-semibold text-zinc-500 whitespace-nowrap">
      ${escapeHTML(metaText)}
    </div>
  `;

  if (mode === "prepend") list.prepend(wrapper);
  else list.appendChild(wrapper);

  return true;
}

export function renderQAList(containerEl, items = []) {
  clearQA(containerEl);
  const list = getListContainer(containerEl);
  if (!list) return;

  // items는 "최신 -> 과거" 순서라고 가정
  for (const it of items) {
    renderQA(list, it, { mode: "append" });
  }
}
