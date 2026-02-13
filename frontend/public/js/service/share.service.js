/* share.service.js
 * - 카카오/메일 공유 전담
 * - named export: shareKakao, shareMail
 *
 * ✅ FIX:
 *  1) Kakao SDK 존재하면 init 보장 (data-kakao-key / localStorage)
 *  2) Kakao.Share.sendDefault 우선, 없으면 Kakao.Link.sendDefault 폴백
 *  3) 실패 시 "도메인 등록/키 종류" 등 원인 메시지 명확화
 */

function ensureText(text) {
  return String(text || "").trim();
}

function getKakaoKey() {
  // 우선순위: localStorage > body dataset
  const ls = (localStorage.getItem("AIQOO_KAKAO_KEY") || "").trim();
  if (ls) return ls;

  const ds = (document.body?.dataset?.kakaoKey || "").trim();
  if (ds) return ds;

  return "";
}

async function copyToClipboard(text) {
  const t = ensureText(text);
  if (!t) return false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
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

function ensureKakaoInitialized() {
  const Kakao = window.Kakao;
  if (!Kakao) return { ok: false, reason: "no_sdk" };

  const key = getKakaoKey();
  if (!key) return { ok: false, reason: "no_key" };

  try {
    if (typeof Kakao.isInitialized === "function") {
      if (!Kakao.isInitialized()) Kakao.init(key);
    } else if (typeof Kakao.init === "function") {
      // 구버전 대비
      Kakao.init(key);
    }
  } catch (e) {
    console.error("[share] Kakao.init failed:", e);
    return { ok: false, reason: "init_failed", error: e };
  }

  return { ok: true };
}

/**
 * 카카오 공유
 * @param {string} answerText
 * @param {object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.url]
 * @param {string} [opts.imageUrl] (https 권장)
 */
export async function shareKakao(answerText, opts = {}) {
  const text = ensureText(answerText);
  if (!text) return;

  const title = opts.title || "AIQOO 답변 공유";
  const url = opts.url || window.location.href;

  // 1) Kakao SDK/키/init 보장
  const init = ensureKakaoInitialized();
  if (!init.ok) {
    const ok = await copyToClipboard(`${title}\n\n${text}\n\n${url}`);

    if (init.reason === "no_sdk") {
      alert(
        "카카오 SDK가 로드되지 않았습니다.\n" +
          "qa.html에 Kakao SDK 스크립트가 포함되어 있는지 확인해 주세요.\n\n" +
          "지금은 내용이 클립보드에 복사되었습니다."
      );
      return;
    }
    if (init.reason === "no_key") {
      alert(
        "카카오 공유를 사용하려면 'JavaScript 키'가 필요합니다.\n\n" +
          "해결:\n" +
          "- qa.html <body data-kakao-key=\"JS키\"> 설정\n" +
          "또는\n" +
          "- localStorage.setItem('AIQOO_KAKAO_KEY','JS키')\n\n" +
          "지금은 내용이 클립보드에 복사되었습니다."
      );
      return;
    }
    if (init.reason === "init_failed") {
      alert(
        "Kakao.init() 실패.\n" +
          "대부분 아래 중 하나입니다:\n" +
          "1) REST 키를 넣음(❌) → JavaScript 키(✅) 사용\n" +
          "2) 카카오 개발자 콘솔에 현재 도메인(Web) 미등록\n\n" +
          "지금은 내용이 클립보드에 복사되었습니다."
      );
      return;
    }

    if (ok) alert("카카오 공유를 사용할 수 없어 내용이 클립보드에 복사되었습니다.");
    else alert("카카오 공유 불가 + 클립보드 복사도 실패했습니다.");
    return;
  }

  const Kakao = window.Kakao;

  // 2) Share API 우선 / Link API 폴백
  const imageUrl =
    opts.imageUrl ||
    // 운영에서는 800x400 이상 HTTPS 이미지 권장
    `${window.location.origin}/favicon.ico`;

  const payload = {
    objectType: "feed",
    content: {
      title,
      description: text.length > 180 ? text.slice(0, 180) + "…" : text,
      imageUrl,
      link: { mobileWebUrl: url, webUrl: url },
    },
    buttons: [
      {
        title: "페이지 열기",
        link: { mobileWebUrl: url, webUrl: url },
      },
    ],
  };

  try {
    if (Kakao.Share && typeof Kakao.Share.sendDefault === "function") {
      Kakao.Share.sendDefault(payload);
      return;
    }
    if (Kakao.Link && typeof Kakao.Link.sendDefault === "function") {
      Kakao.Link.sendDefault(payload);
      return;
    }

    // 둘 다 없으면 폴백
    const ok = await copyToClipboard(`${title}\n\n${text}\n\n${url}`);
    if (ok) {
      alert(
        "카카오 공유 API(Share/Link)를 찾지 못했습니다.\n" +
          "SDK 버전/로딩을 확인해 주세요.\n\n" +
          "지금은 내용이 클립보드에 복사되었습니다."
      );
    } else {
      alert("카카오 공유 API를 사용할 수 없습니다. (클립보드 복사도 실패)");
    }
  } catch (err) {
    console.error("[share] Kakao sendDefault error:", err);

    // 가장 흔한 원인: 도메인 미등록/HTTPS/권한
    const ok = await copyToClipboard(`${title}\n\n${text}\n\n${url}`);
    alert(
      "카카오 공유 중 오류가 발생했습니다.\n\n" +
        "체크리스트:\n" +
        "1) 카카오 개발자 콘솔 > 플랫폼 > Web 에 현재 도메인 등록\n" +
        "2) JavaScript 키 사용(REST 키 X)\n" +
        "3) HTTPS 도메인 권장(특히 운영)\n\n" +
        (ok ? "지금은 내용이 클립보드에 복사되었습니다." : "클립보드 복사도 실패했습니다.")
    );
  }
}

export function shareMail(answerText, opts = {}) {
  const text = ensureText(answerText);
  if (!text) return;

  const subject = opts.subject || "AIQOO 답변 공유";
  const to = opts.to || "";
  const url = window.location.href;

  const body = `${text}\n\n---\n공유 링크: ${url}`;
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.location.href = mailto;
}

export default { shareKakao, shareMail };
