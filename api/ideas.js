module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, tone } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const { ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel env vars.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are an expert X (Twitter) content strategist. Generate 6 diverse post ideas about: "${topic}". Tone: ${tone || 'witty'}.
For each provide:
- "type": short label (Hot Take, Story, Question, Stat, Thread, Listicle, Poll, Unpopular Opinion)
- "text": ready-to-post text under 280 characters
Respond ONLY with a valid JSON array. No markdown, no backticks, no preamble.`
        }]
      })
    });
    const data = await response.json();
    const raw = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    const ideas = JSON.parse(raw);
    return res.status(200).json({ ideas });
  } catch (err) {
    console.error('[PostFlow] Ideas error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to generate ideas.' });
  }
};
