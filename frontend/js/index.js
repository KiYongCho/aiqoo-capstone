// js/index.js
(function () {
  const videoUrlInput = document.getElementById("videoUrl");
  const videoApplyBtn = document.getElementById("videoApply");

  const nativeVideo = document.getElementById("nativeVideo");
  const youtubeWrap = document.getElementById("youtubeWrap");
  const ytPlayerEl = document.getElementById("ytPlayer");
  const placeholder = document.getElementById("videoPlaceholder");

  const qaFrame = document.querySelector('iframe[src="html/qa.html"]');

  // =========================
  // postMessage helper
  // =========================
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

  // YouTube Player
  let ytPlayer = null;
  window.ytPlayer = null; // qaFocus에서 접근 가능하도록 공개(선택)

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

  // =========================
  // 상태 메시지 전송
  // =========================
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

  // =========================
  // 현재 시간/정지
  // =========================
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
    // YouTube
    if (provider === "youtube" && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      ytPlayer.pauseVideo();
      return;
    }
    // Native
    if (provider === "native" && nativeVideo && !nativeVideo.paused) {
      nativeVideo.pause();
    }
  }

  // =========================
  // Native video 이벤트 -> QA에 전송
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
    // 최초엔 플레이어만 만들어두고, 실제 로드는 apply에서 함
    ytPlayer = new YT.Player(ytPlayerEl, {
      videoId: "", // apply에서 loadVideoById로 로드
      playerVars: {
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          // 준비 완료: 아무것도 안 해도 됨
        },
        onStateChange: (event) => {
          if (!event) return;
          const s = event.data;
          if (s === YT.PlayerState.PLAYING) {
            provider = "youtube";
            sendPlaying();
          } else if (s === YT.PlayerState.PAUSED) {
            provider = "youtube";
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
    videoUrl = url.trim();
    if (!videoUrl) {
      showPlaceholder(true);
      showNative(false);
      showYouTube(false);
      return;
    }

    if (isYouTubeUrl(videoUrl)) {
      // YouTube
      provider = "youtube";
      youtubeId = parseYouTubeId(videoUrl);

      videoKey = makeVideoKey(provider, videoUrl, youtubeId);

      showPlaceholder(false);
      showNative(false);
      showYouTube(true);

      sendVideoInfo();

      if (ytPlayer && youtubeId) {
        // 즉시 로드
        ytPlayer.loadVideoById(youtubeId);
      }
    } else {
      // Native
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

  // =========================
  // QA iframe -> 부모 메시지 처리
  // =========================
  window.addEventListener("message", (e) => {
    if (!e.data) return;

    // ✅ 질문 버튼 누르면 강의 멈춰야 함
    if (e.data.type === "qaFocus") {
      pauseVideo();
      return;
    }

    // QA가 현재 시간 요청
    if (e.data.type === "requestTime") {
      sendTimeInfo();
      return;
    }

    // QA iframe 준비됨: 현재 videoInfo 한번 보내주면 UX 좋아짐
    if (e.data.type === "qaReady") {
      sendVideoInfo();
      return;
    }
  });

  // 초기 상태
  showPlaceholder(true);
  showNative(false);
  showYouTube(false);

  // 초기값이 입력되어 있으면 바로 적용해도 좋고(원하시면), 지금은 사용자 클릭 적용으로 둠
  // applyVideo(videoUrlInput.value || "");
})();
