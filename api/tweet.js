const { TwitterApi } = require('twitter-api-v2');
const crypto = require('crypto');
const attempts = new Map();
function rateCheck(ip) {
  const now=Date.now(),w=15*60*1000,max=10;
  const e=attempts.get(ip)||{count:0,start:now};
  if(now-e.start>w){attempts.set(ip,{count:1,start:now});return true;}
  if(e.count>=max) return false;
  e.count++;attempts.set(ip,e);return true;
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie||'').split(';').map(c=>{
    const[k,...v]=c.trim().split('=');try{return[k.trim(),decodeURIComponent(v.join('='))]}catch{return[k.trim(),v.join('=')]}
  }));
}
function decrypt(text,secret){
  try{
    const key=crypto.scryptSync(secret,'pf_salt_v1',32);
    const[ivHex,encHex]=text.split(':');
    const d=crypto.createDecipheriv('aes-256-cbc',key,Buffer.from(ivHex,'hex'));
    return Buffer.concat([d.update(Buffer.from(encHex,'hex')),d.final()]).toString('utf8');
  }catch{return null;}
}
function getSession(req){
  const{SESSION_SECRET}=process.env;if(!SESSION_SECRET)return null;
  const raw=parseCookies(req)['pf_session'];if(!raw)return null;
  const d=decrypt(raw,SESSION_SECRET);if(!d)return null;
  try{return JSON.parse(d)}catch{return null}
}
module.exports = async function handler(req, res) {
  const origin=req.headers.origin||'';
  if(origin) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  const{TWITTER_API_KEY,TWITTER_API_SECRET}=process.env;
  if(!TWITTER_API_KEY||!TWITTER_API_SECRET) return res.status(500).json({error:'Server not configured.'});
  if(req.method==='GET'){
    const s=getSession(req);
    return res.status(200).json({status:'ok',time:new Date().toISOString(),version:'4.0.0',host:'vercel',authenticated:!!s,screenName:s?.screenName||null});
  }
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
  const ip=req.headers['x-forwarded-for']?.split(',')[0]||'unknown';
  if(!rateCheck(ip)) return res.status(429).json({error:'Too many requests — wait 15 minutes.'});
  const s=getSession(req);
  if(!s) return res.status(401).json({error:'Not signed in. Connect your X account first.'});
  const{text}=req.body||{};
  if(!text||typeof text!=='string'||!text.trim()) return res.status(400).json({error:'Post text is required.'});
  const trimmed=text.trim();
  if(trimmed.length>280) return res.status(400).json({error:`Too long (${trimmed.length} chars). Max 280.`});
  try{
    const client=new TwitterApi({appKey:TWITTER_API_KEY,appSecret:TWITTER_API_SECRET,accessToken:s.accessToken,accessSecret:s.accessSecret});
    const{data}=await client.readWrite.v2.tweet(trimmed);
    return res.status(200).json({success:true,tweetId:data.id,tweetUrl:`https://x.com/i/web/status/${data.id}`});
  }catch(err){
    const xErr=err?.data?.detail||err?.data?.title||err?.errors?.[0]?.message;
    const status=err?.code===403?403:err?.code===401?401:500;
    return res.status(status).json({error:xErr||err.message||'Failed to post.'});
  }
};
