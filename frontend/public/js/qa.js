// /public/js/qa.js
// - qa.html(iframe) 내부 메인 컨트롤러
// - 오버레이(질문 시작하기) 클릭 -> 부모창 영상 pause 요청 + 오버레이 숨김 + 입력 활성화
// - 부모(index)와 postMessage로 상태 동기화(videoPlaying/videoPaused/timeInfo/videoInfo)
// - Q/A 렌더/저장/공유/모달/음성전사 연결

import { createLectureStore } from "/js/core/store.js";
import { normalizeText, formatTime } from "/js/core/utils.js";
import { askQA } from "/js/service/api.service.js";
import { createPlayerService } from "/js/service/player.service.js";
import { createSTTService } from "/js/service/stt.service.js";
import { shareKakao } from "/js/service/share.service.js";
import { openAnswerModal } from "/js/ui/modal.view.js";
import { renderQA, clearQA, renderQAList } from "/js/ui/qa.view.js";

const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  overlay: null,
  overlayBtn: null,

  hintLabel: null,
  voiceBtn: null,
  submitBtn: null,
  voiceStatus: null,
  questionInput: null,

  qaList: null,
  qaEmpty: null,

  exampleChips: null,
  resetWrap: null,
  resetBtn: null,

  resetModal: null,
  resetModalCancel: null,
  resetModalConfirm: null,

  toTopBtn: null,

  // 라벨(메타)
  videoKeyLabel: null,
  providerLabel: null,
};

function safeShow(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = "";
  el.style.visibility = "visible";
  el.style.opacity = "1";
}
function safeHide(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "none";
}

function setEnabled(el, enabled) {
  if (!el) return;
  el.disabled = !enabled;
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

function toast(msg) {
  // 아주 가벼운 토스트(빈 줄/레이아웃 깨짐 방지 위해 inline 생성)
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

function ensureHiddenRule() {
  if (document.getElementById("aiqoo-hidden-style")) return;
  const style = document.createElement("style");
  style.id = "aiqoo-hidden-style";
  style.textContent = `.hidden{display:none !important;}`;
  document.head.appendChild(style);
}

function bindDom() {
  els.overlay = $("#playOverlay");
  els.overlayBtn = $("#overlayBtn");

  els.hintLabel = $("#hintLabel");
  els.voiceBtn = $("#voiceBtn");
  els.submitBtn = $("#submitBtn");
  els.voiceStatus = $("#voiceStatus");
  els.questionInput = $("#questionInput");

  els.qaList = $("#qaList");
  els.qaEmpty = $("#qaEmpty");

  els.exampleChips = $("#exampleChips");
  els.resetWrap = $("#resetWrap");
  els.resetBtn = $("#resetBtn");

  els.resetModal = $("#resetModal");
  els.resetModalCancel = $("#resetModalCancel");
  els.resetModalConfirm = $("#resetModalConfirm");

  els.toTopBtn = $("#toTopBtn");

  els.videoKeyLabel = $("#videoKeyLabel");
  els.providerLabel = $("#providerLabel");
}

let lectureMeta = {
  videoKey: "default",
  videoUrl: "",
  provider: "",
  youtubeId: "",
};

let lastTimeInfo = {
  t: 0,
  tLabel: "00:00",
  provider: "",
  youtubeId: "",
};

let qaActive = false;      // 사용자가 "질문 시작하기"를 눌러 Q&A 모드로 진입했는지
let videoIsPlaying = false;

const player = createPlayerService();

// store는 videoKey 기반으로 분기되어야 하므로 getter 전달
const store = createLectureStore(() => lectureMeta.videoKey || "default");

function applyMetaToUI() {
  setText(els.videoKeyLabel, lectureMeta.videoKey || "default");
  setText(els.providerLabel, lectureMeta.provider ? `(${lectureMeta.provider})` : "");
}

function lockQAUI(lockReason = "") {
  // 잠금: 입력/버튼 비활성 + 안내
  setEnabled(els.voiceBtn, false);
  setEnabled(els.submitBtn, false);
  setEnabled(els.questionInput, false);

  if (lockReason) setText(els.hintLabel, lockReason);
}

function unlockQAUI() {
  setEnabled(els.voiceBtn, true);
  setEnabled(els.submitBtn, true);
  setEnabled(els.questionInput, true);

  setText(els.hintLabel, "📢 AIQOO에게 질문하세요!");
}

function showOverlay() {
  safeShow(els.overlay);
}
function hideOverlay() {
  safeHide(els.overlay);
}

/**
 * ✅ 핵심: "질문 시작하기" 클릭 시 동작
 * 1) 부모창에 pause 요청
 * 2) 오버레이 숨김
 * 3) 입력 UI 활성화
 */
function startQuestionMode() {
  qaActive = true;

  // 부모에게 "질문 시작 -> 영상 멈춰" 요청
  player.notifyPause();

  // UI 전환
  hideOverlay();
  unlockQAUI();

  // UX: 입력 포커스
  try {
    els.questionInput?.focus();
  } catch (_) {}
}

function syncOverlayWithVideoState() {
  // 정책:
  // - 영상이 재생 중이면: 오버레이 표시 + 입력 잠금
  // - 영상이 일시정지면: (qaActive면) 오버레이 숨김 + 입력 가능 / (미진입이면) 오버레이 유지(처음 진입 UX)
  if (videoIsPlaying) {
    showOverlay();
    lockQAUI("📺 영상 재생 중입니다. (오버레이를 눌러 질문 시작)");
    return;
  }

  // paused
  if (qaActive) {
    hideOverlay();
    unlockQAUI();
  } else {
    // 초기 진입 상태: 오버레이를 통해 시작하도록 유지
    showOverlay();
    lockQAUI("⏸️ 일시정지 상태입니다. (질문 시작하기로 입력 활성화)");
  }
}

function loadHistory() {
  const items = store.load();
  if (!items || items.length === 0) {
    safeShow(els.qaEmpty);
    safeHide(els.resetWrap);
    return;
  }

  safeHide(els.qaEmpty);
  safeShow(els.resetWrap);

  // 리스트 렌더
  renderQAList(els.qaList, items);
}

function saveAppend(question, answer, timeInfo) {
  const items = store.load();
  items.push({
    id: crypto?.randomUUID?.() || String(Date.now()),
    createdAt: formatTime(),
    question: normalizeText(question),
    answer: normalizeText(answer),
    meta: {
      videoKey: lectureMeta.videoKey || "default",
      provider: lectureMeta.provider || "",
      youtubeId: lectureMeta.youtubeId || "",
      t: Number(timeInfo?.t || 0),
      tLabel: timeInfo?.tLabel || "",
    },
  });
  store.save(items);
  return items;
}

async function handleAsk() {
  const q = normalizeText(els.questionInput?.value || "");
  if (!q) return;

  // 비활성 상태면 무시
  if (els.submitBtn?.disabled) return;

  setEnabled(els.submitBtn, false);
  setEnabled(els.voiceBtn, false);

  try {
    setText(els.voiceStatus, "🧠 답변 생성 중...");

    const timeInfo = await player.requestTime();
    lastTimeInfo = timeInfo || lastTimeInfo;

    const answer = await askQA({
      question: q,
      videoKey: lectureMeta.videoKey,
      videoUrl: lectureMeta.videoUrl,
      provider: lectureMeta.provider,
      youtubeId: lectureMeta.youtubeId,
      t: lastTimeInfo.t,
      tLabel: lastTimeInfo.tLabel,
    });

    const a = normalizeText(answer);

    // 렌더 + 저장
    safeHide(els.qaEmpty);
    safeShow(els.resetWrap);

    renderQA(els.qaList, {
      id: crypto?.randomUUID?.() || String(Date.now()),
      createdAt: formatTime(),
      question: q,
      answer: a,
      meta: {
        videoKey: lectureMeta.videoKey,
        provider: lectureMeta.provider,
        youtubeId: lectureMeta.youtubeId,
        t: lastTimeInfo.t,
        tLabel: lastTimeInfo.tLabel,
      },
    });

    saveAppend(q, a, lastTimeInfo);

    // 입력 정리
    els.questionInput.value = "";
    setText(els.voiceStatus, "✅ 완료");

    // 스크롤: 맨 아래
    try {
      els.qaList.scrollTop = els.qaList.scrollHeight;
    } catch (_) {}
  } catch (err) {
    console.error(err);
    setText(els.voiceStatus, `❗ 실패: ${err?.message || "오류"}`);
  } finally {
    setEnabled(els.submitBtn, true);
    setEnabled(els.voiceBtn, true);
  }
}

function bindEvents() {
  // ✅ 오버레이 클릭(버튼 자체)
  els.overlayBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startQuestionMode();
  });

  // ✅ 오버레이 영역 전체 클릭도 동일 처리(버튼 안 눌러도)
  els.overlay?.addEventListener("click", (e) => {
    // dim 클릭/카드 클릭 모두 동일하게 시작(원하시는 UX)
    // 단, 내부 버튼 클릭은 위에서 처리됨
    e.preventDefault();
    startQuestionMode();
  });

  // 텍스트 질문 버튼
  els.submitBtn?.addEventListener("click", handleAsk);

  // Enter 전송
  els.questionInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });

  // 예시 칩
  els.exampleChips?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-example]");
    if (!btn) return;
    const ex = btn.getAttribute("data-example") || "";
    if (!ex) return;
    els.questionInput.value = ex;
    try { els.questionInput.focus(); } catch (_) {}
  });

  // 초기화(모달)
  els.resetBtn?.addEventListener("click", () => {
    if (!els.resetModal) return;
    els.resetModal.classList.remove("hidden");
    els.resetModal.classList.add("flex");
    els.resetModal.setAttribute("aria-hidden", "false");
  });

  els.resetModalCancel?.addEventListener("click", () => {
    els.resetModal?.classList.add("hidden");
    els.resetModal?.classList.remove("flex");
    els.resetModal?.setAttribute("aria-hidden", "true");
  });

  els.resetModalConfirm?.addEventListener("click", () => {
    // 해당 강의키만 clear
    store.clear();
    clearQA(els.qaList);
    safeShow(els.qaEmpty);
    safeHide(els.resetWrap);

    els.resetModal?.classList.add("hidden");
    els.resetModal?.classList.remove("flex");
    els.resetModal?.setAttribute("aria-hidden", "true");
  });

  // TOP 버튼
  els.toTopBtn?.addEventListener("click", () => {
    try {
      els.qaList.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      els.qaList.scrollTop = 0;
    }
  });

  // 스크롤에 따라 TOP 버튼 표시
  els.qaList?.addEventListener("scroll", () => {
    const y = els.qaList.scrollTop || 0;
    if (!els.toTopBtn) return;
    els.toTopBtn.classList.toggle("hidden", y < 240);
  });

  // ✅ Q/A 아이템 내부 액션(위임)
  els.qaList?.addEventListener("click", async (e) => {
    const zoomBtn = e.target.closest('[data-act="zoom"]');
    if (zoomBtn) {
      const answer = zoomBtn.getAttribute("data-answer") || "";
      openAnswerModal(answer);
      return;
    }

    const copyBtn = e.target.closest('[data-act="copy"]');
    if (copyBtn) {
      const full = copyBtn.getAttribute("data-full") || "";
      try {
        await navigator.clipboard.writeText(full);
        toast("✅ 복사됨");
      } catch {
        toast("❗ 복사 실패");
      }
      return;
    }

    const kakaoBtn = e.target.closest('[data-act="kakao"]');
    if (kakaoBtn) {
      const question = kakaoBtn.getAttribute("data-q") || "";
      const answer = kakaoBtn.getAttribute("data-a") || "";

      try {
        const { copied, summary } = await shareKakao({
          question,
          answer,
          shareUrl: window.location.href,
          autoCopyFullText: true,
        });

        // 카카오에는 summary만 가는 경우가 많으므로 UX 안내
        if (copied) toast("📋 전체 문장을 클립보드에 복사했습니다 (카카오는 요약 전송)");
        else toast("ℹ️ 카카오는 요약 전송(전체는 복사 권장)");

        // 디버깅 필요하면 사용(사용자에게 보이지 않음)
        void summary;
      } catch (err) {
        console.error(err);
        toast(`❗ 카카오 공유 실패: ${err?.message || "오류"}`);
      }
      return;
    }
  });
}

function bindSTT() {
  const stt = createSTTService(
    (msg) => setText(els.voiceStatus, msg),
    (text) => {
      // 음성 전사 결과를 입력창에 바로 넣고 포커스
      els.questionInput.value = normalizeText(text);
      try { els.questionInput.focus(); } catch (_) {}
    }
  );

  els.voiceBtn?.addEventListener("click", async () => {
    if (els.voiceBtn.dataset.state === "rec") {
      els.voiceBtn.dataset.state = "";
      els.voiceBtn.textContent = "🎤 음성 질문";
      stt.stop();
      return;
    }

    try {
      els.voiceBtn.dataset.state = "rec";
      els.voiceBtn.textContent = "⏹️ 녹음 종료";
      await stt.start();
    } catch (err) {
      console.error(err);
      els.voiceBtn.dataset.state = "";
      els.voiceBtn.textContent = "🎤 음성 질문";
      setText(els.voiceStatus, "❗ 마이크 권한 또는 녹음 시작 실패");
    }
  });
}

function bindParentMessages() {
  // qa iframe이 준비되었음을 부모에게 알림
  try {
    window.parent?.postMessage({ type: "qaReady" }, "*");
  } catch (_) {}

  // 부모(index) -> iframe 메시지 수신
  player.onMessage((msg) => {
    if (!msg?.type) return;

    if (msg.type === "videoInfo") {
      lectureMeta = {
        videoKey: msg.videoKey || "default",
        videoUrl: msg.videoUrl || "",
        provider: msg.provider || "",
        youtubeId: msg.youtubeId || "",
      };
      applyMetaToUI();

      // 강의키 바뀌면 히스토리 다시 로드
      clearQA(els.qaList);
      loadHistory();
      return;
    }

    if (msg.type === "videoPlaying") {
      videoIsPlaying = true;
      syncOverlayWithVideoState();
      return;
    }

    if (msg.type === "videoPaused") {
      videoIsPlaying = false;
      syncOverlayWithVideoState();
      return;
    }

    if (msg.type === "timeInfo") {
      lastTimeInfo = {
        t: Number(msg.t || 0),
        tLabel: msg.tLabel || "00:00",
        provider: msg.provider || "",
        youtubeId: msg.youtubeId || "",
      };
      return;
    }
  });
}

function init() {
  ensureHiddenRule();
  bindDom();
  bindEvents();
  bindSTT();
  bindParentMessages();

  // 초기 상태
  lockQAUI("📺 영상 상태 확인 중...");
  showOverlay(); // 초기엔 오버레이를 보여주고 시작하도록

  applyMetaToUI();
  loadHistory();
}

init();
