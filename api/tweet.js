const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');

// Simple in-memory rate limiter (resets per cold start — good enough for personal use)
const attempts = new Map();

function rateCheck(ip) {
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 min
  const max = 10;
  const entry = attempts.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) { attempts.set(ip, { count: 1, start: now }); return true; }
  if (entry.count >= max) return false;
  entry.count++;
  attempts.set(ip, entry);
  return true;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
}

function decrypt(text, secret) {
  try {
    const key = crypto.scryptSync(secret, 'pf_salt_v1', 32);
    const [ivHex, encHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function getSession(req) {
  const { SESSION_SECRET } = process.env;
  if (!SESSION_SECRET) return null;
  const cookies = parseCookies(req);
  const raw = cookies['pf_session'];
  if (!raw) return null;
  const decrypted = decrypt(raw, SESSION_SECRET);
  if (!decrypted) return null;
  try { return JSON.parse(decrypted); } catch { return null; }
}

module.exports = async function handler(req, res) {
  // CORS — allow same Vercel domain + localhost dev
  const origin = req.headers.origin || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') || origin === '';
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { TWITTER_API_KEY, TWITTER_API_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
    return res.status(500).json({ error: 'Server not configured. Set TWITTER_API_KEY and TWITTER_API_SECRET env vars.' });
  }

  // GET: health check + session status
  if (req.method === 'GET') {
    const session = getSession(req);
    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString(),
      version: '3.0.0',
      host: 'vercel',
      authenticated: !!session,
      screenName: session?.screenName || null,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!rateCheck(ip)) return res.status(429).json({ error: 'Too many requests — wait 15 minutes before posting again.' });

  // Auth: must be signed in via OAuth
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in. Connect your X account first.' });

  const { text } = req.body || {};

  // Validate text
  if (!text || typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Post text is required.' });
  const trimmed = text.trim();
  if (trimmed.length > 280) return res.status(400).json({ error: `Post too long (${trimmed.length} chars). Max 280.` });

  try {
    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: session.accessToken,
      accessSecret: session.accessSecret,
    });
    const { data } = await client.readWrite.v2.tweet(trimmed);
    console.log(`[PostFlow] Tweet posted by @${session.screenName} — ID: ${data.id}`);
    return res.status(200).json({ success: true, tweetId: data.id, tweetUrl: `https://x.com/i/web/status/${data.id}` });
  } catch (err) {
    console.error('[PostFlow] X API error:', err?.data || err.message);
    const xError = err?.data?.detail || err?.data?.title || err?.errors?.[0]?.message;
    const status = err?.code === 403 ? 403 : err?.code === 401 ? 401 : 500;
    return res.status(status).json({ error: xError || err.message || 'Failed to post to X.' });
  }
};
