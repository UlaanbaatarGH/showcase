// Single catch-all proxy for /api/* → Render backend.
//
// Vercel Hobby tier caps deployments at 12 serverless functions total,
// so we cannot ship one file per endpoint. This handler forwards every
// request under /api/... to the FastAPI service, preserving method,
// query string, auth header, body, and status code.
//
// maxDuration is set globally in vercel.json so slow endpoints
// (e.g. import-gsheet) still get up to 60 s.
const BACKEND = process.env.BACKEND_URL || 'https://showcase-api-muxl.onrender.com';

export default async function handler(req, res) {
  try {
    // req.url is "/api/<rest>?<query>" — forward verbatim.
    const suffix = req.url.replace(/^\/api\/?/, '');
    const url = `${BACKEND}/api/${suffix}`;

    const headers = {};
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body == null) {
        body = undefined;
      } else if (typeof req.body === 'string') {
        body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }
    }

    const r = await fetch(url, { method: req.method, headers, body });
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
