// Serverless function (Vercel). Uses Groq for the actual answer, and
// optionally Tavily (a free web-search API) to fetch live results first
// so answers can be grounded in current information.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(500).json({ error: 'Server is missing GROQ_API_KEY. Add it in your hosting dashboard under Environment Variables.' });
    return;
  }

  try {
    const { messages, system, mode, search, maxTokens } = req.body;

    let effectiveSystem = system;

    // Optional live web search step (Tavily) before answering
    if (search && process.env.TAVILY_API_KEY) {
      const lastUserMsg = [...(messages || [])].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        try {
          const tavilyRes = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: process.env.TAVILY_API_KEY,
              query: lastUserMsg.content,
              search_depth: 'basic',
              max_results: 6,
              topic: 'news'
            })
          });
          if (tavilyRes.ok) {
            const tavilyData = await tavilyRes.json();
            const results = tavilyData.results || [];
            if (results.length) {
              const searchContext = results
                .map((r, i) => `${i + 1}. ${r.title} — ${(r.content || '').slice(0, 350)} (Source: ${r.url})`)
                .join('\n\n');
              effectiveSystem = `${system}\n\nLIVE WEB SEARCH RESULTS (use these for anything current/factual; cite sources briefly where relevant):\n\n${searchContext}`;
            }
          }
        } catch (searchErr) {
          // Search failing shouldn't block the answer — just proceed without it
        }
      }
    }

    const model = mode === 'deep' ? 'openai/gpt-oss-120b' : 'openai/gpt-oss-20b';

    const chatMessages = [
      { role: 'system', content: effectiveSystem },
      ...(messages || []).map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        stream: true,
        max_tokens: maxTokens || 8192
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      res.status(response.status).json({ error: errData.error?.message || 'Groq API error' });
      return;
    }

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
  
