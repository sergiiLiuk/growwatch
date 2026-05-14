module.exports = async function handler(req, res) {
  const backendUrl = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

  try {
    const response = await fetch(`${backendUrl}/graphql`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('GraphQL proxy error:', err);
    const cause = err.cause ? (err.cause.code || err.cause.message || String(err.cause)) : '';
    res.status(502).json({ errors: [{ message: `Proxy error: ${err.message} | cause: ${cause} | url: ${backendUrl}` }] });
  }
};
