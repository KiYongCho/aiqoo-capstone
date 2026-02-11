/**
 * server.js (API ONLY)
 * - Render 배포용 (API 서버)
 * - OpenAI Responses API
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: 필요 최소한으로(운영 시 origin 제한 권장)
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// OpenAI
const apiKey = process.env.OPENAI_API_KEY;
console.log("API 키:", apiKey ? "설정됨" : "미설정");

// ✅ 권장: lazy init (키가 런타임에 바뀌어도 안전)
let openaiClient = null;
let cachedKey = null;

function getOpenAI() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) return null;
  if (!openaiClient || cachedKey !== k) {
    openaiClient = new OpenAI({ apiKey: k });
    cachedKey = k;
  }
  return openaiClient;
}

// Health / Info
app.get("/", (req, res) => {
  res.json({ ok: true, message: "AIQA Render API 서버입니다. POST /api/answer 로 질문을 보내세요." });
});

// Debug
app.get("/api/debug/key", (req, res) => {
  const k = process.env.OPENAI_API_KEY || "";
  res.json({
    exists: !!k,
    prefix: k.slice(0, 7),
    length: k.length
  });
});

// Answer API
app.post("/api/answer", async (req, res) => {
  const { question } = req.body || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question 필드가 필요합니다." });
  }

  const openai = getOpenAI();
  if (!openai) {
    return res.status(503).json({ error: "OpenAI API 키가 설정되지 않았습니다." });
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: "당신은 온라인 강의 Q&A 도우미입니다. 질문에 대해 한국어로 친절하고 정확하게 설명하세요." },
        { role: "user", content: question.trim() }
      ],
      max_output_tokens: 800
    });

    const answer =
      response.output_text ||
      response?.output?.[0]?.content?.[0]?.text ||
      "";

    if (!answer) {
      return res.status(502).json({ error: "LLM이 빈 답변을 반환했습니다." });
    }

    return res.json({ answer });
  } catch (err) {
    console.error("[OpenAI ERROR]", err);

    let message = "LLM 요청 실패";
    if (err.status === 401) message = "OpenAI API 인증 실패 (키 확인 필요)";
    else if (err.status === 429) message = "요청 한도 초과";
    else if (err.message) message = err.message;

    return res.status(err.status || 500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
