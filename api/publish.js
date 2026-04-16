const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // base64-encoded images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const r = await fetch(`${BACKEND}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `Backend ${r.status}`);
    res.setHeader('Cache-Control', 's-maxage=0');
    res.json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
