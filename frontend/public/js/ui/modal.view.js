// public/js/modal.view.js
// - answerModal 제어 유틸
// - open/close 시 aria-hidden도 같이 처리

export function createModal(modalEl, bodyEl) {
  function open(content) {
    if (!modalEl || !bodyEl) return;

    // 텍스트 기반(escape 필요 없음: textContent)
    bodyEl.textContent = content ?? "";
    modalEl.classList.remove("hidden");
    modalEl.setAttribute("aria-hidden", "false");
  }

  function close() {
    if (!modalEl) return;

    modalEl.classList.add("hidden");
    modalEl.setAttribute("aria-hidden", "true");
  }

  return { open, close };
}
