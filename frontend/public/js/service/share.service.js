// /js/service/share.service.js
// ✅ 목표
// 1) 카톡공유 = "전체 답변"을 카카오톡으로 전송 시도 (objectType: "text")
// 2) 길이/정책 이슈로 실패하면: 요약 전송 + 전체는 클립보드 자동 복사(폴백)
//
// 사용: shareKakao({ question, answer, shareUrl, autoCopyFullText })

const KAKAO_FALLBACK_DESC_MAX = 900; // 폴백(요약)용
const KAKAO_TEXT_MAX_SAFE = 4000;    // 안전컷(환경에 따라 다를 수 있어 과도한 폭주 방지)

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
  return t.slice(0, maxLen - 3) + "...";
}

async function copyToClipboard(text) {
  const t = normalizeText(text);
  if (!t) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {}

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

async function sendFullTextShare({ fullText, url }) {
  // ✅ 카카오 텍스트 공유(가능하면 이게 가장 직관적으로 전체를 보냄)
  // - objectType: "text"
  // - text: 전송할 본문
  // - link: 필수
  window.Kakao.Share.sendDefault({
    objectType: "text",
    text: fullText,
    link: {
      webUrl: url,
      mobileWebUrl: url,
    },
    buttonTitle: "열기",
  });
}

async function sendFallbackFeed({ summary, url }) {
  // ✅ 폴백: feed 타입(요약) + 링크
  window.Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: "AIQOO Q&A",
      description: summary,
      imageUrl: "https://dummyimage.com/1200x630/111827/e5e7eb&text=AIQOO",
      link: {
        webUrl: url,
        mobileWebUrl: url,
      },
    },
    buttons: [
      {
        title: "전체 보기",
        link: {
          webUrl: url,
          mobileWebUrl: url,
        },
      },
    ],
  });
}

export async function shareKakao({ question, answer, shareUrl, autoCopyFullText = true }) {
  assertKakaoReady();

  const q = normalizeText(question);
  const a = normalizeText(answer);
  const url = shareUrl || window.location.href;

  const fullTextRaw = `❓ 질문\n${q}\n\n💡 답변\n${a}`;
  const fullText =
    fullTextRaw.length > KAKAO_TEXT_MAX_SAFE
      ? fullTextRaw.slice(0, KAKAO_TEXT_MAX_SAFE - 30) + "\n\n(이하 내용은 길이 제한으로 일부 생략됨)"
      : fullTextRaw;

  // ✅ 카카오 호출 전에(원하셨던 “전체 답변” 보장 목적) 클립보드 자동 복사도 같이
  let copied = false;
  if (autoCopyFullText) {
    copied = await copyToClipboard(fullTextRaw); // 원문 전체를 복사(가능하면)
  }

  // ✅ 1순위: 전체 텍스트 전송 시도
  try {
    await sendFullTextShare({ fullText, url });
    return { mode: "fullText", copied, fullText, summary: null };
  } catch (err) {
    console.warn("[shareKakao] fullText share failed -> fallback feed", err);
  }

  // ✅ 2순위: 폴백(요약 + 링크)
  const summary = makeSummary(fullTextRaw, KAKAO_FALLBACK_DESC_MAX);
  await sendFallbackFeed({ summary, url });

  return { mode: "fallback", copied, fullText, summary };
}
