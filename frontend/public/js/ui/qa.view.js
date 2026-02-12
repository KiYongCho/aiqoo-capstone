// public/js/qa.view.js
import { escapeHtml, snippet } from "./utils.js";

export function renderQA(container, items) {
  if (!container) return;
  container.innerHTML = "";

  // 최신이 위로
  items.slice().reverse().forEach((item, idxFromTop) => {
    const originalIndex = items.length - 1 - idxFromTop;

    const q = escapeHtml(item.question || "");
    const a = escapeHtml(item.answer || "");
    const tLabel = escapeHtml(item.tLabel || "00:00");
    const createdAt = escapeHtml(item.createdAt || "");
    const provider = escapeHtml(item.provider || "");

    const div = document.createElement("div");
    div.className = "qa-item";

    div.innerHTML = `
      <div class="qa-meta">
        ⏱ ${tLabel}
        <span class="qa-dot">·</span> ${createdAt}
        ${provider ? `<span class="qa-dot">·</span> ${provider}` : ``}
      </div>

      <div class="qa-q">
        <div class="qa-label">Q</div>
        <div class="qa-text">${q}</div>
      </div>

      <div class="qa-a">
        <div class="qa-label">A</div>
        <div class="qa-text">${a}</div>
      </div>

      <div class="qa-actions">
        <button type="button" class="qa-pill-btn" data-action="zoom" data-index="${originalIndex}">
          🔎 크게보기
        </button>
        <button type="button" class="qa-pill-btn qa-share-kakao" data-action="kakao" data-index="${originalIndex}">
          💬 카톡 공유
        </button>
        <button type="button" class="qa-pill-btn qa-share-mail" data-action="mail" data-index="${originalIndex}">
          ✉️ 메일
        </button>

        <span class="qa-snippet">
          ${escapeHtml(snippet(item.answer || "", 60))}
        </span>
      </div>
    `;

    container.appendChild(div);
  });
}
