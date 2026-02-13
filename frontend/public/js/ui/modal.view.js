/* /js/ui/modal.view.js
 * ✅ AIQOO 모달 표준 (iframe 내부 전체를 덮는 풀스크린)
 * - openAnswerModal(answerText, metaText)
 * - confirmDeleteModal({q,a,metaText}) => Promise<boolean>
 * - showAnswerProgressModal({title,message})
 * - updateAnswerProgressModal({title,message})
 * - hideAnswerProgressModal()
 *
 * 공통:
 * - ESC 닫기 (progress는 기본적으로 닫히지 않게 처리)
 * - dim 클릭 닫기 (confirm/answer만)
 * - 스타일 통일: aiqoo-modal-overlay / aiqoo-modal ...
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
      align-items: stretch;
      justify-content: stretch;
      padding: 0;
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .aiqoo-modal{
      width: 100%;
      height: 100%;
      background: rgba(11,18,32,0.98);
      border: 0;
      border-radius: 0;
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
      user-select: none;
    }
    .aiqoo-modal-btn:hover{ background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.22); }

    .aiqoo-modal-btn-danger{
      border-color: rgba(239,68,68,0.42);
      background: rgba(239,68,68,0.18);
    }
    .aiqoo-modal-btn-danger:hover{
      background: rgba(239,68,68,0.28);
      border-color: rgba(239,68,68,0.55);
    }

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
      user-select: none;
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

    /* Confirm/Progress 전용 */
    .aiqoo-modal-card{
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      border-radius: 14px;
      padding: 12px 12px;
      margin-bottom: 10px;
    }
    .aiqoo-modal-card-title{
      font-size: 12px;
      font-weight: 900;
      color: rgba(229,231,235,0.95);
      margin-bottom: 6px;
    }
    .aiqoo-modal-card-text{
      font-size: 13px;
      line-height: 1.55;
      color: rgba(229,231,235,0.86);
      word-break: break-word;
      white-space: pre-wrap;
    }
    .aiqoo-spinner{
      display:inline-block;
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      border: 2px solid rgba(255,255,255,0.22);
      border-top-color: rgba(255,255,255,0.85);
      animation: aiqooSpin 0.85s linear infinite;
    }
    @keyframes aiqooSpin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/* =========================================================
 * Answer Modal
 * ========================================================= */
let $answerOverlay = null;

export function openAnswerModal(answerText = "", metaText = "") {
  ensureModalStyles();

  const ans = String(answerText ?? "");
  const meta = String(metaText ?? "");

  // 이미 떠있으면 내용만 갱신
  if ($answerOverlay) {
    const body = $answerOverlay.querySelector(".aiqoo-modal-body");
    const metaEl = $answerOverlay.querySelector(".aiqoo-modal-meta");
    metaEl.textContent = meta;
    body.innerHTML = renderMarkdownSafe(ans);
    bindMarkdownCopyButtons(body);
    $answerOverlay.__answerText = ans;
    return;
  }

  $answerOverlay = document.createElement("div");
  $answerOverlay.className = "aiqoo-modal-overlay";
  $answerOverlay.innerHTML = `
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

  $answerOverlay.__answerText = ans;

  const $modal = $answerOverlay.querySelector(".aiqoo-modal");
  const $body = $answerOverlay.querySelector(".aiqoo-modal-body");
  const $meta = $answerOverlay.querySelector(".aiqoo-modal-meta");

  $meta.textContent = meta;
  $body.innerHTML = renderMarkdownSafe(ans);
  bindMarkdownCopyButtons($body);

  function close() {
    if (!$answerOverlay) return;
    document.removeEventListener("keydown", onKeyDown);
    $answerOverlay.remove();
    $answerOverlay = null;
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText($answerOverlay.__answerText || "");
      const btn = $answerOverlay.querySelector('[data-act="copy"]');
      const old = btn.textContent;
      btn.textContent = "복사됨";
      setTimeout(() => (btn.textContent = old), 900);
    } catch (err) {
      console.error(err);
      const btn = $answerOverlay.querySelector('[data-act="copy"]');
      btn.textContent = "실패";
      setTimeout(() => (btn.textContent = "복사하기"), 900);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") close();
  }

  // ✅ dim 클릭 닫기
  $answerOverlay.addEventListener("click", (e) => {
    if (e.target === $answerOverlay) close();
  });

  $answerOverlay.querySelector('[data-act="close"]').addEventListener("click", close);
  $answerOverlay.querySelector('[data-act="copy"]').addEventListener("click", copyAll);

  // 모달 내부 클릭은 닫기 방지
  $modal.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild($answerOverlay);
}

/* =========================================================
 * Confirm Delete Modal (디자인/이벤트 완전 동일 계열)
 * ========================================================= */
let $confirmOverlay = null;

function escapePlain(s = "") {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @param {{q?:string,a?:string,metaText?:string}} param0
 * @returns {Promise<boolean>}
 */
export function confirmDeleteModal({ q = "", a = "", metaText = "" } = {}) {
  ensureModalStyles();

  const qq = String(q ?? "");
  const aa = String(a ?? "");
  const meta = String(metaText ?? "");

  // 이미 confirm이 떠있으면 닫고 새로 연다(중복 방지)
  if ($confirmOverlay) {
    try { $confirmOverlay.remove(); } catch (_) {}
    $confirmOverlay = null;
  }

  return new Promise((resolve) => {
    $confirmOverlay = document.createElement("div");
    $confirmOverlay.className = "aiqoo-modal-overlay";
    $confirmOverlay.innerHTML = `
      <div class="aiqoo-modal" role="dialog" aria-modal="true" aria-label="답변 삭제 확인">
        <div class="aiqoo-modal-header">
          <div style="min-width:0;">
            <div class="aiqoo-modal-title">답변을 삭제할까요?</div>
            <div class="aiqoo-modal-meta"></div>
          </div>
          <div class="aiqoo-modal-actions">
            <button class="aiqoo-modal-btn" data-act="cancel">취소</button>
            <button class="aiqoo-modal-btn aiqoo-modal-btn-danger" data-act="ok">삭제</button>
          </div>
        </div>
        <div class="aiqoo-modal-body">
          <div class="aiqoo-modal-card">
            <div class="aiqoo-modal-card-title">❓ 질문</div>
            <div class="aiqoo-modal-card-text">${escapePlain(qq)}</div>
          </div>
          <div class="aiqoo-modal-card">
            <div class="aiqoo-modal-card-title">답변 미리보기</div>
            <div class="aiqoo-modal-card-text">${escapePlain(aa).slice(0, 700)}${aa.length > 700 ? "…" : ""}</div>
          </div>
          <div style="font-size:12px;color:rgba(161,161,170,0.92);">
            삭제하면 목록에서 제거됩니다.
          </div>
        </div>
      </div>
    `;

    const $modal = $confirmOverlay.querySelector(".aiqoo-modal");
    const $meta = $confirmOverlay.querySelector(".aiqoo-modal-meta");
    $meta.textContent = meta;

    function done(result) {
      document.removeEventListener("keydown", onKeyDown);
      if ($confirmOverlay) {
        try { $confirmOverlay.remove(); } catch (_) {}
        $confirmOverlay = null;
      }
      resolve(!!result);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") done(false);
    }

    // dim 클릭 = 취소
    $confirmOverlay.addEventListener("click", (e) => {
      if (e.target === $confirmOverlay) done(false);
    });

    // 내부 클릭 전파 방지
    $modal.addEventListener("click", (e) => e.stopPropagation());

    $confirmOverlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(false));
    $confirmOverlay.querySelector('[data-act="ok"]').addEventListener("click", () => done(true));

    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild($confirmOverlay);

    // 포커스(키보드)
    setTimeout(() => {
      try { $confirmOverlay.querySelector('[data-act="ok"]')?.focus(); } catch (_) {}
    }, 0);
  });
}

/* =========================================================
 * Progress Modal (답변 진행상태)
 * ========================================================= */
let $progressOverlay = null;

export function showAnswerProgressModal({ title = "답변 생성 중…", message = "AI가 답변을 작성하고 있습니다." } = {}) {
  ensureModalStyles();

  const t = String(title ?? "");
  const m = String(message ?? "");

  // 이미 있으면 내용만 업데이트
  if ($progressOverlay) {
    updateAnswerProgressModal({ title: t, message: m });
    return;
  }

  $progressOverlay = document.createElement("div");
  $progressOverlay.className = "aiqoo-modal-overlay";
  $progressOverlay.innerHTML = `
    <div class="aiqoo-modal" role="dialog" aria-modal="true" aria-label="답변 생성 중">
      <div class="aiqoo-modal-header">
        <div style="min-width:0;">
          <div class="aiqoo-modal-title" data-p-title></div>
          <div class="aiqoo-modal-meta">창을 닫지 말고 잠시만 기다려 주세요.</div>
        </div>
        <div class="aiqoo-modal-actions">
          <!-- 진행 모달은 기본적으로 닫기/취소를 제공하지 않음 -->
        </div>
      </div>
      <div class="aiqoo-modal-body">
        <div class="aiqoo-modal-card">
          <div class="aiqoo-modal-card-title"><span class="aiqoo-spinner"></span> 진행 상태</div>
          <div class="aiqoo-modal-card-text" data-p-message></div>
        </div>
        <div style="font-size:12px;color:rgba(161,161,170,0.92);">
          네트워크/모델 상태에 따라 시간이 달라질 수 있습니다.
        </div>
      </div>
    </div>
  `;

  const $modal = $progressOverlay.querySelector(".aiqoo-modal");
  $modal.addEventListener("click", (e) => e.stopPropagation());

  // dim 클릭으로 닫히지 않게 처리(아무 동작 없음)
  $progressOverlay.addEventListener("click", (e) => {
    if (e.target === $progressOverlay) {
      // no-op
    }
  });

  document.body.appendChild($progressOverlay);
  updateAnswerProgressModal({ title: t, message: m });
}

export function updateAnswerProgressModal({ title, message } = {}) {
  if (!$progressOverlay) return;

  const t = title != null ? String(title) : null;
  const m = message != null ? String(message) : null;

  const $t = $progressOverlay.querySelector("[data-p-title]");
  const $m = $progressOverlay.querySelector("[data-p-message]");

  if ($t && t) $t.textContent = t;
  if ($m && m) $m.textContent = m;
}

export function hideAnswerProgressModal() {
  if (!$progressOverlay) return;
  try { $progressOverlay.remove(); } catch (_) {}
  $progressOverlay = null;
}
