const { TwitterApi } = require('twitter-api-v2');

module.exports = async function handler(req, res) {
  const { TWITTER_API_KEY, TWITTER_API_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
    return res.status(500).json({ error: 'Missing TWITTER_API_KEY or TWITTER_API_SECRET env vars.' });
  }

  try {
    const client = new TwitterApi({ appKey: TWITTER_API_KEY, appSecret: TWITTER_API_SECRET });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${proto}://${host}/api/callback`;

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(callbackUrl, { linkMode: 'authorize' });

    // Use separate cookies and also encode token in the redirect as backup
    res.setHeader('Set-Cookie', [
      `pf_req_secret=${encodeURIComponent(oauth_token_secret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
      `pf_req_token=${encodeURIComponent(oauth_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
    ]);

    return res.redirect(302, url);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    const code = (err && err.code) ? String(err.code) : null;
    const data = (err && err.data) ? JSON.stringify(err.data) : null;
    console.error('[PostFlow] Auth error: ' + msg + ' code=' + code + ' data=' + data);
    return res.status(500).json({ error: msg, code });
  }
};
