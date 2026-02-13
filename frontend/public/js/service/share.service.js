// /public/js/service/share.service.js
// - 카카오 공유: 길이 제한 대응(요약 전송)
// - 전체 문장은 자동으로 클립보드 복사(사용자가 카톡에 붙여넣기 가능)

const KAKAO_DESC_MAX = 900; // 보수적으로 900자 (환경에 따라 더 줄여도 됩니다)

function normalizeText(input) {
  return (input ?? "")
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function makeSummary(text, maxLen) {
  const t = normalizeText(text);
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen - 3)) + "...";
}

async function copyToClipboard(text) {
  const t = normalizeText(text);
  if (!t) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {
    // fallback
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

function assertKakaoReady() {
  if (!window.Kakao) throw new Error("Kakao SDK가 로드되지 않았습니다.");
  if (!window.Kakao.isInitialized?.()) throw new Error("Kakao SDK가 initialize되지 않았습니다.");
}

export async function shareKakao({ question, answer, shareUrl, autoCopyFullText = true }) {
  assertKakaoReady();

  const q = normalizeText(question);
  const a = normalizeText(answer);

  const fullText = `❓ 질문\n${q}\n\n💡 답변\n${a}`;
  const summaryCore = makeSummary(fullText, KAKAO_DESC_MAX);

  // 길면 안내 문구를 붙여 "왜 짤렸는지"를 카톡에서 바로 이해하게 처리
  const truncated = normalizeText(fullText).length > KAKAO_DESC_MAX;
  const summary = truncated
    ? `${summaryCore}\n\n(⚠️ 긴 답변은 카카오 길이 제한으로 요약 전송됩니다. 전체 문장은 자동 복사됨)`
    : summaryCore;

  let copied = false;
  if (autoCopyFullText) {
    copied = await copyToClipboard(fullText);
  }

  const url = shareUrl || window.location.href;

  // feed 타입이 브라우저에서 가장 안정적
  window.Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: "AIQOO Q&A",
      description: summary,
      // ⚠️ imageUrl이 필수인 환경이 있어 더미 이미지를 사용합니다.
      // 실제 서비스에서는 본인 도메인의 썸네일 URL로 교체 권장
      imageUrl: "https://dummyimage.com/1200x630/111827/e5e7eb&text=AIQOO",
      link: { webUrl: url, mobileWebUrl: url },
    },
    buttons: [
      {
        title: "전체 보기",
        link: { webUrl: url, mobileWebUrl: url },
      },
    ],
  });

  return { copied, summary, fullText, truncated };
}
