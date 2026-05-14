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
    res.status(502).json({ errors: [{ message: 'Failed to reach backend' }] });
  }
};
