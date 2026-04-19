const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

// FIX310: /api/users/me proxy. GET returns the app_user row for the caller;
// POST upserts it from the sign-up form. Always authed; never cached.
export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ detail: 'missing authorization' });
    }
    const init = {
      method: req.method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
    };
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const r = await fetch(`${BACKEND}/api/users/me`, init);
    const data = await r.json().catch(() => null);
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).json(data ?? {});
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
