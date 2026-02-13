/* modal.view.js
 * - 답변 크게보기 모달
 * - 반영:
 *   - 전체화면 overlay + 중앙 모달
 *   - 복사 버튼
 *   - 마크다운 렌더링 + 코드블록 스타일
 */

import { renderMarkdownSafe, bindMarkdownCopyButtons } from "/js/util/markdown.util.js";

function ensureModalStyles() {
  if (document.getElementById("aiqoo-modal-style")) return;

  const style = document.createElement("style");
  style.id = "aiqoo-modal-style";
  style.textContent = `
    .aiqoo-modal-overlay{
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      padding: 18px;
    }
    .aiqoo-modal{
      width: min(980px, 96vw);
      height: min(82vh, 860px);
      background: #0b1220;
      border: 1px solid #1f2937;
      border-radius: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.45);
      display:flex;
      flex-direction: column;
      overflow:hidden;
      color:#e5e7eb;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif;
    }
    .aiqoo-modal-header{
      display:flex;
      justify-content: space-between;
      align-items:center;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid #1f2937;
      background: rgba(17,24,39,0.75);
    }
    .aiqoo-modal-title{
      font-weight: 700;
      font-size: 14px;
      color:#f3f4f6;
    }
    .aiqoo-modal-actions{
      display:flex;
      gap: 8px;
      align-items:center;
    }
    .aiqoo-modal-btn{
      cursor:pointer;
      border:1px solid #374151;
      background: transparent;
      color:#e5e7eb;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 13px;
    }
    .aiqoo-modal-btn:hover{ background:#0f1a33; }
    .aiqoo-modal-body{
      padding: 14px;
      overflow: auto;
      height: 100%;
    }

    /* 마크다운 스타일(qa.view.js와 유사) */
    .aiqoo-modal-body .md-text{
      line-height: 1.6;
      font-size: 14px;
      color:#e5e7eb;
      word-break: break-word;
    }
    .aiqoo-modal-body .md-inline-code{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
      background: rgba(148,163,184,0.15);
      border: 1px solid rgba(148,163,184,0.25);
      padding: 2px 6px;
      border-radius: 8px;
      color:#f3f4f6;
    }
    .aiqoo-modal-body .md-codeblock{
      border:1px solid #374151;
      border-radius: 14px;
      overflow:hidden;
      background:#0b1220;
      margin: 12px 0;
    }
    .aiqoo-modal-body .md-codebar{
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding: 10px 12px;
      border-bottom:1px solid #1f2937;
      background: rgba(17,24,39,0.65);
    }
    .aiqoo-modal-body .md-lang{
      font-size: 12px;
      color:#9ca3af;
    }
    .aiqoo-modal-body .md-copy-btn{
      cursor:pointer;
      border:1px solid #374151;
      background: transparent;
      color:#e5e7eb;
      border-radius:10px;
      padding: 7px 9px;
      font-size: 12px;
    }
    .aiqoo-modal-body .md-copy-btn:hover{ background:#0f1a33; }
    .aiqoo-modal-body .md-pre{
      margin:0;
      padding: 12px;
      overflow:auto;
    }
    .aiqoo-modal-body .md-code{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.55;
      color:#e5e7eb;
    }
  `;
  document.head.appendChild(style);
}

let $overlay = null;

export function openAnswerModal(answerText = "") {
  ensureModalStyles();

  // 이미 떠있으면 내용만 갱신
  if ($overlay) {
    const body = $overlay.querySelector(".aiqoo-modal-body");
    body.innerHTML = renderMarkdownSafe(answerText || "");
    bindMarkdownCopyButtons(body);
    $overlay.__answerText = answerText || "";
    return;
  }

  $overlay = document.createElement("div");
  $overlay.className = "aiqoo-modal-overlay";
  $overlay.innerHTML = `
    <div class="aiqoo-modal" role="dialog" aria-modal="true">
      <div class="aiqoo-modal-header">
        <div class="aiqoo-modal-title">답변 크게보기</div>
        <div class="aiqoo-modal-actions">
          <button class="aiqoo-modal-btn" data-act="copy">복사</button>
          <button class="aiqoo-modal-btn" data-act="close">닫기</button>
        </div>
      </div>
      <div class="aiqoo-modal-body"></div>
    </div>
  `;

  $overlay.__answerText = answerText || "";

  const $modal = $overlay.querySelector(".aiqoo-modal");
  const $body = $overlay.querySelector(".aiqoo-modal-body");

  $body.innerHTML = renderMarkdownSafe($overlay.__answerText);
  bindMarkdownCopyButtons($body);

  function close() {
    if (!$overlay) return;
    document.removeEventListener("keydown", onKeyDown);
    $overlay.remove();
    $overlay = null;
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText($overlay.__answerText || "");
      const btn = $overlay.querySelector('[data-act="copy"]');
      const old = btn.textContent;
      btn.textContent = "복사됨";
      setTimeout(() => (btn.textContent = old), 900);
    } catch (err) {
      console.error(err);
      const btn = $overlay.querySelector('[data-act="copy"]');
      btn.textContent = "실패";
      setTimeout(() => (btn.textContent = "복사"), 900);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") close();
  }

  $overlay.addEventListener("click", (e) => {
    // 오버레이 바깥 클릭 시 닫기
    if (e.target === $overlay) close();
  });

  $overlay.querySelector('[data-act="close"]').addEventListener("click", close);
  $overlay.querySelector('[data-act="copy"]').addEventListener("click", copyAll);

  // 모달 내부 클릭은 오버레이 닫기 방지
  $modal.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild($overlay);
}
