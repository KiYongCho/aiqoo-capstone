/* /js/ui/modal.view.js
 * ✅ 답변 크게보기 모달 (iframe 내부 전체를 덮는 풀스크린)
 * - openAnswerModal(answerText, metaText)
 * - ESC 닫기
 * - 복사 버튼
 * - 마크다운 렌더링 + 코드블록 복사 버튼
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
      z-index: 999999;
      display: flex;
      align-items: stretch;   /* ✅ 전체 높이 */
      justify-content: stretch; /* ✅ 전체 너비 */
      padding: 0;             /* ✅ 여백 제거 */
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .aiqoo-modal{
      width: 100%;
      height: 100%;
      background: rgba(11,18,32,0.98);
      border: 0;
      border-radius: 0;       /* ✅ 우측 영역 전체를 채우는 느낌 */
      box-shadow: none;
      display:flex;
      flex-direction: column;
      overflow:hidden;
      color:#e5e7eb;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif;
    }
    .aiqoo-modal-header{
      display:flex;
      justify-content: space-between;
      align-items:flex-start;
      gap: 10px;
      padding: 14px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(17,24,39,0.75);
    }
    .aiqoo-modal-title{
      font-weight: 900;
      font-size: 14px;
      color:#f3f4f6;
      letter-spacing: .02em;
    }
    .aiqoo-modal-meta{
      margin-top: 4px;
      font-size: 12px;
      color: rgba(161,161,170,0.92);
      word-break: break-word;
    }
    .aiqoo-modal-actions{
      display:flex;
      gap: 8px;
      align-items:center;
      flex-shrink: 0;
    }
    .aiqoo-modal-btn{
      cursor:pointer;
      border:1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color:#e5e7eb;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .aiqoo-modal-btn:hover{ background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.22); }
    .aiqoo-modal-body{
      padding: 16px 14px 18px;
      overflow: auto;
      height: 100%;
    }

    /* 마크다운 스타일 */
    .aiqoo-modal-body .md-text{
      line-height: 1.65;
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
      border:1px solid rgba(255,255,255,0.14);
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
      border-bottom:1px solid rgba(255,255,255,0.10);
      background: rgba(17,24,39,0.65);
    }
    .aiqoo-modal-body .md-lang{
      font-size: 12px;
      color:#9ca3af;
    }
    .aiqoo-modal-body .md-copy-btn{
      cursor:pointer;
      border:1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color:#e5e7eb;
      border-radius:10px;
      padding: 7px 9px;
      font-size: 12px;
      font-weight: 800;
    }
    .aiqoo-modal-body .md-copy-btn:hover{ background: rgba(255,255,255,0.10); }
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

export function openAnswerModal(answerText = "", metaText = "") {
  ensureModalStyles();

  const ans = String(answerText ?? "");
  const meta = String(metaText ?? "");

  // 이미 떠있으면 내용만 갱신
  if ($overlay) {
    const body = $overlay.querySelector(".aiqoo-modal-body");
    const metaEl = $overlay.querySelector(".aiqoo-modal-meta");
    metaEl.textContent = meta;
    body.innerHTML = renderMarkdownSafe(ans);
    bindMarkdownCopyButtons(body);
    $overlay.__answerText = ans;
    return;
  }

  $overlay = document.createElement("div");
  $overlay.className = "aiqoo-modal-overlay";
  $overlay.innerHTML = `
    <div class="aiqoo-modal" role="dialog" aria-modal="true" aria-label="답변 크게보기">
      <div class="aiqoo-modal-header">
        <div style="min-width:0;">
          <div class="aiqoo-modal-title">답변 크게보기</div>
          <div class="aiqoo-modal-meta"></div>
        </div>
        <div class="aiqoo-modal-actions">
          <button class="aiqoo-modal-btn" data-act="copy">복사하기</button>
          <button class="aiqoo-modal-btn" data-act="close">닫기</button>
        </div>
      </div>
      <div class="aiqoo-modal-body"></div>
    </div>
  `;

  $overlay.__answerText = ans;

  const $modal = $overlay.querySelector(".aiqoo-modal");
  const $body = $overlay.querySelector(".aiqoo-modal-body");
  const $meta = $overlay.querySelector(".aiqoo-modal-meta");

  $meta.textContent = meta;
  $body.innerHTML = renderMarkdownSafe(ans);
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
      setTimeout(() => (btn.textContent = "복사하기"), 900);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") close();
  }

  // ✅ dim 클릭 닫기
  $overlay.addEventListener("click", (e) => {
    if (e.target === $overlay) close();
  });

  $overlay.querySelector('[data-act="close"]').addEventListener("click", close);
  $overlay.querySelector('[data-act="copy"]').addEventListener("click", copyAll);

  // 모달 내부 클릭은 닫기 방지
  $modal.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild($overlay);
}
