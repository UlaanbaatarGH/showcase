const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

// FIX400: /api/projects proxy. Forwards Authorization when the caller is
// signed in so the backend can return accessible private projects in addition
// to public ones. Anonymous responses are CDN-cached; authed responses are not.
export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    const headers = auth ? { Authorization: auth } : {};
    const r = await fetch(`${BACKEND}/api/projects`, { headers });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      res.setHeader('Cache-Control', 's-maxage=0');
      return res.status(r.status).json(data ?? { error: `Backend ${r.status}` });
    }
    res.setHeader(
      'Cache-Control',
      auth ? 'no-store' : 's-maxage=300, stale-while-revalidate=600',
    );
    res.json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
