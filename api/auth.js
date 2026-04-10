const { TwitterApi } = require('twitter-api-v2');

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') || origin === '';
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { TWITTER_API_KEY, TWITTER_API_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
    return res.status(500).json({ error: 'Server not configured. Set TWITTER_API_KEY and TWITTER_API_SECRET in Vercel env vars.' });
  }

  try {
    const client = new TwitterApi({ appKey: TWITTER_API_KEY, appSecret: TWITTER_API_SECRET });

    // Build the callback URL dynamically from the request host
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${proto}://${host}/api/callback`;

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(callbackUrl, { linkMode: 'authorize' });

    // Store the oauth_token_secret in a short-lived cookie so callback can use it
    res.setHeader('Set-Cookie', [
      `pf_req_secret=${oauth_token_secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      `pf_req_token=${oauth_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    ]);

    return res.redirect(302, url);
  } catch (err) {
    console.error('[PostFlow] Auth error:', err);
    return res.status(500).json({ error: err.message || 'Failed to start OAuth flow.' });
  }
};
