// Serverless function (Vercel). Streams responses from Google Gemini's
// free-tier API so answers appear as they're generated instead of all at once.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Add it in your hosting dashboard under Environment Variables.' });
    return;
  }

  try {
    const { messages, system, mode } = req.body;
    const thinkingLevel = mode === 'deep' ? 'medium' : 'minimal';

    const contents = (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?key=${process.env.GEMINI_API_KEY}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel }
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      res.status(response.status).json({ error: errData.error?.message || 'Gemini API error' });
      return;
    }

    // Stream Gemini's server-sent events straight through to the browser
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Unexpected server error' });
    } else {
      res.end();
    }
  }
};
