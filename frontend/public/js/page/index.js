// index.js
// - 영상(YouTube/native) 제어 + qa iframe과 postMessage 동기화
// - ✅ 모바일(좁은 폭)에서 Q&A 접기/펼치기 + 하단 높이 드래그(resizable)

(function () {
  "use strict";

  // ✅ 첫 화면 기본 영상 (원하시는 강의 URL로 교체하세요)
  const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=HnvitMTkXro";

  const appRoot = document.getElementById("appRoot") || document.querySelector(".app");

  const videoUrlInput = document.getElementById("videoUrl");
  const videoApplyBtn = document.getElementById("videoApply");

  const nativeVideo = document.getElementById("nativeVideo");
  const youtubeWrap = document.getElementById("youtubeWrap");
  const ytPlayerEl = document.getElementById("ytPlayer");
  const placeholder = document.getElementById("videoPlaceholder");

  const qaPanel = document.getElementById("qaPanel") || document.querySelector(".right");
  const qaToggleBtn = document.getElementById("qaToggle");
  const qaResizeHandle = document.getElementById("qaResizeHandle");

  // ✅ id="qaFrame" 우선
  const qaFrame =
    document.getElementById("qaFrame") ||
    document.querySelector('iframe[src$="/html/qa.html"], iframe[src*="qa.html"]');

  function postToQA(msg) {
    if (!qaFrame || !qaFrame.contentWindow) return;
    qaFrame.contentWindow.postMessage(msg, "*");
  }

  /* =========================================================
   * 모바일 Q&A UX: 접기/펼치기 + 드래그 리사이즈
   * - 모바일(<=980px)에서만 동작
   * - 높이는 CSS 변수 --qaHeight(px)로 제어
   * ========================================================= */
  const MOBILE_MQ = window.matchMedia("(max-width: 980px)");
  const LS_KEY = "aiqoo.qaHeightPx";
  const LS_COLLAPSE_KEY = "aiqoo.qaCollapsed";

  function isMobileLayout() {
    return !!MOBILE_MQ.matches;
  }

  function setQaHeightPx(px) {
    if (!appRoot) return;
    const clamped = Math.max(0, Math.floor(px || 0));
    appRoot.style.setProperty("--qaHeight", clamped + "px");
    try { localStorage.setItem(LS_KEY, String(clamped)); } catch (_) {}
  }

  function getSavedQaHeightPx() {
    try {
      const v = Number(localStorage.getItem(LS_KEY) || 0);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  function setCollapsed(collapsed) {
    const on = !!collapsed;
    document.body.classList.toggle("qa-collapsed", on);
    if (qaToggleBtn) qaToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    try { localStorage.setItem(LS_COLLAPSE_KEY, on ? "1" : "0"); } catch (_) {}
  }

  function getSavedCollapsed() {
    try { return (localStorage.getItem(LS_COLLAPSE_KEY) || "0") === "1"; }
    catch { return false; }
  }

  function applyMobileQaState() {
    if (!isMobileLayout()) {
      // 데스크톱: 접기 상태 제거 + 인라인 높이 제거
      document.body.classList.remove("qa-collapsed");
      if (appRoot) appRoot.style.removeProperty("--qaHeight");
      return;
    }

    // 모바일: 저장값 적용
    const collapsed = getSavedCollapsed();
    setCollapsed(collapsed);

    if (!collapsed) {
      const saved = getSavedQaHeightPx();
      const fallback = Math.round(window.innerHeight * 0.45);
      const h = saved > 0 ? saved : fallback;
      setQaHeightPx(h);
    }
  }

  function toggleQaPanel() {
    if (!isMobileLayout()) return;

    const currentlyCollapsed = document.body.classList.contains("qa-collapsed");
    if (currentlyCollapsed) {
      // 펼치기
      setCollapsed(false);
      const saved = getSavedQaHeightPx();
      const fallback = Math.round(window.innerHeight * 0.45);
      const h = saved > 0 ? saved : fallback;
      setQaHeightPx(h);
    } else {
      // 접기(현재 높이는 저장)
      const curr = getComputedStyle(appRoot).getPropertyValue("--qaHeight").trim();
      const px = Number(curr.replace("px", "")) || getSavedQaHeightPx() || Math.round(window.innerHeight * 0.45);
      setQaHeightPx(px);
      setCollapsed(true);
    }
  }

  function bindResizeHandle() {
    if (!qaResizeHandle || !appRoot) return;

    let dragging = false;
    let pointerId = null;

    const MIN_PX = 180;
    const MAX_RATIO = 0.80;

    function clampHeight(h) {
      const maxPx = Math.round(window.innerHeight * MAX_RATIO);
      return Math.max(MIN_PX, Math.min(maxPx, Math.floor(h)));
    }

    function onDown(e) {
      if (!isMobileLayout()) return;
      if (document.body.classList.contains("qa-collapsed")) return;

      dragging = true;
      pointerId = e.pointerId;
      try { qaResizeHandle.setPointerCapture(pointerId); } catch (_) {}
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      if (!isMobileLayout()) return;
      if (document.body.classList.contains("qa-collapsed")) return;

      const h = window.innerHeight - e.clientY; // 하단 패널 높이
      setQaHeightPx(clampHeight(h));
      e.preventDefault();
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      try { qaResizeHandle.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      e.preventDefault();
    }

    qaResizeHandle.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });
  }

  if (qaToggleBtn) {
    qaToggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleQaPanel();
    });
  }
  bindResizeHandle();
  applyMobileQaState();
  MOBILE_MQ.addEventListener?.("change", applyMobileQaState);

  window.addEventListener("resize", () => {
    if (!isMobileLayout()) return;
    if (document.body.classList.contains("qa-collapsed")) return;

    const saved = getSavedQaHeightPx();
    if (!saved) return;

    const maxPx = Math.round(window.innerHeight * 0.80);
    if (saved > maxPx) setQaHeightPx(maxPx);
  });

  /* =========================================================
   * 영상/QA 동기화 로직
   * ========================================================= */

  let provider = "native"; // "youtube" | "native"
  let youtubeId = "";
  let videoUrl = "";
  let videoKey = "default";

  let ytPlayer = null;
  let ytReady = false;
  let pendingYoutubeId = "";
  let qaIsReady = false;

  function isYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
  }

  function parseYouTubeId(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "").trim();
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || "";
      return "";
    } catch {
      return "";
    }
  }

  function makeVideoKey(p, url, yid) {
    if (p === "youtube" && yid) return `yt:${yid}`;
    if (url) return `url:${encodeURIComponent(url)}`;
    return "default";
  }

  function formatTimeLabel(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds || 0)));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function showPlaceholder(show) {
    if (!placeholder) return;
    placeholder.classList.toggle("hidden", !show);
  }
  function showNative(show) {
    if (!nativeVideo) return;
    nativeVideo.classList.toggle("hidden", !show);
  }
  function showYouTube(show) {
    if (!youtubeWrap) return;
    youtubeWrap.classList.toggle("hidden", !show);
  }

  function sendVideoInfo() {
    if (!qaIsReady) return;
    postToQA({ type: "videoInfo", videoKey, videoUrl, provider, youtubeId });
  }
  function sendPlaying() {
    if (!qaIsReady) return;
    postToQA({ type: "videoPlaying" });
  }
  function sendPaused() {
    if (!qaIsReady) return;
    postToQA({ type: "videoPaused" });
  }
  function sendTimeInfo() {
    if (!qaIsReady) return;
    const t = getCurrentTime();
    postToQA({ type: "timeInfo", t, tLabel: formatTimeLabel(t), provider, youtubeId });
  }

  function getCurrentTime() {
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
      return Number(ytPlayer.getCurrentTime() || 0);
    }
    if (provider === "native" && nativeVideo) return Number(nativeVideo.currentTime || 0);
    return 0;
  }

  function isCurrentlyPlaying() {
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.getPlayerState === "function") {
      return ytPlayer.getPlayerState() === 1; // PLAYING
    }
    if (provider === "native" && nativeVideo) return !nativeVideo.paused && !nativeVideo.ended;
    return false;
  }

  function broadcastCurrentState() {
    if (!qaIsReady) return;
    if (isCurrentlyPlaying()) sendPlaying();
    else sendPaused();
  }

  function pauseVideoAndBroadcast() {
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      ytPlayer.pauseVideo();
      setTimeout(() => sendPaused(), 150);
      return;
    }
    if (provider === "native" && nativeVideo && !nativeVideo.paused) {
      nativeVideo.pause();
      setTimeout(() => sendPaused(), 50);
      return;
    }
    setTimeout(() => sendPaused(), 0);
  }

  // Native events
  if (nativeVideo) {
    nativeVideo.addEventListener("play", () => {
      provider = "native";
      sendPlaying();
    });
    nativeVideo.addEventListener("pause", () => {
      provider = "native";
      sendPaused();
    });
    nativeVideo.addEventListener("ended", () => {
      provider = "native";
      sendPaused();
    });
  }

  // YouTube IFrame API
  function ensureYT() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();

      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);

      window.onYouTubeIframeAPIReady = () => resolve();
    });
  }

  async function initYouTubePlayer(yid) {
    await ensureYT();
    ytReady = true;

    if (!ytPlayerEl) return;

    try { ytPlayer?.destroy?.(); } catch (_) {}
    ytPlayer = null;

    ytPlayer = new window.YT.Player("ytPlayer", {
      videoId: yid,
      playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          provider = "youtube";
          youtubeId = yid;
          sendVideoInfo();
          broadcastCurrentState();
        },
        onStateChange: (ev) => {
          provider = "youtube";
          const st = ev?.data;
          if (st === 1) sendPlaying();
          else sendPaused();
        },
      },
    });
  }

  async function applyVideo(url) {
    const u = (url || "").trim();
    if (!u) return;

    videoUrl = u;
    youtubeId = "";
    provider = "native";
    videoKey = "default";

    if (isYouTubeUrl(u)) {
      const yid = parseYouTubeId(u);
      if (!yid) {
        showPlaceholder(true);
        showNative(false);
        showYouTube(false);
        return;
      }

      provider = "youtube";
      youtubeId = yid;
      videoKey = makeVideoKey(provider, "", youtubeId);

      showPlaceholder(false);
      showNative(false);
      showYouTube(true);

      pendingYoutubeId = yid;
      sendVideoInfo();
      initYouTubePlayer(pendingYoutubeId);
      return;
    }

    provider = "native";
    youtubeId = "";
    videoKey = makeVideoKey(provider, u, "");

    showPlaceholder(false);
    showYouTube(false);
    showNative(true);

    if (nativeVideo) {
      nativeVideo.src = u;
      nativeVideo.load();
    }

    sendVideoInfo();
    setTimeout(() => sendPaused(), 0);
  }

  // UI events
  if (videoApplyBtn && videoUrlInput) {
    videoApplyBtn.addEventListener("click", () => applyVideo(videoUrlInput.value || ""));
    videoUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyVideo(videoUrlInput.value || "");
      }
    });
  }

  // QA messages
  window.addEventListener("message", (e) => {
    if (!e.data) return;

    if (e.data.type === "qaReady") {
      qaIsReady = true;
      sendVideoInfo();
      broadcastCurrentState();
      return;
    }

    if (e.data.type === "qaFocus") {
      pauseVideoAndBroadcast();

      // ✅ 모바일에서 Q&A가 접혀있으면 자동으로 펼쳐줌
      if (isMobileLayout() && document.body.classList.contains("qa-collapsed")) {
        setCollapsed(false);
        const saved = getSavedQaHeightPx();
        const fallback = Math.round(window.innerHeight * 0.45);
        setQaHeightPx(saved > 0 ? saved : fallback);
      }
      return;
    }

    if (e.data.type === "requestTime") {
      sendTimeInfo();
      return;
    }
  });

  // init
  showPlaceholder(true);
  showNative(false);
  showYouTube(false);

  const initialUrl = (videoUrlInput?.value || "").trim() || DEFAULT_VIDEO_URL;

  if (videoUrlInput && !videoUrlInput.value.trim()) {
    videoUrlInput.value = initialUrl;
  }

  applyVideo(initialUrl);
})();
