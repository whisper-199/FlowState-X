module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, tone } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  const prompt = `You are a world-class X (Twitter) content strategist. Generate 6 sharply distinct post ideas about: "${topic}". Tone: ${tone || 'witty'}.
Rules: under 260 chars each, punchy, scroll-stopping.
For each: "type" (Hot Take|Story|Question|Data Point|Thread Hook|Contrarian View), "text" (the tweet), "hook" (4-word reason it works).
Respond ONLY with a valid JSON array. No markdown, no backticks, no preamble.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1200 }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Gemini error');
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g,'').trim();
    return res.status(200).json({ ideas: JSON.parse(raw) });
  } catch (err) {
    console.error('[PostFlow] Ideas:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to generate ideas.' });
  }
};
