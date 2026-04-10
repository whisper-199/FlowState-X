const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie||'').split(';').map(c=>{
    const [k,...v]=c.trim().split('='); try{return[k.trim(),decodeURIComponent(v.join('='))]}catch{return[k.trim(),v.join('=')]}
  }));
}
function decrypt(text, secret) {
  try {
    const key = crypto.scryptSync(secret,'pf_salt_v1',32);
    const [ivHex,encHex] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc',key,Buffer.from(ivHex,'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex,'hex')),decipher.final()]).toString('utf8');
  } catch { return null; }
}
function getSession(req) {
  const {SESSION_SECRET}=process.env; if(!SESSION_SECRET) return null;
  const raw=parseCookies(req)['pf_session']; if(!raw) return null;
  const d=decrypt(raw,SESSION_SECRET); if(!d) return null;
  try{return JSON.parse(d)}catch{return null}
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method==='OPTIONS') return res.status(204).end();
  if (req.method!=='GET') return res.status(405).json({error:'Method not allowed'});

  const {TWITTER_API_KEY,TWITTER_API_SECRET}=process.env;
  if (!TWITTER_API_KEY||!TWITTER_API_SECRET) return res.status(500).json({error:'Server not configured.'});

  const session=getSession(req);
  if (!session) return res.status(401).json({error:'Not signed in.'});

  // WOEID: 1=worldwide, 23424963=Uganda, 23424977=US, 23424975=UK
  const woeid = req.query.woeid || '1';

  try {
    const client = new TwitterApi({
      appKey:TWITTER_API_KEY, appSecret:TWITTER_API_SECRET,
      accessToken:session.accessToken, accessSecret:session.accessSecret
    });
    // v1 trends endpoint
    const trends = await client.v1.trendsByPlace(parseInt(woeid));
    const top = (trends[0]?.trends||[]).slice(0,20).map(t=>({
      name: t.name,
      url: t.url,
      tweet_volume: t.tweet_volume
    }));
    return res.status(200).json({ trends: top, location: trends[0]?.locations?.[0]?.name || 'Global' });
  } catch (err) {
    // Trends require Elevated API access; return graceful fallback
    console.error('[PostFlow] Trends:', err.message);
    return res.status(200).json({ trends: [], error: 'Trends require X Elevated API access.', fallback: true });
  }
};
