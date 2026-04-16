const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

export default async function handler(req, res) {
  try {
    const r = await fetch(`${BACKEND}/api/showcase`);
    if (!r.ok) throw new Error(`Backend ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
