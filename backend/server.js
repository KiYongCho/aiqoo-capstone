/**
 * server.js (Render 배포용 / FINAL)
 * - /api/answer : OpenAI Responses API로 최신 모델 답변 생성 (기본 gpt-5.2)
 * - /api/stt    : Audio Transcriptions (기본 gpt-4o-transcribe)
 *
 * ENV:
 *  - OPENAI_API_KEY      (필수)
 *  - OPENAI_MODEL        (선택) 기본: gpt-5.2
 *  - OPENAI_STT_MODEL    (선택) 기본: gpt-4o-transcribe
 *  - ALLOWED_ORIGINS     (선택) 예: https://your-lecture-site.com,https://vercel.app
 *  - PORT                (선택) Render가 자동 주입
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// 환경변수 / 모델
// =========================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY가 설정되지 않았습니다.");
}

const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-5.2").trim();
const OPENAI_STT_MODEL = (process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe").trim();

// =========================
// OpenAI 클라이언트
// =========================
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// =========================
// CORS
// =========================
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

// =========================
// Multer (STT 업로드)
// =========================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// =========================
// Health check
// =========================
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "AIQOO API",
    model: OPENAI_MODEL,
    stt_model: OPENAI_STT_MODEL,
  });
});

// =========================
// /api/answer
// =========================
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

    // (선택) 컨텍스트를 system/user에 적절히 섞어서 품질 개선
    const sys = [
      "당신은 온라인 강의 시청 중 발생한 질문에 답하는 전문 튜터입니다.",
      "답변은 한국어로, 비전공자도 이해할 수 있게 설명하되 핵심은 정확하게 전달하세요.",
      "가능하면: (1) 요약 → (2) 쉬운 비유/예시 → (3) 실습/코드(필요 시) 순서로 답하세요.",
      "너무 장황하면 마지막에 3줄 요약을 추가하세요.",
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
      // (선택) 추론이 필요한 케이스에서만 높이면 비용/지연이 늘 수 있습니다.
      // reasoning: { effort: "medium" },
    });

    const answerText = (response && response.output_text) ? String(response.output_text).trim() : "";

    if (!answerText) {
      return res.status(502).json({ error: "LLM이 빈 답변을 반환했습니다." });
    }

    return res.json({ answer: answerText, model: OPENAI_MODEL });
  } catch (err) {
    console.error("❗ /api/answer error:", err);
    const msg =
      (err && err.message) ? err.message :
      "답변 생성 중 오류가 발생했습니다.";
    return res.status(500).json({ error: msg });
  }
});

// =========================
// /api/stt  (multipart/form-data: audio 파일)
// field name: audio
// =========================
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다." });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "audio 파일이 없습니다. (field name: audio)" });
    }

    // OpenAI SDK는 File 형태를 필요로 함 → buffer로 File 생성
    // Node 18+ 에서 global File 사용 가능. (Render 기본 런타임이 Node 18/20인 경우가 많음)
    const file = new File([req.file.buffer], req.file.originalname || "speech.webm", {
      type: req.file.mimetype || "audio/webm",
    });

    const tr = await client.audio.transcriptions.create({
      file,
      model: OPENAI_STT_MODEL,
      language: "ko",
      // (선택) 더 공격적으로/보수적으로 원하는 옵션이 있으면 추가 가능
      // prompt: "전사 품질을 높이기 위한 힌트 문장...",
    });

    const text = (tr && tr.text) ? String(tr.text).trim() : "";
    if (!text) return res.status(502).json({ error: "전사 결과가 비어 있습니다." });

    return res.json({ text, model: OPENAI_STT_MODEL });
  } catch (err) {
    console.error("❗ /api/stt error:", err);
    const msg =
      (err && err.message) ? err.message :
      "STT 처리 중 오류가 발생했습니다.";
    return res.status(500).json({ error: msg });
  }
});

// =========================
// 서버 시작
// =========================
app.listen(PORT, () => {
  console.log(`✅ AIQOO API listening on :${PORT}`);
  console.log(`✅ LLM model = ${OPENAI_MODEL}`);
  console.log(`✅ STT model = ${OPENAI_STT_MODEL}`);
  if (allowedOrigins) console.log(`✅ CORS allowlist = ${allowedOrigins.join(", ")}`);
  else console.log("✅ CORS = allow all origins (ALLOWED_ORIGINS not set)");
});
