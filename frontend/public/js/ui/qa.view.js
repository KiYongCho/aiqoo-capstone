// /public/js/view/qa.view.js
// - Q/A 리스트 렌더
// - "빈 줄" 원인 되는 기본 margin 제거 전제(qa.css에 이미 적용)
// - 액션 버튼 포함: 크게보기/카카오공유/복사

function normalizeText(input) {
  const t = (input ?? "").toString();
  return t
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // 과도한 빈 줄 제거
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
  const safe = escapeHTML(answerText);
  return safe.replaceAll("\n", "<br>");
}

function ensureListRoot(containerEl) {
  if (!containerEl) return null;

  // qa.html에서는 #qaList가 스크롤 컨테이너라,
  // 내부에 실제 리스트 루트를 만들어 붙이는 방식이 가장 안전합니다.
  let list = containerEl.querySelector?.(".aiqoo-qa-list");
  if (!list) {
    list = document.createElement("div");
    list.className = "aiqoo-qa-list";
    containerEl.appendChild(list);
  }
  return list;
}

export function clearQA(containerEl) {
  const list = ensureListRoot(containerEl);
  if (list) list.innerHTML = "";
}

export function renderQA(containerEl, item) {
  const list = ensureListRoot(containerEl);
  if (!list) return;

  const q = normalizeText(item?.question);
  const a = normalizeText(item?.answer);

  const tLabel = item?.meta?.tLabel ? ` · ⏱ ${escapeHTML(item.meta.tLabel)}` : "";
  const when = item?.createdAt ? escapeHTML(item.createdAt) : "";

  const wrapper = document.createElement("div");
  wrapper.className = "aiqoo-qa-item";

  const qRow = document.createElement("div");
  qRow.className = "aiqoo-qa-row aiqoo-qa-question";
  qRow.innerHTML = `
    <span class="aiqoo-qa-icon" aria-hidden="true">❓</span>
    <span class="aiqoo-qa-text">${escapeHTML(q)}</span>
  `;

  const aRow = document.createElement("div");
  aRow.className = "aiqoo-qa-row aiqoo-qa-answer";
  aRow.innerHTML = `
    <span class="aiqoo-qa-icon" aria-hidden="true">💡</span>
    <div class="aiqoo-qa-text aiqoo-qa-answer-text">${formatAnswerToHTML(a)}</div>
  `;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.marginTop = "10px";
  actions.style.flexWrap = "wrap";

  const fullText = `❓ 질문\n${q}\n\n💡 답변\n${a}`; // 복사용(빈 줄 최소)
  const fullEsc = escapeHTML(fullText);

  actions.innerHTML = `
    <button type="button"
      class="qa-pill-btn qa-answer-zoombtn"
      data-act="zoom"
      data-answer="${escapeHTML(a)}"
      title="답변 크게보기">🔎 크게보기</button>

    <button type="button"
      class="qa-pill-btn qa-share-kakao"
      data-act="kakao"
      data-q="${escapeHTML(q)}"
      data-a="${escapeHTML(a)}"
      title="카카오 공유(긴 답변은 요약 전송)">💬 카카오</button>

    <button type="button"
      class="qa-pill-btn"
      data-act="copy"
      data-full="${fullEsc}"
      title="전체(질문+답변) 복사">📋 복사</button>

    <span style="margin-left:auto;color:rgba(161,161,170,0.9);font-size:11px;font-weight:700;white-space:nowrap;">
      ${when}${tLabel}
    </span>
  `;

  wrapper.appendChild(qRow);
  wrapper.appendChild(aRow);
  wrapper.appendChild(actions);

  list.appendChild(wrapper);

  return { q, a };
}

export function renderQAList(containerEl, items = []) {
  const list = ensureListRoot(containerEl);
  if (!list) return;
  list.innerHTML = "";

  for (const it of items) {
    renderQA(containerEl, it);
  }
}
