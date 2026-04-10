const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
}

function encrypt(text, secret) {
  const key = crypto.scryptSync(secret, 'pf_salt_v1', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

module.exports = async function handler(req, res) {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, SESSION_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !SESSION_SECRET) {
    return res.status(500).send('Server misconfigured. Check Vercel env vars.');
  }

  const { oauth_token: verifierToken, oauth_verifier } = req.query;
  if (!verifierToken || !oauth_verifier) {
    return res.status(400).send('Missing OAuth parameters. Please try connecting again.');
  }

  const cookies = parseCookies(req);
  const storedSecret = cookies['pf_req_secret'];
  const storedToken = cookies['pf_req_token'];

  if (!storedSecret || !storedToken || storedToken !== verifierToken) {
    return res.status(400).send('Session mismatch or expired. Please try connecting again.');
  }

  try {
    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: verifierToken,
      accessSecret: storedSecret,
    });

    const { accessToken, accessSecret, screenName, userId } = await client.login(oauth_verifier);

    // Encrypt session data before storing in cookie
    const sessionData = JSON.stringify({ accessToken, accessSecret, screenName, userId });
    const encrypted = encrypt(sessionData, SESSION_SECRET);

    // Store encrypted session, clear temp OAuth cookies
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    res.setHeader('Set-Cookie', [
      `pf_session=${encodeURIComponent(encrypted)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
      `pf_req_secret=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      `pf_req_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    ]);

    // Redirect back to app with success indicator
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return res.redirect(302, `${proto}://${host}/?connected=1&user=${encodeURIComponent(screenName)}`);
  } catch (err) {
    console.error('[PostFlow] Callback error:', err);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return res.redirect(302, `${proto}://${host}/?error=auth_failed`);
  }
};
