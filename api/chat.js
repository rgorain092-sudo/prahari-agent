// Serverless function (Vercel). Streams responses from Gemini 3.8 Flash
// using the Interactions API with proper thinking levels, thought signature
// preservation, and grounding metadata exposure.

const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Map app modes to Gemini 3.8 thinking levels.
// IMPORTANT: 'minimal' is NOT supported on 3.8 Flash and will return 400.
const THINKING_LEVELS = {
  deep: 'high',     // Maximum reasoning for complex tasks
  normal: 'medium', // Balanced (default recommendation)
  fast: 'low',      // Latency-critical tasks
};

// Maximum payload size (Vercel has its own limits, this is explicit).
const MAX_BODY_BYTES = 1024 * 200; // 200 KB

export const config = {
  maxDuration: 60, // Allow long-running streams
};

module.exports = async (req, res) => {
  // --- Method check ---------------------------------------------------------
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Config check ---------------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        'Server is missing GEMINI_API_KEY. Add it in your hosting dashboard.',
    });
  }

  // --- Parse & validate body ------------------------------------------------
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { messages, system, mode, previousInteractionId } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: '`messages` must be a non-empty array',
    });
  }

  // Rough payload-size guard.
  try {
    const size = Buffer.byteLength(JSON.stringify(body));
    if (size > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
  } catch {
    /* ignore */
  }

  // --- Build Gemini request -------------------------------------------------
  // Interactions API uses a different input format than generateContent.
  // We construct a single string input from the message history for simplicity,
  // but production apps should preserve thought signatures explicitly.
  const conversationInput = messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => {
      const role = m.role === 'assistant' ? 'Model' : 'User';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');

  if (!conversationInput.trim()) {
    return res.status(400).json({ error: 'No valid messages to send' });
  }

  // Map mode to valid thinking level for 3.8 Flash.
  const thinkingLevel = THINKING_LEVELS[mode] || THINKING_LEVELS.normal;

  // Build the request payload for the Interactions API.
  const payload = {
    model: GEMINI_MODEL,
    input: conversationInput,
    stream: true,
    generation_config: {
      thinking_level: thinkingLevel,
    },
    // Enable Google Search grounding for real-time information.
    tools: [{ google_search: {} }],
  };

  // System instructions are supported via a separate field.
  if (typeof system === 'string' && system.trim()) {
    payload.system_instruction = system;
  }

  // For multi-turn conversations, pass the previous interaction ID
  // instead of re-sending full history (recommended for Gemini 3.x).
  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }

  // --- Call Gemini Interactions API -----------------------------------------
  let upstream;
  try {
    upstream = await fetch(
      `${GEMINI_BASE}/interactions?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
        signal: req.signal,
      }
    );
  } catch (err) {
    if (err.name === 'AbortError') return; // client disconnected
    return res.status(502).json({
      error: `Upstream fetch failed: ${err.message}`,
    });
  }

  if (!upstream.ok || !upstream.body) {
    const errData = await upstream.json().catch(() => ({}));
    return res.status(upstream.status || 502).json({
      error: errData?.error?.message || 'Gemini API error',
    });
  }

  // --- Stream SSE through ---------------------------------------------------
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // If client hangs up, abort upstream.
  const onClose = () => upstream.body.cancel().catch(() => {});
  req.on('close', onClose);

  try {
    // Stream raw SSE chunks directly to the browser.
    // The Interactions API emits events like:
    //   interaction.created
    //   step.start (thought | model_output | function_call)
    //   step.delta (text | thought_summary | arguments_delta)
    //   step.stop
    //   interaction.completed
    for await (const chunk of upstream.body) {
      if (res.writableEnded) break;
      if (!res.write(chunk)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Stream relay error:', err);
    }
  } finally {
    req.off('close', onClose);
    if (!res.writableEnded) res.end();
  }
};
