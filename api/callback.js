const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k,...v]=c.trim().split('=');
    try{return[k.trim(),decodeURIComponent(v.join('='))]}catch{return[k.trim(),v.join('=')]}
  }));
}
function encrypt(text, secret) {
  const key=crypto.scryptSync(secret,'pf_salt_v1',32);
  const iv=crypto.randomBytes(16);
  const cipher=crypto.createCipheriv('aes-256-cbc',key,iv);
  return iv.toString('hex')+':'+Buffer.concat([cipher.update(text,'utf8'),cipher.final()]).toString('hex');
}
module.exports = async function handler(req, res) {
  const {TWITTER_API_KEY,TWITTER_API_SECRET,SESSION_SECRET}=process.env;
  if (!TWITTER_API_KEY||!TWITTER_API_SECRET||!SESSION_SECRET) return res.status(500).send('Server misconfigured.');
  const {oauth_token:verifierToken,oauth_verifier}=req.query;
  const proto=req.headers['x-forwarded-proto']||'https';
  const host=req.headers['x-forwarded-host']||req.headers.host;
  const base=`${proto}://${host}`;
  if (!verifierToken||!oauth_verifier) return res.redirect(302,`${base}/?error=auth_failed`);
  const cookies=parseCookies(req);
  const storedSecret=cookies['pf_req_secret'],storedToken=cookies['pf_req_token'];
  if (!storedSecret||!storedToken) return res.redirect(302,`${base}/?error=missing_cookies`);
  if (storedToken!==verifierToken) return res.redirect(302,`${base}/?error=token_mismatch`);
  try {
    const client=new TwitterApi({appKey:TWITTER_API_KEY,appSecret:TWITTER_API_SECRET,accessToken:verifierToken,accessSecret:storedSecret});
    const {accessToken,accessSecret,screenName,userId}=await client.login(oauth_verifier);
    const encrypted=encrypt(JSON.stringify({accessToken,accessSecret,screenName,userId}),SESSION_SECRET);
    res.setHeader('Set-Cookie',[
      `pf_session=${encodeURIComponent(encrypted)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60*60*24*30}; Secure`,
      `pf_req_secret=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`,
      `pf_req_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`,
    ]);
    return res.redirect(302,`${base}/?connected=1&user=${encodeURIComponent(screenName)}`);
  } catch(err) {
    return res.redirect(302,`${base}/?error=auth_failed`);
  }
};
