/**
 * backend/server.js
 * - Render 배포용
 * - /api/answer : 기존 LLM 답변
 * - /api/stt    : Whisper(STT) 업그레이드 버전 (Audio Transcriptions)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// CORS
// =========================
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// JSON (answer용)
app.use(express.json({ limit: "2mb" }));

// =========================
// OpenAI
// =========================
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn("[WARN] OPENAI_API_KEY is missing");
}
const openai = new OpenAI({ apiKey });

// =========================
// Multer (STT 업로드)
// =========================
const upload = multer({
  dest: path.join(__dirname, "tmp"),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (필요시 조정)
  },
});

// =========================
// Health
// =========================
app.get("/", (req, res) => {
  res.json({ ok: true, message: "AIQA backend is running" });
});

// =====================================================
// (기존) /api/answer
// - 리얼쵸키님 기존 구현이 있으면 그대로 유지하세요.
// =====================================================
app.post("/api/answer", async (req, res) => {
  try {
    const { question, videoKey, videoUrl, provider, youtubeId, t, tLabel } = req.body || {};
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: "question is required" });
    }

    // ✅ 기존 로직이 있다면 그걸로 교체하세요.
    // 여기서는 데모 응답
    return res.json({
      answer:
        `질문을 받았습니다.\n` +
        `- question: ${question}\n` +
        `- tLabel: ${tLabel ?? ""}\n` +
        `- provider: ${provider ?? ""}\n` +
        `(여기 /api/answer는 기존 코드로 유지하세요)`,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "server error" });
  }
});

// =====================================================
// ✅ NEW: /api/stt
// - multipart/form-data 로 audio 파일 업로드
// - OpenAI Audio Transcriptions 호출
// =====================================================
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  const file = req.file;

  try {
    if (!file) {
      return res.status(400).json({ error: "audio file is required" });
    }

    // ✅ 모델 선택 (품질 우선)
    // - whisper-1 (구형)
    // - gpt-4o-mini-transcribe (고품질/가성비) :contentReference[oaicite:1]{index=1}
    // - gpt-4o-transcribe (더 고품질) :contentReference[oaicite:2]{index=2}
    const model = process.env.STT_MODEL || "gpt-4o-mini-transcribe";

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(file.path),
      model,
      // language: "ko", // 한국어 고정하고 싶으면 사용(환경에 따라 도움)
      // response_format: "json",
    });

    // SDK 반환 형태는 { text: "..." } 계열
    const text = (transcription && transcription.text) ? String(transcription.text) : "";

    if (!text.trim()) {
      return res.status(200).json({ text: "" });
    }

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "stt failed" });
  } finally {
    // 업로드 임시파일 정리
    if (file && file.path) {
      fs.unlink(file.path, () => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});
