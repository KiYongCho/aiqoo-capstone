// /js/qa.js
import { createLectureStore } from "/js/core/store.js";
import { askQA } from "/js/service/api.service.js";
import { createPlayerService } from "/js/service/player.service.js";
import { shareKakao } from "/js/service/share.service.js";
import { openAnswerModal } from "/js/ui/modal.view.js";
import { renderQA, renderQAList, clearQA } from "/js/ui/qa.view.js";
import { normalizeText, formatTime } from "/js/util/utils.js";

const $ = (sel) => document.querySelector(sel);

const el = {
  overlay: $("#playOverlay"),
  overlayBtn: $("#overlayBtn"),

  hint: $("#hintLabel"),
  voiceStatus: $("#voiceStatus"),
  input: $("#questionInput"),

  listWrap: $("#qaList"),
  empty: $("#qaEmpty"),

  resetWrap: $("#resetWrap"),
  resetBtn: $("#resetBtn"),

  resetModal: $("#resetModal"),
  resetCancel: $("#resetModalCancel"),
  resetConfirm: $("#resetModalConfirm"),

  toTop: $("#toTopBtn"),
};

function showOverlay() {
  el.overlay?.classList.remove("hidden");
  el.overlay?.setAttribute("aria-hidden", "false");
}
function hideOverlay() {
  el.overlay?.classList.add("hidden");
  el.overlay?.setAttribute("aria-hidden", "true");
}

function lockUI(msg) {
  if (el.input) el.input.disabled = true;
  el.hint.textContent = msg || "📺 영상 재생 중입니다.";
}

function unlockUI(msg) {
  if (el.input) el.input.disabled = false;
  el.hint.textContent = msg || "📢 AIQOO에게 질문하세요!";
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position = "fixed";
  t.style.left = "50%";
  t.style.bottom = "18px";
  t.style.transform = "translateX(-50%)";
  t.style.zIndex = "999999";
  t.style.padding = "10px 12px";
  t.style.borderRadius = "9999px";
  t.style.fontSize = "12px";
  t.style.fontWeight = "800";
  t.style.color = "rgba(255,255,255,0.92)";
  t.style.background = "rgba(0,0,0,0.65)";
  t.style.border = "1px solid rgba(255,255,255,0.14)";
  t.style.backdropFilter = "blur(10px)";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

function toMailto({ subject, body }) {
  const s = encodeURIComponent(subject || "");
  const b = encodeURIComponent(body || "");

  // mailto 길이 제한 안전장치
  const MAX = 1800;
  const bodySafe =
    b.length > MAX
      ? b.slice(0, MAX) + encodeURIComponent("\n\n(이하 내용은 길이 제한으로 생략되었습니다)")
      : b;

  return `mailto:?subject=${s}&body=${bodySafe}`;
}

const player = createPlayerService();

let qaActive = false;
let videoPlaying = false;

let meta = {
  videoKey: "default",
  videoUrl: "",
  provider: "",
  youtubeId: "",
};

let lastTimeInfo = { t: 0, tLabel: "00:00", provider: "", youtubeId: "" };
const store = createLectureStore(() => meta.videoKey || "default");

// ✅ 요청~응답 사이 입력 잠금 상태
let busy = false;

function setBusy(flag, label = "답변 생성 중...") {
  busy = !!flag;

  if (busy) {
    // ✅ 버튼/입력 비활성화
    if (el.input) el.input.disabled = true;

    // ✅ “돌아가는거(로딩)” 표시 (Tailwind animate-spin 사용)
    if (el.voiceStatus) {
      el.voiceStatus.innerHTML = `
        <span class="inline-flex items-center gap-2">
          <span class="inline-block h-3 w-3 rounded-full border-2 border-white/25 border-t-white/80 animate-spin"></span>
          <span class="text-xs tracking-wide text-zinc-400">${label}</span>
        </span>
      `;
    }
    return;
  }

  // ✅ 다시 활성화(단, 영상 재생 중이면 lockUI에서 다시 잠글 수 있음)
  if (!videoPlaying && qaActive) {
    if (el.input) el.input.disabled = false;
  }
  if (el.voiceStatus) el.voiceStatus.textContent = "";
}

function syncUI() {
  if (videoPlaying) {
    showOverlay();
    lockUI("📺 영상 재생 중입니다. (오버레이를 눌러 질문 시작)");
    return;
  }

  if (qaActive) {
    hideOverlay();
    unlockUI("📢 AIQOO에게 질문하세요!");
  } else {
    showOverlay();
    lockUI("⏸️ 일시정지 상태입니다. (질문 시작하기로 입력 활성화)");
  }
}

/**
 * ✅ 빈 Q/A 데이터 제거
 */
function sanitizeItems(items) {
  const cleaned = [];
  for (const it of items || []) {
    const q = normalizeText(it?.question || "");
    const a = normalizeText(it?.answer || "");
    if (!q || !a) continue;
    cleaned.push({ ...it, question: q, answer: a });
  }
  return cleaned;
}

function sortNewestFirst(items) {
  const parsed = items.map((it) => {
    const s = String(it?.createdAt || "");
    const d = new Date(s.replace(" ", "T"));
    const t = Number.isNaN(d.getTime()) ? null : d.getTime();
    return { it, t };
  });

  const hasAnyTime = parsed.some((x) => typeof x.t === "number");
  if (!hasAnyTime) return items;

  return parsed
    .sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity))
    .map((x) => x.it);
}

function loadHistory() {
  const raw = store.load();
  let items = sanitizeItems(raw);
  items = sortNewestFirst(items);

  if (JSON.stringify(raw || []) !== JSON.stringify(items || [])) {
    store.save(items);
  }

  if (!items.length) {
    el.empty.classList.remove("hidden");
    el.resetWrap.classList.add("hidden");
    clearQA(el.listWrap);
    return;
  }

  el.empty.classList.add("hidden");
  el.resetWrap.classList.remove("hidden");
  renderQAList(el.listWrap, items);
}

function appendHistory(question, answer, timeInfo, id, createdAt) {
  const q = normalizeText(question);
  const a = normalizeText(answer);

  if (!q || !a) return;

  const items = sanitizeItems(store.load());

  // ✅ 최신이 상단
  items.unshift({
    id: id || crypto?.randomUUID?.() || String(Date.now()),
    createdAt: createdAt || formatTime(),
    question: q,
    answer: a,
    meta: {
      videoKey: meta.videoKey,
      provider: meta.provider,
      youtubeId: meta.youtubeId,
      t: Number(timeInfo?.t || 0),
      tLabel: timeInfo?.tLabel || "",
    },
  });

  store.save(items);
}

async function startQuestionMode() {
  qaActive = true;

  // pause 요청 + fallback
  try { player.notifyPause(); } catch (_) {}
  try { window.parent?.postMessage({ type: "qaFocus" }, "*"); } catch (_) {}

  hideOverlay();
  lockUI("⏸️ 영상 정지 중...");

  try { el.input.focus(); } catch (_) {}
}

async function handleAsk() {
  if (busy) return; // ✅ 중복 전송 방지

  const q = normalizeText(el.input.value);
  if (!q) return;
  if (videoPlaying || !qaActive) return;

  // ✅ 여기부터 “답변 표시 전까지 잠금”
  setBusy(true, "답변 생성 중...");

  try {
    const timeInfo = await player.requestTime();
    lastTimeInfo = timeInfo || lastTimeInfo;

    const answer = await askQA({
      question: q,
      videoKey: meta.videoKey,
      videoUrl: meta.videoUrl,
      provider: meta.provider,
      youtubeId: meta.youtubeId,
      t: lastTimeInfo.t,
      tLabel: lastTimeInfo.tLabel,
    });

    const a = normalizeText(answer);

    if (!a) {
      if (el.voiceStatus) el.voiceStatus.textContent = "❗ 빈 답변이 반환되었습니다.";
      return;
    }

    el.empty.classList.add("hidden");
    el.resetWrap.classList.remove("hidden");

    // ✅ 최신 답변 상단 표시
    const id = crypto?.randomUUID?.() || String(Date.now());
    const createdAt = formatTime();

    renderQA(
      el.listWrap,
      { id, question: q, answer: a, createdAt, meta: { tLabel: lastTimeInfo.tLabel } },
      { mode: "prepend" }
    );

    appendHistory(q, a, lastTimeInfo, id, createdAt);

    el.input.value = "";

    // 최신 상단이므로 스크롤 위로
    try { el.listWrap.scrollTop = 0; } catch (_) {}
  } catch (err) {
    console.error(err);
    if (el.voiceStatus) el.voiceStatus.textContent = `❗ 실패: ${err?.message || "오류"}`;
  } finally {
    // ✅ 답변이 화면에 반영된 이후에 다시 활성화
    setBusy(false);
  }
}

function bindEvents() {
  el.overlayBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startQuestionMode();
  });

  el.overlay?.addEventListener("click", (e) => {
    e.preventDefault();
    startQuestionMode();
  });

  el.input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });


  // ✅ 버튼 UI 제거: Enter로 전송(Shift+Enter 줄바꿈)

  el.resetBtn?.addEventListener("click", () => {
    el.resetModal.classList.remove("hidden");
    el.resetModal.classList.add("flex");
    el.resetModal.setAttribute("aria-hidden", "false");
  });

  el.resetCancel?.addEventListener("click", () => {
    el.resetModal.classList.add("hidden");
    el.resetModal.classList.remove("flex");
    el.resetModal.setAttribute("aria-hidden", "true");
  });

  el.resetConfirm?.addEventListener("click", () => {
    store.clear();
    clearQA(el.listWrap);
    el.empty.classList.remove("hidden");
    el.resetWrap.classList.add("hidden");

    el.resetModal.classList.add("hidden");
    el.resetModal.classList.remove("flex");
    el.resetModal.setAttribute("aria-hidden", "true");
  });

  // TOP 버튼
  el.toTop?.addEventListener("click", () => {
    try { el.listWrap.scrollTo({ top: 0, behavior: "smooth" }); }
    catch { el.listWrap.scrollTop = 0; }
  });

  el.listWrap?.addEventListener("scroll", () => {
    const y = el.listWrap.scrollTop || 0;
    el.toTop?.classList.toggle("hidden", y < 240);
  });

  // 카드 액션 위임
  el.listWrap?.addEventListener("click", async (e) => {
    const zoom = e.target.closest('[data-act="zoom"]');
    if (zoom) {
      const a = zoom.getAttribute("data-a") || "";
      const metaText = zoom.getAttribute("data-meta") || "";
      openAnswerModal(a, metaText);
      return;
    }

    const copy = e.target.closest('[data-act="copy"]');
    if (copy) {
      const full = copy.getAttribute("data-full") || "";
      try {
        await navigator.clipboard.writeText(full);
        toast("✅ 복사됨");
      } catch {
        toast("❗ 복사 실패");
      }
      return;
    }

    const kakao = e.target.closest('[data-act="kakao"]');
    if (kakao) {
      const q = kakao.getAttribute("data-q") || "";
      const a = kakao.getAttribute("data-a") || "";
      try {
        const { copied } = await shareKakao({
          question: q,
          answer: a,
          shareUrl: window.location.href,
          autoCopyFullText: true,
        });
        if (copied) toast("📋 전체 문장 복사됨 (카카오는 요약 전송)");
        else toast("ℹ️ 카카오는 요약 전송");
      } catch (err) {
        console.error(err);
        toast("❗ 카카오 공유 실패");
      }
      return;
    }

    const email = e.target.closest('[data-act="email"]');
    if (email) {
      const q = email.getAttribute("data-q") || "";
      const a = email.getAttribute("data-a") || "";
      const metaText = email.getAttribute("data-meta") || "";
      const subject = `[AIQOO 답변] ${q.slice(0, 60)}${q.length > 60 ? "…" : ""}`;
      const body =
`❓ 질문
${q}

답변
${a}

${metaText ? `(${metaText})\n` : ""}공유 링크: ${window.location.href}`;

      try {
        window.location.href = toMailto({ subject, body });
      } catch (err) {
        console.error(err);
        toast("❗ 메일 앱 실행 실패");
      }
      return;
    }

    const del = e.target.closest('[data-act="delete"]');
    if (del) {
      const card = e.target.closest('.aiqoo-qa-item');
      const id = card?.dataset?.id;

      const items = sanitizeItems(store.load());
      const next = id ? items.filter(it => String(it?.id || "") !== String(id)) : items.filter(it => {
        const qq = normalizeText(it?.question || "");
        const aa = normalizeText(it?.answer || "");
        return !(qq === normalizeText(del.getAttribute('data-q') || "") && aa === normalizeText(del.getAttribute('data-a') || ""));
      });

      store.save(next);
      card?.remove();

      // 비었으면 empty UI 복원
      if (!next.length) {
        el.empty?.classList.remove('hidden');
        el.resetWrap?.classList.add('hidden');
      }
      toast('🗑️ 삭제됨');
      return;
    }
  });
}

function bindParentMessages() {
  try { window.parent?.postMessage({ type: "qaReady" }, "*"); } catch (_) {}

  player.onMessage((msg) => {
    if (!msg?.type) return;

    if (msg.type === "videoInfo") {
      meta = {
        videoKey: msg.videoKey || "default",
        videoUrl: msg.videoUrl || "",
        provider: msg.provider || "",
        youtubeId: msg.youtubeId || "",
      };
      loadHistory();
      return;
    }

    if (msg.type === "videoPlaying") {
      videoPlaying = true;
      syncUI();
      return;
    }

    if (msg.type === "videoPaused") {
      videoPlaying = false;
      syncUI();
      return;
    }

    if (msg.type === "timeInfo") {
      lastTimeInfo = {
        t: Number(msg.t || 0),
        tLabel: msg.tLabel || "00:00",
        provider: msg.provider || "",
        youtubeId: msg.youtubeId || "",
      };
    }
  });
}

function init() {
  showOverlay();
  lockUI("📺 영상 상태 확인 중...");

  bindEvents();
  bindParentMessages();
  loadHistory();
  syncUI();
}

init();
