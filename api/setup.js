const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const r = await fetch(`${BACKEND}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { detail: (text || `Backend ${r.status}`).slice(0, 500) }; }
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
