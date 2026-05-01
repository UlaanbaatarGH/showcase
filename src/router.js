// Pretty-URL routing for the SPA.
//   `/`              → home (list of projects)
//   `/{slug}`        → that project's home (the Showcase view)
//   `/admin` (DEV)   → local-only admin File Explorer
//
// `slug` is the project name lowercased, NFD-normalized to drop
// diacritics, and stripped to [a-z0-9]. Pure CSS / browser history
// navigation; Vercel's catch-all rewrite (vercel.json) makes sure the
// SPA's index.html is served for every non-/api path.

const DIACRITICS = /[̀-ͯ]/g;

export function projectSlug(name) {
  return (name || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseLocation() {
  const p = window.location.pathname || '/';
  if (p === '/' || p === '') return { view: 'home' };
  if (p === '/admin') return { view: 'admin' };
  // First path segment is the slug; ignore anything after for now —
  // future deep-links can layer more state on top.
  const slug = p.replace(/^\/+/, '').split('/')[0];
  if (!slug) return { view: 'home' };
  return { view: 'project', slug };
}

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  // Tell same-tab listeners we changed routes — popstate only fires
  // for back/forward, not for pushState, so we need our own signal.
  window.dispatchEvent(new PopStateEvent('popstate'));
}
