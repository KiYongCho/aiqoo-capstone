// qa.js (오버레이: 재생 중 중앙 모달 + 클릭하면 pause 요청 + paused 오면 활성화)
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

  // ✅ 오버레이 요소
  const playOverlay = document.getElementById('playOverlay');
  const overlayBtn = document.getElementById('overlayBtn');
  const overlaySub = document.getElementById('overlaySub');

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

  let speechSupported = false;
  let isPlaying = false;
  let overlayPauseRequested = false;

  // ✅ STT 상태(추가)
  let isListening = false;
  let sttFinal = '';
  let sttInterim = '';

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
  }

  function setQuestionUIEnabled(enabled) {
    questionInput.disabled = !enabled;
    submitBtn.disabled = !enabled;
    voiceBtn.disabled = !(enabled && speechSupported);
    questionInput.placeholder = enabled ? '이 강의에 대해 질문을 입력하세요...' : '영상이 멈추면 질문할 수 있습니다.';
    syncQAUI();
  }

  function notifyParentPause() {
    try { window.parent.postMessage({ type: 'qaFocus' }, getPostTargetOrigin()); } catch (_) {}
  }

  // ✅ 오버레이 클릭 -> pause 요청 -> paused 오면 활성화
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

  // =========================
  // ✅ STT 유틸(추가)
  // =========================
  function setVoiceUIListening(listening) {
    isListening = listening;
    if (listening) {
      voiceStatus.textContent = '듣는 중... (말하면 입력창에 텍스트가 들어갑니다)';
      voiceBtn.classList.add('listening', '!border-red-500/30', '!bg-red-500/15', '!text-red-300');
      voiceBtn.textContent = '⏹️ 끝내기';
    } else {
      voiceBtn.classList.remove('listening', '!border-red-500/30', '!bg-red-500/15', '!text-red-300');
      voiceBtn.textContent = '🎤 음성 질문';
    }
  }

  function applySttToTextarea() {
    // ✅ 최종+중간 결과를 입력창에 반영
    const composed = (sttFinal + (sttInterim ? (' ' + sttInterim) : '')).trim();

    if (!composed) return;

    // 사용자가 기존에 타이핑한 내용이 있으면 덮어쓰기 대신 "이어붙이기"
    const base = (questionInput.value || '').trim();
    if (!base) {
      questionInput.value = composed;
    } else {
      // 이미 입력창이 composed로 시작하면 업데이트만
      if (base.startsWith(sttFinal) || base === composed) {
        questionInput.value = composed;
      } else {
        questionInput.value = (base + '\n' + composed).trim();
      }
    }

    // 커서 맨 뒤
    try {
      questionInput.focus();
      questionInput.selectionStart = questionInput.selectionEnd = questionInput.value.length;
    } catch (_) {}
  }

  function resetSttBuffer() {
    sttFinal = '';
    sttInterim = '';
  }

  // 부모 메시지 처리
  window.addEventListener('message', function (e) {
    if (!e.data) return;

    if (e.data.type === 'videoPlaying') {
      isPlaying = true;
      showOverlay();
      setOverlayPending(false);

      // 재생 중에는 질문 잠금 + (안전) STT 중이면 종료
      setQuestionUIEnabled(false);
      try { if (isListening && recognition) recognition.stop(); } catch (_) {}

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

  // 질문 버튼(혹시 활성 상태에서 재생으로 바뀌더라도 pause 요청은 유지)
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

  // =========================
  // ✅ 음성 인식 (수정 핵심)
  // - 기존: 음성 끝나면 submitQuestion(finalTranscript)로 즉시 전송
  // - 변경: 음성 결과를 questionInput에 반영하고, 사용자가 "텍스트 질문" 버튼으로 전송
  // =========================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;     // ✅ 길게 말해도 끊김 완화
    recognition.interimResults = true; // ✅ 중간 결과도 입력창에 반영
    recognition.lang = 'ko-KR';
  }

  if (recognition) {
    speechSupported = true;

    recognition.onresult = function (e) {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = (e.results[i][0].transcript || '').trim();
        if (!transcript) continue;

        if (e.results[i].isFinal) {
          sttFinal += (sttFinal ? ' ' : '') + transcript;
        } else {
          interim += (interim ? ' ' : '') + transcript;
        }
      }

      sttInterim = interim.trim();

      // ✅ 입력창에 즉시 반영
      applySttToTextarea();

      // ✅ 상태 라벨은 짧게
      voiceStatus.textContent = sttInterim ? sttInterim : '듣는 중...';
    };

    recognition.onend = function () {
      // ✅ 종료 시: 최종 텍스트를 입력창에 "확정 반영"하고, 자동 전송은 하지 않음
      setVoiceUIListening(false);

      sttInterim = '';
      applySttToTextarea();

      if (sttFinal && sttFinal.trim()) {
        voiceStatus.textContent = '✅ 음성이 텍스트로 입력창에 반영되었습니다. (수정 후 전송 가능)';
        // 다음 음성 입력을 위해 버퍼는 초기화(입력창에는 남김)
        resetSttBuffer();
      } else {
        voiceStatus.textContent = '';
      }

      // UI 동기화
      syncQAUI();
    };

    recognition.onerror = function (e) {
      setVoiceUIListening(false);

      const msg =
        e.error === 'no-speech' ? '음성이 없습니다.' :
        e.error === 'not-allowed' ? '마이크 권한이 필요합니다. 브라우저 권한을 허용해 주세요.' :
        '음성 인식 오류. 다시 시도하세요.';

      voiceStatus.textContent = msg;
      resetSttBuffer();
      syncQAUI();
    };

    voiceBtn.addEventListener('click', function () {
      if (voiceBtn.disabled) return;

      // ✅ 음성 시작 시: 반드시 부모에 pause 요청
      notifyParentPause();

      if (isListening) {
        try { recognition.stop(); } catch (_) {}
        return;
      }

      // 질문 UI가 활성화되지 않은 상태(경계 케이스)면 우선 활성화
      if (!isQuestionEnabled()) setQuestionUIEnabled(true);

      // STT 시작
      resetSttBuffer();
      setVoiceUIListening(true);

      try { recognition.start(); } catch (_) {
        setVoiceUIListening(false);
        voiceStatus.textContent = '마이크를 사용할 수 없습니다.';
      }
    });

  } else {
    speechSupported = false;
    voiceBtn.disabled = true;
    voiceStatus.textContent = '이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome 권장)';
  }

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
})();
