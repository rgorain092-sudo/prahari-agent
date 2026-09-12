// Serverless function (Vercel). Gemini 3.8 Flash with LIVE WEB SEARCH.
// Fixes the 'type' parameter error by using the correct tool format.

const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Gemini 3.8 Flash supports only these thinking levels.
const THINKING_LEVELS = {
  deep: 'high',
  normal: 'medium',
  fast: 'low',
};

const MAX_BODY_BYTES = 1024 * 200;

export const config = {
  maxDuration: 60,
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { messages, system, mode } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '`messages` must be a non-empty array' });
  }

  const contents = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return res.status(400).json({ error: 'No valid messages to send' });
  }

  const thinkingLevel = THINKING_LEVELS[mode] || THINKING_LEVELS.normal;

  // ⚠️ KEY FIX: The format for the google_search tool.
  // The correct format is: tools: [{ google_search: {} }]
  // This enables live web search grounding.
  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel },
    },
    tools: [{ google_search: {} }],
  };

  if (typeof system === 'string' && system.trim()) {
    payload.system_instruction = { parts: [{ text: system }] };
  }

  let upstream;
  try {
    upstream = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: req.signal,
      }
    );
  } catch (err) {
    if (err.name === 'AbortError') return;
    return res.status(502).json({ error: `Upstream fetch failed: ${err.message}` });
  }

  if (!upstream.ok || !upstream.body) {
    const errData = await upstream.json().catch(() => ({}));
    return res.status(upstream.status || 502).json({
      error: errData?.error?.message || 'Gemini API error',
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const onClose = () => upstream.body.cancel().catch(() => {});
  req.on('close', onClose);

  try {
    for await (const chunk of upstream.body) {
      if (res.writableEnded) break;
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Stream relay error:', err);
  } finally {
    req.off('close', onClose);
    if (!res.writableEnded) res.end();
  }
};
