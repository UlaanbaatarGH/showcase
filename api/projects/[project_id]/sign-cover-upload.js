const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

// FIX400.3.2.1.2: returns a signed Supabase upload URL for a new project
// cover image. Client PUTs bytes to signed_url, then calls
// PATCH /api/projects/:id with { cover_image_key } to persist.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ detail: 'missing authorization' });
    const { project_id } = req.query;
    const r = await fetch(
      `${BACKEND}/api/projects/${encodeURIComponent(project_id)}/sign-cover-upload`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
      },
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
