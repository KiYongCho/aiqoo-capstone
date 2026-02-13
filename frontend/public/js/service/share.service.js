// /js/service/share.service.js

function ensureKakaoReady() {
  if (!window.Kakao) throw new Error("Kakao SDK가 로드되지 않았습니다.");
  if (typeof window.Kakao.isInitialized === "function") {
    if (!window.Kakao.isInitialized()) {
      const key = (document.body?.dataset?.kakaoKey || "").trim();
      if (!key) throw new Error("Kakao key가 없습니다. (body[data-kakao-key])");
      window.Kakao.init(key);
    }
  }
}

function safeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return window.location.href;
  }
}

export async function shareKakao({
  question,
  answer,
  shareUrl,
  autoCopyFullText = true,
}) {
  ensureKakaoReady();

  const q = String(question || "").trim();
  const a = String(answer || "").trim();

  const url = safeUrl(shareUrl || window.location.href);

  // ✅ 카카오 링크는 텍스트 길이 제한이 있어서 요약 텍스트로 전송
  const title = "AIQOO 답변 공유";
  const description =
    (q ? `Q: ${q}\n` : "") +
    (a ? `A: ${a.slice(0, 220)}${a.length > 220 ? "…" : ""}` : "");

  // 요구사항 반영: UI의 답변 이모지(💡) 제거에 맞춰 공유 텍스트도 통일
  const fullTextRaw = `❓ 질문\n${q}\n\n답변\n${a}`;

  // ✅ 자동 복사 옵션 (카카오는 요약 전송 + 전체 문장을 클립보드에 복사)
  let copied = false;
  if (autoCopyFullText) {
    try {
      await navigator.clipboard.writeText(fullTextRaw);
      copied = true;
    } catch {
      copied = false;
    }
  }

  // ✅ Kakao 공유
  try {
    window.Kakao.Share.sendDefault({
      objectType: "text",
      text: `${title}\n\n${description}\n\n(전체 답변은 링크에서 확인하세요)`,
      link: {
        mobileWebUrl: url,
        webUrl: url,
      },
      buttons: [
        {
          title: "열기",
          link: {
            mobileWebUrl: url,
            webUrl: url,
          },
        },
      ],
    });
  } catch (e) {
    console.error("[shareKakao] sendDefault failed:", e);
    throw e;
  }

  return { copied };
}
