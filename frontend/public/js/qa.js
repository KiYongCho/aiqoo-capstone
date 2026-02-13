// qa.js
import { askQA } from "/js/service/api.service.js";
import { createLectureStore } from "/js/core/store.js";
import { normalizeText, formatTime } from "/js/core/utils.js";
import { createPlayerService } from "/js/service/player.service.js";
import { createSTTService } from "/js/service/stt.service.js";
import { shareKakao } from "/js/service/share.service.js";
import { openAnswerModal } from "/js/ui/modal.view.js";
import { renderQA, renderQAList, clearQA } from "/js/ui/qa.view.js";

const $ = (sel) => document.querySelector(sel);

const el = {
  overlay: $("#playOverlay"),
  overlayBtn: $("#overlayBtn"),

  hint: $("#hintLabel"),
  voiceBtn: $("#voiceBtn"),
  submitBtn: $("#submitBtn"),
  voiceStatus: $("#voiceStatus"),
  input: $("#questionInput"),

  listWrap: $("#qaList"),
  empty: $("#qaEmpty"),

  chips: $("#exampleChips"),
  resetWrap: $("#resetWrap"),
  resetBtn: $("#resetBtn"),

  resetModal: $("#resetModal"),
  resetCancel: $("#resetModalCancel"),
  resetConfirm: $("#resetModalConfirm"),

  toTop: $("#toTopBtn"),

  videoKeyLabel: $("#videoKeyLabel"),
  providerLabel: $("#providerLabel"),
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
  el.voiceBtn.disabled = true;
  el.submitBtn.disabled = true;
  el.input.disabled = true;
  el.hint.textContent = msg || "📺 영상 재생 중입니다.";
}

function unlockUI(msg) {
  el.voiceBtn.disabled = false;
  el.submitBtn.disabled = false;
  el.input.disabled = false;
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

function applyMetaUI() {
  el.videoKeyLabel.textContent = meta.videoKey || "default";
  el.providerLabel.textContent = meta.provider ? `(${meta.provider})` : "";
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
    if (!q || !a) continue; // ✅ 빈 항목 스킵
    cleaned.push({ ...it, question: q, answer: a });
  }
  return cleaned;
}

function loadHistory() {
  const raw = store.load();
  const items = sanitizeItems(raw);

  // ✅ 만약 빈 항목이 저장소에 있었으면 정리해서 다시 저장
  if ((raw?.length || 0) !== items.length) {
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

function appendHistory(question, answer, timeInfo) {
  const q = normalizeText(question);
  const a = normalizeText(answer);

  // ✅ 저장 단계에서도 빈 값 방지
  if (!q || !a) return;

  const items = sanitizeItems(store.load());

  items.push({
    id: crypto?.randomUUID?.() || String(Date.now()),
    createdAt: formatTime(),
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
  player.notifyPause();

  hideOverlay();
  lockUI("⏸️ 영상 정지 중...");

  try { el.input.focus(); } catch (_) {}
}

async function handleAsk() {
  const q = normalizeText(el.input.value);
  if (!q) return;
  if (el.submitBtn.disabled) return;

  el.submitBtn.disabled = true;
  el.voiceBtn.disabled = true;

  try {
    el.voiceStatus.textContent = "🧠 답변 생성 중...";

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

    // ✅ 빈 답변 방지(안전장치)
    if (!a) {
      el.voiceStatus.textContent = "❗ 빈 답변이 반환되었습니다.";
      return;
    }

    el.empty.classList.add("hidden");
    el.resetWrap.classList.remove("hidden");

    // renderQA 자체도 빈값이면 false 반환
    renderQA(el.listWrap, {
      question: q,
      answer: a,
      createdAt: formatTime(),
      meta: { tLabel: lastTimeInfo.tLabel },
    });

    appendHistory(q, a, lastTimeInfo);

    el.input.value = "";
    el.voiceStatus.textContent = "✅ 완료";

    try { el.listWrap.scrollTop = el.listWrap.scrollHeight; } catch (_) {}
  } catch (err) {
    console.error(err);
    el.voiceStatus.textContent = `❗ 실패: ${err?.message || "오류"}`;
  } finally {
    el.submitBtn.disabled = false;
    el.voiceBtn.disabled = false;
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

  el.submitBtn?.addEventListener("click", handleAsk);
  el.input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });

  el.chips?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-example]");
    if (!btn) return;
    el.input.value = btn.getAttribute("data-example") || "";
    try { el.input.focus(); } catch (_) {}
  });

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
        const { copied } = await shareKakao({ question: q, answer: a, shareUrl: window.location.href, autoCopyFullText: true });
        if (copied) toast("📋 전체 문장 복사됨 (카카오는 요약 전송)");
        else toast("ℹ️ 카카오는 요약 전송");
      } catch (err) {
        console.error(err);
        toast("❗ 카카오 공유 실패");
      }
    }
  });
}

function bindSTT() {
  const stt = createSTTService(
    (msg) => (el.voiceStatus.textContent = msg || ""),
    (text) => {
      el.input.value = normalizeText(text || "");
      try { el.input.focus(); } catch (_) {}
    }
  );

  el.voiceBtn?.addEventListener("click", async () => {
    if (el.voiceBtn.dataset.state === "rec") {
      el.voiceBtn.dataset.state = "";
      el.voiceBtn.textContent = "🎤 음성 질문";
      stt.stop();
      return;
    }

    try {
      el.voiceBtn.dataset.state = "rec";
      el.voiceBtn.textContent = "⏹️ 녹음 종료";
      await stt.start();
    } catch (err) {
      console.error(err);
      el.voiceBtn.dataset.state = "";
      el.voiceBtn.textContent = "🎤 음성 질문";
      el.voiceStatus.textContent = "❗ 마이크 권한 또는 녹음 시작 실패";
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
      applyMetaUI();
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
  bindSTT();
  bindParentMessages();

  applyMetaUI();
  loadHistory();
  syncUI();
}

init();
