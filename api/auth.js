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
    return res.status(500).json({
      error: 'Server not configured.',
      hint: 'Add TWITTER_API_KEY and TWITTER_API_SECRET in Vercel → Settings → Environment Variables, then redeploy.'
    });
  }

  try {
    const client = new TwitterApi({ appKey: TWITTER_API_KEY, appSecret: TWITTER_API_SECRET });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${proto}://${host}/api/callback`;

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(callbackUrl, { linkMode: 'authorize' });

    res.setHeader('Set-Cookie', [
      `pf_req_secret=${oauth_token_secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      `pf_req_token=${oauth_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    ]);

    return res.redirect(302, url);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    const code = (err && err.code) ? String(err.code) : null;
    const data = (err && err.data) ? JSON.stringify(err.data) : null;
    console.error('[PostFlow] Auth error: ' + msg + ' code=' + code + ' data=' + data);
    return res.status(500).json({
      error: msg || 'Failed to start OAuth flow.',
      code,
      hint: 'Check that TWITTER_API_KEY and TWITTER_API_SECRET are set in Vercel Environment Variables and that your X app callback URL is set to https://flow-state-x.vercel.app/api/callback'
    });
  }
};
