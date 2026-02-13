// /js/ui/qa.view.js
// - Q/A는 질문(❓)만 이모지 표시 (요구사항: 답변 레이어의 💡 제거)
// - 버튼 중앙 정렬 + 답변삭제 버튼 추가
// - [추가] 삭제 확인 모달
// - [추가] 답변 진행상태 모달(로딩/상태 업데이트)

import { normalizeText } from "/js/util/utils.js";
import { renderMarkdownSafe, bindMarkdownCopyButtons } from "/js/util/markdown.util.js";

/* =========================================================
 * 내부 유틸
 * ========================================================= */
function escapeHTML(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAnswerToHTML(answer) {
  const a = normalizeText(answer);
  if (!a) return "";
  return renderMarkdownSafe(a);
}

function getListContainer(containerEl) {
  if (!containerEl) return null;
  return containerEl;
}

/* =========================================================
 * 모달(공용) - DOM 1회 생성
 * ========================================================= */
const MODAL_IDS = {
  CONFIRM: "aiqoo-confirm-modal",
  PROGRESS: "aiqoo-progress-modal",
};

function ensureModalRoot(id) {
  let el = document.getElementById(id);
  if (el) return el;

  el = document.createElement("div");
  el.id = id;
  el.className =
    "fixed inset-0 z-[9999] hidden items-center justify-center p-4 bg-black/50";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");

  // 바깥 클릭으로 닫히지 않게 기본은 컨텐츠 stopPropagation
  el.addEventListener("click", (e) => {
    // 컨테이너(오버레이) 클릭만 감지
    if (e.target === el) {
      // confirm은 사용성 상 바깥 클릭 = 취소로 처리 가능
      // progress는 바깥 클릭으로 닫히면 안 되므로 여기서는 아무 것도 안 함
    }
  });

  document.body.appendChild(el);
  return el;
}

function showModal(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.add("flex");
  // 스크롤 잠금(선호)
  document.documentElement.classList.add("overflow-hidden");
}

function hideModal(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.classList.remove("flex");
  // 다른 모달이 열려있지 않으면 스크롤 해제
  const anyOpen =
    !document.getElementById(MODAL_IDS.CONFIRM)?.classList.contains("hidden") ||
    !document.getElementById(MODAL_IDS.PROGRESS)?.classList.contains("hidden");
  if (!anyOpen) document.documentElement.classList.remove("overflow-hidden");
}

/* =========================================================
 * (1) 삭제 확인 모달
 * ========================================================= */
/**
 * 삭제 확인 모달
 * @param {{q:string,a:string,metaText:string}} param0
 * @returns {Promise<boolean>} 사용자가 "삭제"를 누르면 true, 취소면 false
 */
export function confirmDeleteModal({ q = "", a = "", metaText = "" } = {}) {
  const root = ensureModalRoot(MODAL_IDS.CONFIRM);

  return new Promise((resolve) => {
    // 내용 구성
    root.innerHTML = `
      <div class="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-zinc-200 overflow-hidden"
           onclick="event.stopPropagation()">
        <div class="px-5 py-4 border-b border-zinc-200">
          <div class="text-base font-bold text-zinc-900">답변을 삭제할까요?</div>
          <div class="mt-1 text-xs text-zinc-500">${escapeHTML(metaText || "")}</div>
        </div>

        <div class="px-5 py-4 space-y-3">
          <div class="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
            <div class="text-xs font-semibold text-zinc-700 mb-1">❓ 질문</div>
            <div class="text-sm text-zinc-800 break-words">${escapeHTML(q)}</div>
          </div>

          <div class="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
            <div class="text-xs font-semibold text-zinc-700 mb-1">답변(미리보기)</div>
            <div class="text-sm text-zinc-700 break-words line-clamp-5">
              ${escapeHTML(a).slice(0, 500)}
            </div>
          </div>

          <div class="text-xs text-zinc-500">
            삭제하면 이 답변은 목록에서 제거됩니다.
          </div>
        </div>

        <div class="px-5 py-4 border-t border-zinc-200 flex items-center justify-end gap-2">
          <button type="button"
            class="px-4 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-800 font-semibold hover:bg-zinc-50"
            data-confirm-act="cancel">취소</button>

          <button type="button"
            class="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700"
            data-confirm-act="ok">삭제</button>
        </div>
      </div>
    `;

    const onClick = (e) => {
      const btn = e.target.closest("[data-confirm-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-confirm-act");

      cleanup();
      if (act === "ok") resolve(true);
      else resolve(false);
    };

    const onOverlayClick = (e) => {
      // 바깥 클릭은 "취소"로 처리(사용성)
      if (e.target === root) {
        cleanup();
        resolve(false);
      }
    };

    const onEsc = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    };

    function cleanup() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("click", onOverlayClick);
      window.removeEventListener("keydown", onEsc);
      hideModal(root);
      // innerHTML은 닫을 때 비워도 되고 유지해도 됩니다.
      // root.innerHTML = "";
    }

    root.addEventListener("click", onClick);
    root.addEventListener("click", onOverlayClick);
    window.addEventListener("keydown", onEsc);

    showModal(root);
  });
}

/* =========================================================
 * (2) 답변 진행 상태 모달
 * ========================================================= */
function progressTemplate({ title = "답변 생성 중…", message = "잠시만 기다려 주세요." } = {}) {
  return `
    <div class="w-full max-w-md rounded-2xl bg-white shadow-xl border border-zinc-200 overflow-hidden"
         onclick="event.stopPropagation()">
      <div class="px-5 py-4 border-b border-zinc-200">
        <div class="text-base font-bold text-zinc-900" data-progress-title>${escapeHTML(title)}</div>
      </div>

      <div class="px-5 py-5 flex items-start gap-3">
        <div class="mt-0.5">
          <div class="h-6 w-6 rounded-full border-2 border-zinc-300 border-t-zinc-700 animate-spin"></div>
        </div>
        <div class="min-w-0">
          <div class="text-sm text-zinc-700 break-words" data-progress-message>
            ${escapeHTML(message)}
          </div>
          <div class="mt-2 text-xs text-zinc-500">
            * 네트워크/모델 상태에 따라 시간이 달라질 수 있습니다.
          </div>
        </div>
      </div>
    </div>
  `;
}

export function showAnswerProgressModal({ title, message } = {}) {
  const root = ensureModalRoot(MODAL_IDS.PROGRESS);
  root.innerHTML = progressTemplate({
    title: title || "답변 생성 중…",
    message: message || "답변을 준비하고 있습니다.",
  });
  showModal(root);
}

export function updateAnswerProgressModal({ title, message } = {}) {
  const root = document.getElementById(MODAL_IDS.PROGRESS);
  if (!root || root.classList.contains("hidden")) return;

  const tEl = root.querySelector("[data-progress-title]");
  const mEl = root.querySelector("[data-progress-message]");
  if (tEl && title) tEl.textContent = title;
  if (mEl && message) mEl.textContent = message;
}

export function hideAnswerProgressModal() {
  const root = document.getElementById(MODAL_IDS.PROGRESS);
  if (!root) return;
  hideModal(root);
}

/* =========================================================
 * 렌더링/액션바
 * ========================================================= */
export function clearQA(containerEl) {
  const list = getListContainer(containerEl);
  if (!list) return;
  list.innerHTML = "";
}

function actionBarHTML({ q, a, metaText }) {
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

  // ✅ 마크다운 코드블록 "복사" 버튼 이벤트 위임 바인딩
  bindMarkdownCopyButtons(wrapper);

  // ✅ [추가] 삭제 버튼 클릭 시: 확인 모달 → 확인되면 전역 이벤트로 알림
  // (실제 삭제 로직은 qa.js에서 이벤트 받아서 처리 권장)
  wrapper.addEventListener("click", async (e) => {
    const delBtn = e.target.closest('button[data-act="delete"]');
    if (!delBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const dq = delBtn.getAttribute("data-q") || q;
    const da = delBtn.getAttribute("data-a") || a;
    const dm = delBtn.getAttribute("data-meta") || metaText;

    const ok = await confirmDeleteModal({ q: dq, a: da, metaText: dm });
    if (!ok) return;

    // ✅ 삭제 확정 이벤트 발생 (qa.js에서 수신하여 store/DOM/API 처리)
    window.dispatchEvent(
      new CustomEvent("aiqoo:qa-delete-confirmed", {
        detail: {
          id: item?.id ?? null,
          q: dq,
          a: da,
          metaText: dm,
          // DOM element도 넘기면 “즉시 UI 제거”가 쉬움
          el: wrapper,
        },
      })
    );
  });

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
