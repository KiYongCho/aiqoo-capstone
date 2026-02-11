// js/index.js
(function () {
  const videoUrlInput = document.getElementById("videoUrl");
  const videoApplyBtn = document.getElementById("videoApply");

  const nativeVideo = document.getElementById("nativeVideo");
  const youtubeWrap = document.getElementById("youtubeWrap");
  const ytPlayerEl = document.getElementById("ytPlayer");
  const placeholder = document.getElementById("videoPlaceholder");

  const qaFrame = document.querySelector('iframe[src="html/qa.html"]');

  function postToQA(msg) {
    if (!qaFrame || !qaFrame.contentWindow) return;
    qaFrame.contentWindow.postMessage(msg, "*");
  }

  // =========================
  // 상태
  // =========================
  let provider = "native"; // "youtube" | "native"
  let youtubeId = "";
  let videoUrl = "";
  let videoKey = "default";

  let ytPlayer = null;
  window.ytPlayer = null;

  // ✅ YouTube API ready 전 apply 대비
  let pendingYoutubeId = "";
  let ytReady = false;

  // =========================
  // util
  // =========================
  function isYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
  }

  function parseYouTubeId(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "").trim();
      }
      if (u.hostname.includes("youtube.com")) {
        return u.searchParams.get("v") || "";
      }
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
    placeholder.classList.toggle("hidden", !show);
  }
  function showNative(show) {
    nativeVideo.classList.toggle("hidden", !show);
  }
  function showYouTube(show) {
    youtubeWrap.classList.toggle("hidden", !show);
  }

  function sendVideoInfo() {
    postToQA({
      type: "videoInfo",
      videoKey,
      videoUrl,
      provider,
      youtubeId
    });
  }
  function sendPlaying() {
    postToQA({ type: "videoPlaying" });
  }
  function sendPaused() {
    postToQA({ type: "videoPaused" });
  }
  function sendTimeInfo() {
    const t = getCurrentTime();
    postToQA({
      type: "timeInfo",
      t,
      tLabel: formatTimeLabel(t),
      provider,
      youtubeId
    });
  }

  function getCurrentTime() {
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
      return Number(ytPlayer.getCurrentTime() || 0);
    }
    if (provider === "native" && nativeVideo) {
      return Number(nativeVideo.currentTime || 0);
    }
    return 0;
  }

  function pauseVideo() {
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      ytPlayer.pauseVideo();
      return;
    }
    if (provider === "native" && nativeVideo && !nativeVideo.paused) {
      nativeVideo.pause();
    }
  }

  // =========================
  // Native events
  // =========================
  nativeVideo.addEventListener("play", () => {
    provider = "native";
    sendPlaying();
  });

  nativeVideo.addEventListener("pause", () => {
    provider = "native";
    sendPaused();
  });

  // =========================
  // YouTube API ready
  // =========================
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player(ytPlayerEl, {
      videoId: "",
      playerVars: {
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          ytReady = true;
          // ✅ ready 전에 눌렀던 apply 처리
          if (pendingYoutubeId) {
            ytPlayer.loadVideoById(pendingYoutubeId);
            pendingYoutubeId = "";
          }
        },
        onStateChange: (event) => {
          const s = event.data;
          if (s === YT.PlayerState.PLAYING) {
            provider = "youtube";
            sendPlaying();
          } else if (s === YT.PlayerState.PAUSED) {
            provider = "youtube";
            sendPaused();
          } else if (s === YT.PlayerState.ENDED) {
            provider = "youtube";
            // 끝나도 질문 가능이어야 하므로 paused로 처리
            sendPaused();
          }
        }
      }
    });

    window.ytPlayer = ytPlayer;
  };

  // =========================
  // apply video
  // =========================
  function applyVideo(url) {
    videoUrl = (url || "").trim();

    if (!videoUrl) {
      showPlaceholder(true);
      showNative(false);
      showYouTube(false);
      return;
    }

    // ✅ 기존 영상 정리
    try {
      if (!nativeVideo.classList.contains("hidden")) {
        nativeVideo.pause();
      }
    } catch (_) {}

    if (isYouTubeUrl(videoUrl)) {
      provider = "youtube";
      youtubeId = parseYouTubeId(videoUrl);
      videoKey = makeVideoKey(provider, videoUrl, youtubeId);

      showPlaceholder(false);
      showNative(false);
      showYouTube(true);

      sendVideoInfo();

      // ✅ ytReady 이전이면 pending으로 저장
      if (youtubeId) {
        if (ytPlayer && ytReady) {
          ytPlayer.loadVideoById(youtubeId);
        } else {
          pendingYoutubeId = youtubeId;
        }
      }
    } else {
      provider = "native";
      youtubeId = "";
      videoKey = makeVideoKey(provider, videoUrl, "");

      showPlaceholder(false);
      showYouTube(false);
      showNative(true);

      nativeVideo.src = videoUrl;
      nativeVideo.load();

      sendVideoInfo();
    }
  }

  videoApplyBtn.addEventListener("click", () => {
    applyVideo(videoUrlInput.value || "");
  });

  // ✅ 엔터로도 적용
  videoUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyVideo(videoUrlInput.value || "");
    }
  });

  // =========================
  // QA iframe -> 부모 메시지 처리
  // =========================
  window.addEventListener("message", (e) => {
    if (!e.data) return;

    if (e.data.type === "qaFocus") {
      pauseVideo();
      return;
    }

    if (e.data.type === "requestTime") {
      sendTimeInfo();
      return;
    }

    if (e.data.type === "qaReady") {
      sendVideoInfo();
      return;
    }
  });

  // =========================
  // 초기 상태: 기본 URL 자동 적용 ✅
  // =========================
  showPlaceholder(true);
  showNative(false);
  showYouTube(false);

  // 입력창에 기본값이 있으면 바로 띄우기
  const initialUrl = (videoUrlInput.value || "").trim();
  if (initialUrl) {
    applyVideo(initialUrl);
  }
})();
