// Vercel serverless proxy for Google sign-in. Forwards the POSTed credential
// to the Railway backend, which verifies the ID token against Google's public
// keys and mints a GrowWatch JWT.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const backendUrl = (process.env.BACKEND_URL || 'https://growwatch-production.up.railway.app').replace(/\/$/, '');

  try {
    const response = await fetch(`${backendUrl}/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Google auth proxy error:', err);
    res.status(502).json({ error: `Proxy error: ${err.message}` });
  }
};
