const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

// FIX371: proxy for listing existing folder_image links on a project,
// keyed by item name. Always authed; never cached.
export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ detail: 'missing authorization' });
    const { project_id } = req.query;
    const r = await fetch(
      `${BACKEND}/api/projects/${project_id}/existing-images`,
      { headers: { Authorization: auth } },
    );
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
