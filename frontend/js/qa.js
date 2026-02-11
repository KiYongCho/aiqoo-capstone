const API_BASE = "https://aiqa-capstone.onrender.com";

(function () {
  const questionInput = document.getElementById('questionInput');
  const submitBtn = document.getElementById('submitBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const voiceStatus = document.getElementById('voiceStatus');

  const resetBtn = document.getElementById('resetBtn');
  const qaList = document.getElementById('qaList');
  const qaEmpty = document.getElementById('qaEmpty');
  const videoKeyLabel = document.getElementById('videoKeyLabel');
  const providerLabel = document.getElementById('providerLabel');

  const resetWrap = document.getElementById('resetWrap');
  const hintLabel = document.getElementById('hintLabel');
  const chipsWrap = document.getElementById('exampleChips');
  const chipButtons = chipsWrap ? Array.from(chipsWrap.querySelectorAll('button[data-example]')) : [];

  // ✅ 오버레이
  const playOverlay = document.getElementById('playOverlay');
  const overlayBtn = document.getElementById('overlayBtn');
  const overlaySub = document.getElementById('overlaySub');

  // ✅ TOP 버튼
  const toTopBtn = document.getElementById('toTopBtn');

  function safeParseUrl(u) { try { return new URL(u); } catch { return null; } }
  const ref = safeParseUrl(document.referrer);
  const parentOriginFromReferrer = ref ? ref.origin : '';
  const PARENT_ORIGIN = parentOriginFromReferrer || window.location.origin;

  function getPostTargetOrigin() {
    if (PARENT_ORIGIN && PARENT_ORIGIN.startsWith('http')) return PARENT_ORIGIN;
    return '*';
  }

  // =========================
  // 상태
  // =========================
  let videoKey = 'default';
  let videoUrl = '';
  let provider = 'native';
  let youtubeId = '';

  let isPlaying = false;
  let overlayPauseRequested = false;

  // Hybrid STT
  let isRecording = false;
  let realtimeBaseText = "";
  let realtimeFinal = "";
  let realtimeInterim = "";
  let mediaRecorder = null;
  let chunks = [];

  function storageKey() {
    return 'lecture-qa:' + (videoKey || 'default');
  }

  function loadQA() {
    try {
      const raw = localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveQA(items) {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  }

  function formatTime() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // =========================
  // 오버레이 제어
  // =========================
  function showOverlay() {
    if (!playOverlay) return;
    playOverlay.classList.remove('hidden');
    playOverlay.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    if (!playOverlay) return;
    playOverlay.classList.add('hidden');
    playOverlay.setAttribute('aria-hidden', 'true');
  }

  function setOverlayPending(pending) {
    overlayPauseRequested = pending;
    if (!overlayBtn || !overlaySub) return;

    overlayBtn.disabled = pending;
    overlaySub.textContent = pending
      ? '멈추는 중… 잠시만 기다려 주세요'
      : '▶ 질문 시작하기 (영상 멈춤)';
  }

  // =========================
  // UX 동기화
  // =========================
  function isQuestionEnabled() {
    return questionInput && !questionInput.disabled;
  }

  function syncQAUI() {
    const enabled = isQuestionEnabled();

    if (resetWrap) resetWrap.classList.toggle('hidden', !enabled);

    if (hintLabel) {
      hintLabel.classList.toggle('aiqa-hint-pulse', !enabled);
      hintLabel.textContent = enabled
        ? '질문을 입력하고 전송해 주세요.'
        : (isPlaying ? '재생 중: 오버레이를 눌러 질문을 시작하세요.' : '영상이 멈추면 질문할 수 있습니다.');
    }

    chipButtons.forEach(btn => { btn.disabled = !enabled; });
  }

  chipButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const example = btn.getAttribute('data-example') || '';
      questionInput.value = example;
      questionInput.focus();
      questionInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  function render() {
    videoKeyLabel.textContent = videoKey || 'default';
    providerLabel.textContent = provider === 'youtube' ? ('YouTube · ' + (youtubeId || '')) : 'Native';

    const items = loadQA();
    qaEmpty.style.display = items.length ? 'none' : 'block';
    qaList.querySelectorAll('.qa-item').forEach(el => el.remove());

    const total = items.length;
    items.slice().reverse().forEach(function (item, revIdx) {
      const originalIndex = total - 1 - revIdx;

      const div = document.createElement('div');
      div.className = 'qa-item mb-3.5 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]';

      let answerHtml = '';
      if (item.answer) {
        answerHtml =
          '<div class="border-t border-white/[0.05] bg-black/20 px-3.5 py-3">' +
            '<div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">답변 (LLM)</div>' +
            '<div class="max-h-[240px] overflow-y-auto overflow-x-hidden pr-1.5 text-[13px] leading-relaxed text-zinc-300 whitespace-pre-wrap">' +
              escapeHtml(item.answer) +
            '</div>' +
          '</div>';
      } else if (item.error) {
        answerHtml =
          '<div class="border-t border-white/[0.05] bg-black/20 px-3.5 py-3">' +
            '<div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">답변</div>' +
            '<div class="text-[13px] leading-normal text-red-400">' + escapeHtml(item.error) + '</div>' +
          '</div>';
      } else {
        answerHtml =
          '<div class="border-t border-white/[0.05] bg-black/20 px-3.5 py-3">' +
            '<div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">답변</div>' +
            '<div class="text-[13px] italic text-zinc-500">답변 생성 중...</div>' +
          '</div>';
      }

      div.innerHTML =
        '<div class="flex items-center gap-2.5 px-3.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">' +
          '<strong class="text-xs font-semibold text-violet-400">Q' + (originalIndex + 1) + '</strong> ' +
          (item.time || '') +
        '</div>' +
        '<div class="px-3.5 pb-3.5 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">' + escapeHtml(item.question) + '</div>' +
        answerHtml;

      qaList.appendChild(div);
    });

    syncQAUI();
    syncTopButton();
  }

  function setQuestionUIEnabled(enabled) {
    questionInput.disabled = !enabled;
    submitBtn.disabled = !enabled;
    voiceBtn.disabled = !enabled;
    questionInput.placeholder = enabled ? '이 강의에 대해 질문을 입력하세요...' : '영상이 멈추면 질문할 수 있습니다.';
    syncQAUI();
  }

  function notifyParentPause() {
    try { window.parent.postMessage({ type: 'qaFocus' }, getPostTargetOrigin()); } catch (_) {}
  }

  // ✅ 오버레이 클릭
  if (overlayBtn) {
    overlayBtn.addEventListener('click', () => {
      if (!isPlaying) {
        hideOverlay();
        setOverlayPending(false);
        setQuestionUIEnabled(true);
        questionInput.focus();
        return;
      }
      setOverlayPending(true);
      notifyParentPause();
    });
  }

  async function requestTimeFromParent() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ t: 0, tLabel: '00:00', provider, youtubeId }), 500);

      function onMsg(e) {
        if (!e.data || e.data.type !== 'timeInfo') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve({
          t: Number(e.data.t || 0),
          tLabel: String(e.data.tLabel || '00:00'),
          provider: String(e.data.provider || provider),
          youtubeId: String(e.data.youtubeId || youtubeId)
        });
      }

      window.addEventListener('message', onMsg);
      try { window.parent.postMessage({ type: 'requestTime' }, getPostTargetOrigin()); } catch (_) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve({ t: 0, tLabel: '00:00', provider, youtubeId });
      }
    });
  }

  async function requestAnswer(payload) {
    const url = API_BASE + '/api/answer';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : (text || ('답변 생성 실패 (HTTP ' + res.status + ')'));
      throw new Error(msg);
    }

    const answer = data && data.answer ? String(data.answer) : '';
    if (!answer) throw new Error('LLM이 빈 답변을 반환했습니다. 다시 시도해 주세요.');
    return answer;
  }

  function updateLastItem(patch) {
    const items = loadQA();
    const idx = items.length - 1;
    if (!items[idx]) return;
    Object.assign(items[idx], patch);
    saveQA(items);
    render();
  }

  async function submitQuestion(text) {
    if (!text || !(text = text.trim())) return;

    const timeInfo = await requestTimeFromParent();

    const items = loadQA();
    items.push({
      question: text,
      time: formatTime(),
      videoKey,
      videoUrl,
      provider: timeInfo.provider,
      youtubeId: timeInfo.youtubeId,
      t: timeInfo.t,
      tLabel: timeInfo.tLabel,
      answer: '',
      error: ''
    });
    saveQA(items);

    questionInput.value = '';
    submitBtn.disabled = true;
    voiceBtn.disabled = true;
    render();

    try {
      const answer = await requestAnswer({
        question: text,
        videoKey,
        videoUrl,
        provider: timeInfo.provider,
        youtubeId: timeInfo.youtubeId,
        t: timeInfo.t,
        tLabel: timeInfo.tLabel
      });
      updateLastItem({ answer, error: '' });
    } catch (err) {
      updateLastItem({ error: err?.message || '연결 실패' });
    } finally {
      submitBtn.disabled = false;
      syncQAUI();
      render();
    }
  }

  // =====================================================
  // ✅ TOP 버튼 로직 (qaList 스크롤 기준)
  // =====================================================
  function syncTopButton() {
    if (!toTopBtn || !qaList) return;
    const y = qaList.scrollTop || 0;
    toTopBtn.classList.toggle('hidden', y < 240);
  }

  if (qaList) {
    qaList.addEventListener('scroll', syncTopButton, { passive: true });
  }

  if (toTopBtn) {
    toTopBtn.addEventListener('click', () => {
      if (!qaList) return;
      qaList.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =====================================================
  // ✅ 부모 메시지 처리
  // =====================================================
  window.addEventListener('message', function (e) {
    if (!e.data) return;

    if (e.data.type === 'videoPlaying') {
      isPlaying = true;
      showOverlay();
      setOverlayPending(false);
      setQuestionUIEnabled(false);
      return;
    }

    if (e.data.type === 'videoPaused') {
      isPlaying = false;
      hideOverlay();
      setOverlayPending(false);
      setQuestionUIEnabled(true);
      return;
    }

    if (e.data.type === 'videoInfo' && e.data.videoKey) {
      videoKey = String(e.data.videoKey);
      videoUrl = String(e.data.videoUrl || '');
      provider = String(e.data.provider || 'native');
      youtubeId = String(e.data.youtubeId || '');
      render();
    }
  });

  if (window.parent !== window) {
    try { window.parent.postMessage({ type: 'qaReady' }, getPostTargetOrigin()); } catch (_) {}
  }

  // =====================================================
  // ✅ 질문 전송
  // =====================================================
  submitBtn.addEventListener('click', function () {
    notifyParentPause();
    const v = (questionInput.value || '').trim();
    if (!v) {
      setQuestionUIEnabled(true);
      questionInput.focus();
      return;
    }
    submitQuestion(questionInput.value);
  });

  questionInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      notifyParentPause();
      submitQuestion(questionInput.value);
    }
  });

  questionInput.addEventListener('focus', function () {
    notifyParentPause();
  });

  // =====================================================
  // ✅ 음성 버튼은 기존 로직을 유지(리얼쵸키님 환경별 커스텀 가능)
  // - 여기서는 “버튼 UI 토글”만 유지하고, 기존 하이브리드/Whisper 로직이 있다면
  //   그 코드로 교체하셔도 TOP/스크롤은 영향 없습니다.
  // =====================================================
  voiceBtn.addEventListener('click', function () {
    // 프로젝트에 적용된 음성 로직(하이브리드/Whisper)을 그대로 붙여 쓰시면 됩니다.
    // 여기서는 최소 UX만:
    notifyParentPause();
    voiceStatus.textContent = '음성 기능은 현재 프로젝트 버전의 qa.js 로직을 사용합니다.';
  });

  // Reset modal
  const resetModal = document.getElementById('resetModal');
  const resetModalCancel = document.getElementById('resetModalCancel');
  const resetModalConfirm = document.getElementById('resetModalConfirm');

  function openResetModal() {
    if (loadQA().length === 0) return;
    resetModal.classList.remove('hidden');
    resetModal.classList.add('flex');
    resetModal.setAttribute('aria-hidden', 'false');
  }
  function closeResetModal() {
    resetModal.classList.add('hidden');
    resetModal.classList.remove('flex');
    resetModal.setAttribute('aria-hidden', 'true');
  }

  resetBtn.addEventListener('click', openResetModal);
  resetModalCancel.addEventListener('click', closeResetModal);
  resetModalConfirm.addEventListener('click', function () {
    localStorage.removeItem(storageKey());
    closeResetModal();
    render();
  });
  resetModal.addEventListener('click', function (e) {
    if (e.target === resetModal) closeResetModal();
  });

  // init
  render();
  hideOverlay();
  setOverlayPending(false);
  setQuestionUIEnabled(false);
  setTimeout(syncTopButton, 0);
})();
