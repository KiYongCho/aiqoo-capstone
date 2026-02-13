// /js/ui/qa.view.js
// - 내부 .aiqoo-qa-list에만 렌더
// - Q/A는 ❓/💡 이모지 표시
// - 빈 Q/A는 렌더 금지
// - 액션 버튼: 🔎 크게보기 / 💬 카톡공유 / 📋 복사하기 / ✉️ 메일보내기
// - 최신이 위로: prepend 지원

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAnswerToHTML(answerText) {
  return escapeHTML(answerText).replaceAll("\n", "<br>");
}

function getListContainer(containerEl) {
  if (!containerEl) return null;

  if (containerEl.classList?.contains("aiqoo-qa-list")) return containerEl;

  let list = containerEl.querySelector?.(".aiqoo-qa-list");
  if (list) return list;

  list = document.createElement("div");
  list.className = "aiqoo-qa-list";
  containerEl.appendChild(list);
  return list;
}

export function clearQA(containerEl) {
  const list = getListContainer(containerEl);
  if (list) list.innerHTML = "";
}

/**
 * item: { question, answer, createdAt?, meta?{tLabel?} }
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

  wrapper.innerHTML = `
    <div class="aiqoo-qa-row aiqoo-qa-question">
      <span class="aiqoo-qa-icon" aria-hidden="true">❓</span>
      <span class="aiqoo-qa-text">${escapeHTML(q)}</span>
    </div>

    <div class="aiqoo-qa-row aiqoo-qa-answer">
      <span class="aiqoo-qa-icon" aria-hidden="true">💡</span>
      <div class="aiqoo-qa-text aiqoo-qa-answer-text">${formatAnswerToHTML(a)}</div>
    </div>

    <div class="mt-3 flex flex-wrap gap-2 items-center">
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
        data-full="${escapeHTML(`❓ 질문\n${q}\n\n💡 답변\n${a}`)}">📋 복사하기</button>

      <button type="button" class="qa-pill-btn"
        data-act="email"
        data-q="${escapeHTML(q)}"
        data-a="${escapeHTML(a)}"
        data-meta="${escapeHTML(metaText)}">✉️ 메일보내기</button>

      <span class="ml-auto text-[11px] font-semibold text-zinc-500 whitespace-nowrap">
        ${escapeHTML(metaText)}
      </span>
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

  for (const it of items) {
    renderQA(list, it, { mode: "append" }); // items가 이미 최신->과거 순서라고 가정
  }
}
