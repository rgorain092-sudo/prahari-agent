// Serverless function (Vercel). Uses Google Gemini's free-tier API.
// Your Gemini API key stays on the server — it never reaches the browser.
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
    const { messages, system } = req.body;

    // Convert Anthropic-style messages ({role, content}) to Gemini's format
    const contents = (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/"gemini-3.6-flash":generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';

    // Normalize to the same shape the frontend already expects
    res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};
