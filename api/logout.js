module.exports = async function handler(req, res) {
  res.setHeader('Set-Cookie', 'pf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return res.redirect(302, `${proto}://${host}/?disconnected=1`);
};
