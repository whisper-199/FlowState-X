const { TwitterApi } = require('twitter-api-v2');
module.exports = async function handler(req, res) {
  const { TWITTER_API_KEY, TWITTER_API_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET) return res.status(500).json({ error: 'Missing env vars.' });
  try {
    const client = new TwitterApi({ appKey: TWITTER_API_KEY, appSecret: TWITTER_API_SECRET });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(`${proto}://${host}/api/callback`, { linkMode: 'authorize' });
    res.setHeader('Set-Cookie', [
      `pf_req_secret=${encodeURIComponent(oauth_token_secret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
      `pf_req_token=${encodeURIComponent(oauth_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
    ]);
    return res.redirect(302, url);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
