/**
 * backend/server.js (FINAL)
 * - Render 배포용
 * - /api/answer : 강의 Q&A 답변 생성
 * - /api/stt    : Whisper 계열 STT (Audio Transcriptions)  ✅ 확장자 문제 해결(toFile 사용)
 *
 * 필요 환경변수(Render):
 * - OPENAI_API_KEY=sk-...
 * - (옵션) ANSWER_MODEL=gpt-4o-mini
 * - (옵션) STT_MODEL=gpt-4o-mini-transcribe   (또는 gpt-4o-transcribe / whisper-1)
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = require("openai"); // ✅ 중요: filename(확장자) 보존

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// CORS / JSON
// =========================
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "2mb" }));

// =========================
// OpenAI Client
// =========================
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) console.warn("[WARN] OPENAI_API_KEY is missing");
const openai = new OpenAI({ apiKey });

// =========================
// Multer (STT 업로드)
// =========================
const upload = multer({
  dest: path.join(__dirname, "tmp"),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

// =========================
// Health
// =========================
app.get("/", (req, res) => {
  res.json({ ok: true, message: "AIQA backend is running" });
});

// =====================================================
// /api/answer
// - 프론트(qa.js)가 호출하는 답변 API
// - MVP: 질문 + (영상 메타) 를 받아서 LLM 답변 반환
// =====================================================
app.post("/api/answer", async (req, res) => {
  try {
    const {
      question,
      videoKey = "default",
      videoUrl = "",
      provider = "native",
      youtubeId = "",
      t = 0,
      tLabel = "00:00",
    } = req.body || {};

    const q = String(question || "").trim();
    if (!q) return res.status(400).json({ error: "question is required" });

    const model = process.env.ANSWER_MODEL || "gpt-4o-mini";

    // ✅ 강의/시간 맥락을 함께 전달(서버에 RAG 붙일 때 여기에 컨텍스트 삽입)
    const system = [
      "당신은 강의 시청 중 학습자의 질문에 답하는 AI 튜터입니다.",
      "답변은 한국어로, 핵심부터 명확하게 설명하고 필요하면 예시를 포함하세요.",
      "근거가 부족하면 가정/추정을 명시하세요.",
    ].join("\n");

    const user = [
      `질문: ${q}`,
      "",
      `[컨텍스트]`,
      `- videoKey: ${videoKey}`,
      `- provider: ${provider}`,
      `- youtubeId: ${youtubeId}`,
      `- videoUrl: ${videoUrl}`,
      `- time: ${tLabel} (${Number(t || 0).toFixed(1)}s)`,
    ].join("\n");

    // Responses API 사용(최신 SDK)
    const r = await openai.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    // SDK 버전/응답형태 차이를 흡수
    const answer =
      (typeof r.output_text === "string" && r.output_text) ||
      (r.output && Array.isArray(r.output)
        ? r.output
            .flatMap((o) => o.content || [])
            .map((c) => c.text || "")
            .join("")
        : "") ||
      "";

    if (!answer.trim()) {
      return res.status(500).json({ error: "LLM returned empty answer" });
    }

    return res.json({ answer });
  } catch (err) {
    console.error("[/api/answer] error:", err);
    return res.status(500).json({ error: err?.message || "answer failed" });
  }
});

// =====================================================
// /api/stt
// - multipart/form-data 로 audio 업로드
// - OpenAI Audio Transcriptions 호출
// - ❗ 400 Unsupported file format 해결:
//   multer tmp 파일(확장자 없음)을 그대로 올리지 않고,
//   toFile(stream, originalname)로 filename(확장자) 강제
// =====================================================
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  const file = req.file;

  try {
    if (!file) return res.status(400).json({ error: "audio file is required" });

    const model = process.env.STT_MODEL || "gpt-4o-mini-transcribe";

    // ✅ 원본 파일명(예: speech.webm / speech.ogg)을 filename으로 강제
    const filename = file.originalname || "speech.webm";

    const audioFile = await toFile(fs.createReadStream(file.path), filename);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model,
      // language: "ko", // 고정하고 싶으면 주석 해제
    });

    const text = transcription?.text ? String(transcription.text) : "";
    return res.json({ text });
  } catch (err) {
    console.error("[/api/stt] error:", err);
    // OpenAI에서 내려준 400/지원형식 메시지를 그대로 노출(디버깅에 유리)
    return res.status(500).json({ error: err?.message || "stt failed" });
  } finally {
    // tmp 파일 삭제
    if (file?.path) fs.unlink(file.path, () => {});
  }
});

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
});
