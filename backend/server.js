/**
 * server.js (FINAL)
 * - Render 배포용
 * - OpenAI Responses API 대응 (sk-proj- 키)
 * - JSON 단발 응답
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

/* =====================================================
 * 기본 미들웨어
 * ===================================================== */
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

/* =====================================================
 * 정적 파일 서빙
 * public/ → /
 * ===================================================== */
app.use(express.static(path.join(__dirname, 'public')));

/* =====================================================
 * OpenAI 설정
 * ===================================================== */
const apiKey = process.env.OPENAI_API_KEY;

console.log('API 키:', apiKey ? '설정됨' : '미설정');

const openai = apiKey
  ? new OpenAI({ apiKey })
  : null;

/* =====================================================
 * 디버그: 키 상태 확인용 (운영 시 삭제 가능)
 * ===================================================== */
app.get('/api/debug/key', (req, res) => {
  const k = process.env.OPENAI_API_KEY || '';
  res.json({
    exists: !!k,
    prefix: k.slice(0, 7),
    length: k.length
  });
});

/* =====================================================
 * API: 질문 → 답변
 * ===================================================== */
app.post('/api/answer', async (req, res) => {
  const { question } = req.body || {};

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question 필드가 필요합니다.' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
  }

  try {
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: '당신은 온라인 강의 Q&A 도우미입니다. 질문에 대해 한국어로 친절하고 정확하게 설명하세요.'
        },
        {
          role: 'user',
          content: question.trim()
        }
      ],
      max_output_tokens: 800
    });

    // Responses API에서 텍스트 안전 추출
    let answer = '';
    if (response.output_text) {
      answer = response.output_text;
    } else if (
      response.output &&
      response.output[0] &&
      response.output[0].content &&
      response.output[0].content[0] &&
      response.output[0].content[0].text
    ) {
      answer = response.output[0].content[0].text;
    }

    if (!answer) {
      return res.status(502).json({
        error: 'LLM이 빈 답변을 반환했습니다.'
      });
    }

    return res.json({ answer });

  } catch (err) {
    console.error('[OpenAI ERROR]', err);

    let message = 'LLM 요청 실패';
    if (err.status === 401) message = 'OpenAI API 인증 실패 (키 확인 필요)';
    else if (err.status === 429) message = '요청 한도 초과';
    else if (err.message) message = err.message;

    return res.status(err.status || 500).json({ error: message });
  }
});

/* =====================================================
 * 기본 라우트 (index.html)
 * ===================================================== */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =====================================================
 * 서버 시작
 * ===================================================== */
app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
  console.log(`정적: public/ → / (예: /index.html, /html/qa.html)`);
});
