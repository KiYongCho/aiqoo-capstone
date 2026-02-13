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

// 카카오 텍스트는 길면 잘리거나 실패할 수 있어 보수적으로 컷
function safeText(s, maxLen = 600) {
  const t = String(s ?? "");
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
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

  const title = "AIQOO 답변 공유";

  // ✅ 핵심: 링크를 텍스트 최상단에 고정(잘려도 링크가 남도록)
  const A_SNIPPET = 160;
  const description =
    (q ? `Q: ${q}\n` : "") +
    (a ? `A: ${a.slice(0, A_SNIPPET)}${a.length > A_SNIPPET ? "…" : ""}` : "");

  const messageText = safeText(
    `${title}\n` +
    `전체보기 링크: ${url}\n\n` +
    `${description}`,
    600
  );

  // ✅ 클립보드에는 항상 "전체 답변 + 링크"
  const fullTextRaw =
`❓ 질문
${q}

답변
${a}

전체보기 링크: ${url}`;

  let copied = false;
  if (autoCopyFullText) {
    try {
      await navigator.clipboard.writeText(fullTextRaw);
      copied = true;
    } catch {
      copied = false;
    }
  }

  try {
    window.Kakao.Share.sendDefault({
      objectType: "text",
      text: messageText,
      link: {
        mobileWebUrl: url,
        webUrl: url,
      },
      buttons: [
        {
          title: "전체보기",
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
