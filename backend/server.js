require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');          // ✅ 추가
const OpenAI = require('openai');

const app = express();
const PORT = 3000;

// ================================
// 1) Static: public을 웹 루트(/)로 서빙
//    => /index.html, /html/qa.html, /css/*, /js/* 모두 동작
// ================================
//app.use(express.static(path.join(__dirname, 'public')));

// (권장) 루트 접속 시 index.html 반환
//app.get('/', (req, res) => {
//  res.sendFile(path.join(__dirname, 'public', 'index.html'));
//});

// ================================
// 2) CORS / Body Parser
// ================================
const corsOptions = {
  origin: true, // 로컬 PoC: 모든 origin 허용 (운영에서는 명시적으로 제한 권장)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ================================
// 3) OpenAI Client
// ================================
const apiKey = process.env.OPENAI_API_KEY || process.env.openai_api_key;
if (!apiKey) {
  console.warn('경고: OPENAI_API_KEY(또는 openai_api_key) 환경 변수가 설정되지 않았습니다.');
}
const openai = apiKey ? new OpenAI({ apiKey }) : null;

// ================================
// 4) OPTIONS / 디버그 GET
// ================================
app.options('/api/answer', (req, res) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.sendStatus(204);
});

app.get('/api/answer', (req, res) => {
  res.json({ ok: true, message: 'Q&A API 서버입니다. 질문은 POST로 보내세요.' });
});

// ================================
// 5) POST /api/answer
//    - 기본: JSON 응답 { answer }
//    - (옵션) 요청 헤더 Accept: text/event-stream 이면 SSE 스트리밍 응답
//      => qa.js에서 SSE 파싱하는 버전과 호환
// ================================
app.post('/api/answer', async (req, res) => {
  const { question } = req.body || {};
  const q = typeof question === 'string' ? question.trim() : '';

  console.log('[API] POST /api/answer, question 길이:', q.length);

  if (!q) return res.status(400).json({ error: 'question 필드가 필요합니다.' });
  if (!openai) return res.status(503).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });

  // SSE 요청인지 판별
  const wantsSSE = (req.headers.accept || '').includes('text/event-stream');

  try {
    if (!wantsSSE) {
      // ---------- JSON 모드 ----------
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 강의 도우미입니다. 수강생의 질문에 친절하고 정확하게 답변하세요. 답변은 한국어로 작성하세요.'
          },
          { role: 'user', content: q }
        ],
        max_tokens: 1024
      });

      const answer = completion.choices[0]?.message?.content?.trim() || '';
      if (!answer) return res.status(502).json({ error: 'LLM이 빈 답변을 반환했습니다. 다시 시도해 주세요.' });

      console.log('[API] 답변 생성 완료(JSON), 길이:', answer.length);
      return res.json({ answer });
    }

    // ---------- SSE 스트리밍 모드 ----------
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // (선택) context 이벤트: 지금은 자막 스니펫 기능 없으니 빈 값으로 전송
    res.write(`event: context\ndata: ${JSON.stringify({ captionSnippet: '' })}\n\n`);

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        {
          role: 'system',
          content: '당신은 강의 도우미입니다. 수강생의 질문에 친절하고 정확하게 답변하세요. 답변은 한국어로 작성하세요.'
        },
        { role: 'user', content: q }
      ],
      max_tokens: 1024
    });

    for await (const chunk of stream) {
      const token = chunk.choices?.[0]?.delta?.content || '';
      if (token) {
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      }
    }

    res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('OpenAI API 오류:', err);

    let message = err.message || 'LLM 요청 실패';
    if (err.status === 401) message = 'API 키가 잘못되었거나 만료되었습니다. 키를 확인하세요.';
    else if (err.status === 429) message = '요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    else if (err.error?.message) message = err.error.message;
    else if (err.response?.data?.error?.message) message = err.response.data.error.message;

    // SSE면 SSE로 에러 전송, 아니면 JSON
    const wantsSSE2 = (req.headers.accept || '').includes('text/event-stream');
    if (wantsSSE2) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        return res.end();
      } catch (_) {}
    }
    return res.status(err.status || 500).json({ error: message });
  }
});

// ================================
// 6) Listen
// ================================
app.listen(PORT, () => {
  console.log(`서버: http://localhost:${PORT}`);
  console.log(`정적: public/ → / (예: /index.html, /html/qa.html)`);
  console.log(`API 키: ${apiKey ? '설정됨' : '미설정'}`);
});
