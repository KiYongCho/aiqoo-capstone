/**
 * server.js (Render 배포용 / FINAL)
 * - /api/answer : OpenAI Responses API로 최신 모델 답변 생성 (기본 gpt-5.2)
 * - /api/stt    : gpt-4o-transcribe 전사 + (옵션) gpt-5.2 정제
 *
 * ✅ ENV (Render Environment)
 *  - OPENAI_API_KEY             (필수)
 *
 *  - OPENAI_MODEL               (선택) 기본: gpt-5.2
 *
 *  - OPENAI_STT_MODEL           (선택) 기본: gpt-4o-transcribe
 *  - OPENAI_STT_CLEAN           (선택) on/off  기본: on
 *  - OPENAI_STT_CLEAN_MODEL     (선택) 기본: gpt-5.2
 *
 *  - ALLOWED_ORIGINS            (선택) 예: https://your-site.com,https://your-vercel.app
 *  - PORT                       (선택) Render가 자동 주입
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
 * ENV / 모델
 * ========================= */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY가 설정되지 않았습니다.");
}

const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.2").trim();

const OPENAI_STT_MODEL = (process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe").trim();
const OPENAI_STT_CLEAN_MODEL = (process.env.OPENAI_STT_CLEAN_MODEL || "gpt-5.2").trim();
const OPENAI_STT_CLEAN = (process.env.OPENAI_STT_CLEAN || "on").trim().toLowerCase(); // on/off

/* =========================
 * OpenAI 클라이언트
 * ========================= */
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

/* =========================
 * CORS
 * ========================= */
function parseAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();
  if (!raw) return null;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
const allowedOrigins = parseAllowedOrigins();

app.use(
  cors({
    origin: function (origin, cb) {
      // same-origin / server-to-server / curl
      if (!origin) return cb(null, true);

      // ALLOWED_ORIGINS 미설정이면 모든 origin 허용(개발 편의)
      if (!allowedOrigins) return cb(null, true);

      // 설정되어 있으면 화이트리스트만 허용
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

/* =========================
 * Multer (STT 업로드)
 * ========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

/* =========================
 * Health check
 * ========================= */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "AIQOO API",
    model: OPENAI_MODEL,
    stt_model: OPENAI_STT_MODEL,
    stt_clean: OPENAI_STT_CLEAN,
    stt_clean_model: OPENAI_STT_CLEAN_MODEL,
  });
});

/* =========================
 * /api/answer
 * ========================= */
app.post("/api/answer", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    const {
      question,
      videoKey,
      videoUrl,
      provider,
      youtubeId,
      t,
      tLabel
    } = req.body || {};

    const q = (question || "").toString().trim();
    if (!q) return res.status(400).json({ error: "question이 비어 있습니다." });

    const sys = [
      "당신은 온라인 강의 시청 중 발생한 질문에 답하는 전문 튜터입니다.",
      "답변은 한국어로, 비전공자도 이해할 수 있게 설명하되 핵심은 정확하게 전달하세요.",
      "가능하면: (1) 요약 → (2) 쉬운 비유/예시 → (3) 실습/코드(필요 시) 순서로 답하세요.",
      "너무 장황하면 마지막에 3줄 요약을 추가하세요.",
      "확신할 수 없는 내용은 추측하지 말고, 필요한 전제/가정이 무엇인지 명확히 말하세요."
    ].join("\n");

    const meta = {
      videoKey: videoKey || "default",
      videoUrl: videoUrl || "",
      provider: provider || "",
      youtubeId: youtubeId || "",
      t: Number.isFinite(Number(t)) ? Number(t) : 0,
      tLabel: tLabel || "",
    };

    const userInput = [
      "질문:",
      q,
      "",
      "컨텍스트(강의 메타):",
      JSON.stringify(meta, null, 2),
    ].join("\n");

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: sys },
        { role: "user", content: userInput }
      ],
      // 필요 시 조절:
      // reasoning: { effort: "medium" },
    });

    const answerText = (response && response.output_text) ? String(response.output_text).trim() : "";
    if (!answerText) {
      return res.status(502).json({ error: "LLM이 빈 답변을 반환했습니다." });
    }

    return res.json({ answer: answerText, model: OPENAI_MODEL });
  } catch (err) {
    console.error("❗ /api/answer error:", err);
    const msg = (err && err.message) ? err.message : "답변 생성 중 오류가 발생했습니다.";
    return res.status(500).json({ error: msg });
  }
});

/* =========================
 * /api/stt
 * - multipart/form-data: audio
 * - field name: audio
 * - 전사(gpt-4o-transcribe) + (옵션) 정제(gpt-5.2)
 * ========================= */
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "audio 파일이 없습니다. (field name: audio)" });
    }

    // buffer -> File
    // Node 18+ 에서 global File 사용 가능 (Render 런타임 Node 18/20 권장)
    const file = new File([req.file.buffer], req.file.originalname || "speech.webm", {
      type: req.file.mimetype || "audio/webm",
    });

    // 1) 전사
    const tr = await client.audio.transcriptions.create({
      file,
      model: OPENAI_STT_MODEL,
      language: "ko",
      // ✅ 기술 강의 최적화 힌트(효과 있음)
      prompt:
        "온라인 강의 음성 전사입니다. " +
        "프로그래밍/AI 용어(예: API, JSON, React, Spring, JPA, Whisper, Vercel, Render, GPT)를 정확히 유지하고, " +
        "영문 약어/모델명/코드 식별자(카멜케이스, 스네이크케이스)는 가능한 그대로 인식하세요. " +
        "불필요한 추측으로 단어를 바꾸지 마세요."
    });

    const rawText = (tr && tr.text) ? String(tr.text).trim() : "";
    if (!rawText) return res.status(502).json({ error: "전사 결과가 비어 있습니다." });

    // 정제 OFF면 그대로 반환
    if (OPENAI_STT_CLEAN !== "on") {
      return res.json({
        text: rawText,
        model: OPENAI_STT_MODEL,
        cleaned: false
      });
    }

    // 2) 정제(Post-processing)
    const cleanSys =
      "당신은 한국어 전사 텍스트 교정기입니다.\n" +
      "규칙:\n" +
      "1) 원문 의미를 절대 바꾸지 마세요.\n" +
      "2) 들리지 않은 내용을 지어내지 마세요.\n" +
      "3) 띄어쓰기/문장부호/오타만 교정하고 문장을 자연스럽게 다듬으세요.\n" +
      "4) 코드, 파일명, URL, 모델명(gpt-4o-transcribe 등), 기술용어(API/JSON 등), 영문 약어는 그대로 유지하세요.\n" +
      "5) 출력은 교정된 텍스트만 단독으로 내보내세요(설명/머리말/꼬리말 금지).";

    const cleanedResp = await client.responses.create({
      model: OPENAI_STT_CLEAN_MODEL,
      input: [
        { role: "system", content: cleanSys },
        { role: "user", content: rawText }
      ],
      // 정제는 과한 추론이 오히려 “의미 변경”을 유발할 수 있어 기본/낮게 권장
      // reasoning: { effort: "low" },
    });

    const cleanedText = (cleanedResp && cleanedResp.output_text)
      ? String(cleanedResp.output_text).trim()
      : "";

    // 정제가 실패/빈문자면 원문으로 fallback
    const finalText = cleanedText || rawText;

    return res.json({
      text: finalText,
      model: OPENAI_STT_MODEL,
      cleaned: true,
      clean_model: OPENAI_STT_CLEAN_MODEL
    });

  } catch (err) {
    console.error("❗ /api/stt error:", err);
    const msg = (err && err.message) ? err.message : "STT 처리 중 오류가 발생했습니다.";
    return res.status(500).json({ error: msg });
  }
});

/* =========================
 * 서버 시작
 * ========================= */
app.listen(PORT, () => {
  console.log(`✅ AIQOO API listening on :${PORT}`);
  console.log(`✅ LLM model = ${OPENAI_MODEL}`);
  console.log(`✅ STT model = ${OPENAI_STT_MODEL}`);
  console.log(`✅ STT clean = ${OPENAI_STT_CLEAN} (clean model = ${OPENAI_STT_CLEAN_MODEL})`);
  if (allowedOrigins) console.log(`✅ CORS allowlist = ${allowedOrigins.join(", ")}`);
  else console.log("✅ CORS = allow all origins (ALLOWED_ORIGINS not set)");
});
