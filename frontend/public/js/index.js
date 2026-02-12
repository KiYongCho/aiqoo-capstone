// public/js/index.js
// - 첫 화면에서 기본 영상 자동 로드
// - qaFrame을 id 우선으로 안정적으로 찾기
// - DOM 누락 시 크래시 방지(가드)

(function () {
  "use strict";

  // ✅ 첫 화면 기본 영상 (원하시는 강의 URL로 교체하세요)
  const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  const videoUrlInput = document.getElementById("videoUrl");
  const videoApplyBtn = document.getElementById("videoApply");

  const nativeVideo = document.getElementById("nativeVideo");
  const youtubeWrap = document.getElementById("youtubeWrap");
  const ytPlayerEl = document.getElementById("ytPlayer");
  const placeholder = document.getElementById("videoPlaceholder");

  // ✅ 기존: iframe[src="html/qa.html"] → /html/qa.html이면 못 찾음
  // ✅ id="qaFrame"를 우선 사용
  const qaFrame =
    document.getElementById("qaFrame") ||
    document.querySelector('iframe[src$="/html/qa.html"], iframe[src*="qa.html"]');

  function postToQA(msg) {
    if (!qaFrame || !qaFrame.contentWindow) return;
    qaFrame.contentWindow.postMessage(msg, "*");
  }

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

  // Native events (가드)
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

  // YouTube API load
  function loadYouTubeApiOnce() {
    if (window.YT && window.YT.Player) return;

    window.onYouTubeIframeAPIReady = function () {
      createYouTubePlayer();
    };

    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  }

  function createYouTubePlayer() {
    if (!(window.YT && window.YT.Player)) return;
    if (ytPlayer) return;
    if (!ytPlayerEl) return;

    ytPlayer = new YT.Player(ytPlayerEl, {
      videoId: "",
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          ytReady = true;

          if (pendingYoutubeId) {
            ytPlayer.loadVideoById(pendingYoutubeId);
            pendingYoutubeId = "";
          }
          broadcastCurrentState();
        },
        onStateChange: (event) => {
          provider = "youtube";
          const s = event.data; // 1=PLAYING, 2=PAUSED, 0=ENDED
          if (s === 1) sendPlaying();
          else if (s === 2) sendPaused();
          else if (s === 0) sendPaused();
        }
      }
    });
    window.ytPlayer = ytPlayer;
  }

  function applyVideo(url) {
    videoUrl = (url || "").trim();

    if (!videoUrl) {
      showPlaceholder(true);
      showNative(false);
      showYouTube(false);
      provider = "native";
      youtubeId = "";
      videoKey = "default";
      sendVideoInfo();
      sendPaused();
      return;
    }

    try {
      if (nativeVideo) nativeVideo.pause();
    } catch (_) {}

    if (isYouTubeUrl(videoUrl)) {
      provider = "youtube";
      youtubeId = parseYouTubeId(videoUrl);
      videoKey = makeVideoKey(provider, videoUrl, youtubeId);

      showPlaceholder(false);
      showNative(false);
      showYouTube(true);

      loadYouTubeApiOnce();
      createYouTubePlayer();

      sendVideoInfo();

      if (youtubeId) {
        if (ytPlayer && ytReady) ytPlayer.loadVideoById(youtubeId);
        else pendingYoutubeId = youtubeId;
      }

      setTimeout(() => sendPaused(), 0);
    } else {
      provider = "native";
      youtubeId = "";
      videoKey = makeVideoKey(provider, videoUrl, "");

      showPlaceholder(false);
      showYouTube(false);
      showNative(true);

      if (nativeVideo) {
        nativeVideo.src = videoUrl;
        nativeVideo.load();
      }

      sendVideoInfo();
      setTimeout(() => sendPaused(), 0);
    }
  }

  // UI events (가드)
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

  // ✅ 핵심: 첫 화면 기본 영상 자동 로드
  const initialUrl = (videoUrlInput?.value || "").trim() || DEFAULT_VIDEO_URL;

  // 입력창에도 기본값을 반영(사용자에게 보이게)
  if (videoUrlInput && !videoUrlInput.value.trim()) {
    videoUrlInput.value = initialUrl;
  }

  applyVideo(initialUrl);
})();
