const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

// FIX370: /api/projects/:id/import-gsheet proxy. Always authed; never cached.
export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth) {
      return res.status(401).json({ detail: 'missing authorization' });
    }
    const { project_id } = req.query;
    const init = {
      method: req.method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
    };
    if (req.method === 'POST') {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const r = await fetch(`${BACKEND}/api/projects/${project_id}/import-gsheet`, init);
    const data = await r.json().catch(() => null);
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).json(data ?? {});
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=0');
    res.status(502).json({ error: e.message });
  }
}
