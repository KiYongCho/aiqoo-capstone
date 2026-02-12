// public/js/qa.js
// - Q&A 엔트리 모듈
// - 크게보기(답변 모달) 기능 포함
// - Enter 전송(Shift+Enter 줄바꿈)

import { createLectureStore } from "./store.js";
import { normalizeText, formatTime } from "./utils.js";
import { askLLM } from "./api.service.js";
import { createPlayerService } from "./player.service.js";
import { createSTTService } from "./stt.service.js";
import { createShareService } from "./share.service.js";
import { renderQA } from "./qa.view.js";
import { createModal } from "./modal.view.js";

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Overlay
  const playOverlay = $("playOverlay");
  const overlayBtn = $("overlayBtn");

  // Inputs
  const voiceBtn = $("voiceBtn");
  const submitBtn = $("submitBtn");
  const voiceStatus = $("voiceStatus");
  const questionInput = $("questionInput");

  // List
  const qaList = $("qaList");
  const qaEmpty = $("qaEmpty");

  // Labels
  const videoKeyLabel = $("videoKeyLabel");
  const providerLabel = $("providerLabel");

  // Reset
  const resetWrap = $("resetWrap");
  const resetBtn = $("resetBtn");

  // Answer modal
  const answerModal = $("answerModal");
  const answerModalBody = $("answerModalBody");
  const answerModalMeta = $("answerModalMeta");
  const answerCopyBtn = $("answerCopyBtn");
  const answerCloseBtn = $("answerCloseBtn");

  const answerModalApi = createModal(answerModal, answerModalBody);

  // Kakao key (body data-kakao-key 또는 localStorage)
  const kakaoKey =
    document.body?.dataset?.kakaoKey ||
    localStorage.getItem("AIQOO_KAKAO_KEY") ||
    "";
  const share = createShareService(kakaoKey);

  // Player bridge (parent <-> iframe)
  const player = createPlayerService();

  let provider = "native";
  let youtubeId = "";
  let videoUrl = "";
  let videoKey = "default";

  let isPlaying = false;
  let hasStarted = false; // 시작 모달을 한번 눌렀는지

  const store = createLectureStore(() => videoKey);
  let items = store.load();

  function setOverlayVisible(show) {
    if (!playOverlay) return;
    playOverlay.classList.toggle("hidden", !show);
    playOverlay.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function setInputsEnabled(enabled) {
    if (questionInput) questionInput.disabled = !enabled;
    if (submitBtn) submitBtn.disabled = !enabled;
    if (voiceBtn) voiceBtn.disabled = !enabled;
  }

  function setVoiceStatus(text) {
    if (voiceStatus) voiceStatus.textContent = text || "";
  }

  function syncLabels() {
    if (videoKeyLabel) videoKeyLabel.textContent = videoKey || "default";
    if (providerLabel) {
      const extra = provider === "youtube"
        ? `YouTube${youtubeId ? ` (${youtubeId})` : ""}`
        : "Native";
      providerLabel.textContent = `(${extra})`;
    }
  }

  function render() {
    if (qaEmpty) qaEmpty.classList.toggle("hidden", items.length !== 0);
    renderQA(qaList, items);
    if (resetWrap) resetWrap.classList.toggle("hidden", items.length === 0);
  }

  function getItemByIndex(index) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0 || i >= items.length) return null;
    return items[i];
  }

  function getParentUrlSafe() {
    try {
      return window.parent?.location?.href || window.location.href;
    } catch {
      return window.location.href;
    }
  }

  // 카톡 공유: 응답 전체(요청사항 유지)
  function makeKakaoShareTextFull(item) {
    const q = normalizeText(item.question || "");
    const a = normalizeText(item.answer || "");
    return `AIQOO Q&A (${item.tLabel || "00:00"})\n\n[Q]\n${q}\n\n[A]\n${a}`;
  }

  function makeMailBody(item) {
    const url = getParentUrlSafe();
    const q = normalizeText(item.question || "");
    const a = normalizeText(item.answer || "");
    return `AIQOO Q&A 공유\n\n- 시각: ${item.tLabel || "00:00"}\n- 생성: ${item.createdAt || ""}\n- 영상키: ${videoKey}\n- 링크: ${url}\n\n[Q]\n${q}\n\n[A]\n${a}\n`;
  }

  function pushItem(q, a, timeInfo) {
    const it = {
      question: q,
      answer: a,
      t: timeInfo?.t ?? 0,
      tLabel: timeInfo?.tLabel ?? "00:00",
      provider: timeInfo?.provider ?? provider,
      youtubeId: timeInfo?.youtubeId ?? youtubeId,
      createdAt: formatTime(),
    };
    items.push(it);
    store.save(items);
    render();
  }

  // ----------------------------
  // Parent messaging
  // ----------------------------
  player.onMessage((msg) => {
    if (msg.type === "videoInfo") {
      videoKey = msg.videoKey || "default";
      videoUrl = msg.videoUrl || "";
      provider = msg.provider || "native";
      youtubeId = msg.youtubeId || "";
      syncLabels();

      items = store.load();
      render();
      return;
    }

    if (msg.type === "videoPlaying") {
      isPlaying = true;

      // 시작 전: 항상 모달 유지
      if (!hasStarted) {
        setOverlayVisible(true);
        setInputsEnabled(false);
        return;
      }

      // 시작 후: 재생 중 잠금 + 오버레이
      setInputsEnabled(false);
      setOverlayVisible(true);
      return;
    }

    if (msg.type === "videoPaused") {
      isPlaying = false;

      // 시작 전: 여전히 모달 유지
      if (!hasStarted) {
        setOverlayVisible(true);
        setInputsEnabled(false);
        return;
      }

      // 시작 후: 일시정지면 질문 가능
      setOverlayVisible(false);
      setInputsEnabled(true);
      return;
    }
  });

  // iframe 준비 완료
  window.parent.postMessage({ type: "qaReady" }, "*");

  // 최초 진입: “질문 시작하기” 모달 표시
  setOverlayVisible(true);
  setInputsEnabled(false);

  // Overlay click
  if (overlayBtn) {
    overlayBtn.addEventListener("click", () => {
      hasStarted = true;
      player.notifyPause(); // 부모에게 pause 요청
      setOverlayVisible(false);
      setInputsEnabled(true);
      setTimeout(() => questionInput?.focus(), 0);
    });
  }

  // ----------------------------
  // ✅ 크게보기/공유 버튼 이벤트 위임
  // ----------------------------
  if (qaList) {
    qaList.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const index = btn.getAttribute("data-index");
      const item = getItemByIndex(index);
      if (!item) return;

      if (action === "zoom") {
        if (answerModalMeta) {
          answerModalMeta.textContent = `${item.createdAt || ""} · ${item.tLabel || "00:00"} · ${item.provider || ""}`;
        }
        answerModalApi.open(item.answer || "");
        return;
      }

      if (action === "kakao") {
        const link = getParentUrlSafe();
        const text = makeKakaoShareTextFull(item);
        try {
          await share.shareKakao(text, link);
        } catch (err) {
          console.error(err);
          alert("카카오 공유 실패: 길이 제한 또는 도메인/키 설정 문제일 수 있습니다.");
        }
        return;
      }

      if (action === "mail") {
        const subject = `AIQOO Q&A 공유 (${item.tLabel || "00:00"})`;
        share.shareMail(subject, makeMailBody(item));
        return;
      }
    });
  }

  // Modal close / dim click / copy
  if (answerCloseBtn) {
    answerCloseBtn.addEventListener("click", () => answerModalApi.close());
  }
  if (answerModal) {
    answerModal.addEventListener("click", (e) => {
      if (e.target?.dataset?.close === "1") answerModalApi.close();
    });
  }
  if (answerCopyBtn) {
    answerCopyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(answerModalBody?.textContent || "");
        alert("복사되었습니다.");
      } catch {
        alert("복사 실패");
      }
    });
  }

  // ----------------------------
  // STT
  // ----------------------------
  const stt = createSTTService(
    (status) => setVoiceStatus(status),
    (text) => {
      if (questionInput) questionInput.value = text || "";
      questionInput?.focus();
    }
  );

  if (voiceBtn) {
    let recording = false;

    voiceBtn.addEventListener("click", async () => {
      if (!hasStarted) {
        setOverlayVisible(true);
        return;
      }
      if (isPlaying) {
        player.notifyPause();
        return;
      }

      if (!recording) {
        recording = true;
        voiceBtn.textContent = "⏹️ 녹음 종료";
        try {
          await stt.start();
        } catch {
          recording = false;
          voiceBtn.textContent = "🎤 음성 질문";
          setVoiceStatus("❗ 마이크 권한 또는 녹음 시작 실패");
        }
      } else {
        recording = false;
        voiceBtn.textContent = "🎤 음성 질문";
        try { stt.stop(); } catch {}
      }
    });
  }

  // ----------------------------
  // Ask
  // ----------------------------
  async function submitQuestion() {
    if (!hasStarted) return;

    if (isPlaying) {
      player.notifyPause();
      return;
    }

    const q = normalizeText(questionInput?.value || "");
    if (!q) return;

    setInputsEnabled(false);
    if (submitBtn) submitBtn.textContent = "⏳ 응답 생성중...";
    setVoiceStatus("");

    let timeInfo;
    try {
      timeInfo = await player.requestTime();
    } catch {
      timeInfo = { t: 0, tLabel: "00:00", provider, youtubeId };
    }

    try {
      const answer = await askLLM({
        question: q,
        t: timeInfo.t,
        tLabel: timeInfo.tLabel,
        videoKey,
        videoUrl,
        provider,
        youtubeId,
      });

      pushItem(q, answer, timeInfo);
      if (questionInput) questionInput.value = "";
    } catch (e) {
      pushItem(q, `❗ 오류: ${e?.message || "요청 실패"}`, timeInfo);
    } finally {
      if (submitBtn) submitBtn.textContent = "📄 텍스트 질문";
      setInputsEnabled(true);
      questionInput?.focus();
    }
  }

  if (submitBtn) submitBtn.addEventListener("click", submitQuestion);

  // ✅ Enter 전송 / Shift+Enter 줄바꿈
  if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("현재 강의의 Q&A를 모두 삭제할까요?")) return;
      store.clear();
      items = [];
      render();
    });
  }

  // Init
  syncLabels();
  render();
})();
