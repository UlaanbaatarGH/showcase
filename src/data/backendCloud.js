// Cloud implementation of the backend interface. Talks to the FastAPI service
// on Render through the Vercel proxy (prod) or the Vite dev proxy (local dev).

let authToken = null;

export function setAuthToken(t) {
  authToken = t || null;
}

// Bug fix: FastAPI validation errors return `detail` as an array of
// { type, loc, msg, input } objects, not a string -- String(detail) on
// that array stringified each element via the default Object.toString,
// showing the user a literal "[object Object]" instead of the message.
function detailToText(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === 'object' && d.msg) ? d.msg : JSON.stringify(d))
      .join('; ');
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return String(detail);
}

async function call(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let { body } = opts;
  if (body != null && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const traceMethod = opts.method || 'GET';
  console.log(`[backend] ${traceMethod} ${url}`, body ? { body } : '');
  const t0 = performance.now();
  const r = await fetch(url, { ...opts, headers, body });
  const text = await r.text();
  const dt = (performance.now() - t0).toFixed(0);
  console.log(`[backend] <- ${r.status} ${url} (${dt}ms)`, text.slice(0, 300));
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!r.ok) {
    const detail =
      (data && typeof data === 'object' && (data.detail || data.error)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${r.status}`;
    // If the backend rejects the bearer (stale JWT, server-side
    // session no longer exists, expired, etc.) tell AuthContext to
    // wipe the local Supabase session so the UI falls back to the
    // anonymous (and working) state instead of looping on a dead
    // token. We only fire when a token was attached — a 401 on an
    // anonymous call is a real authorization error, not a stale
    // session.
    if (r.status === 401 && authToken) {
      // Clear our copy immediately so any in-flight retry stops
      // attaching the bad token; AuthContext will also clear the
      // Supabase session (signOut) on receipt of the event.
      authToken = null;
      try {
        window.dispatchEvent(new CustomEvent('auth:invalid', {
          detail: { reason: detailToText(detail).slice(0, 200) },
        }));
      } catch { /* ignore — non-browser env */ }
    }
    const err = new Error(detailToText(detail).slice(0, 200));
    err.status = r.status;
    throw err;
  }
  return data;
}

const notYet = (name) => () => {
  throw new Error(`${name}: not implemented yet on the cloud backend`);
};

export default {
  setAuthToken,
  // Reads
  listProjects: () => call('/api/projects'),
  // FIX401.2: scoped to a single project. The slug comes from the
  // SPA route (`/{slug}`) and is matched against project names on
  // the server using the same recipe as the JS slugify.
  getShowcase: (slug) =>
    call(`/api/showcase${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`),
  getFolderImages: (folderId) => call(`/api/folders/${folderId}/images`),
  // FIX410.1.1.1.1: admin-only consultation log, sorted most-recent first.
  listVisits: () => call('/api/admin/visits'),
  // FIX410.1.1.1.1.1: log a consultation of one of the two tracked pages.
  // Fire-and-forget — failures swallowed so they don't disrupt the page load.
  // FIX412.2.1.1.1: when page='project', pass the project's id so the
  // backend can render the project's name in the History tab.
  trackVisit: (page, opts = {}) =>
    call('/api/track', {
      method: 'POST',
      body: { page, ...(opts.project_id != null ? { project_id: opts.project_id } : {}) },
    }).catch(() => null),
  // FIX413: per-IP friendly name + page consultation counts.
  listIpStats: () => call('/api/admin/ip-stats'),
  setIpName: (ip, name) =>
    call('/api/admin/ip-name', { method: 'POST', body: { ip, name } }),
  // FIX311 <panel-users-list>: admin-only user management.
  listUsers: () => call('/api/admin/users'),
  createUser: (body) => call('/api/admin/users', { method: 'POST', body }),
  updateUser: (id, body) =>
    call(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteUser: (id) =>
    call(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // FIX311.2.5[ex-312.2.12] <btn-reset-pswd> -> FIX312.3.1 ->
  // FIX318 <process-reset-pswd>.
  resetUserPassword: (id) =>
    call(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST' }),
  // FIX311.3.3 / FIX311.5.6 / FIX311.5.7 <user-projects>: add or
  // remove a project from a user's project_access set.
  grantUserProject: (userId, projectId) =>
    call(
      `/api/admin/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectId)}`,
      { method: 'POST' },
    ),
  revokeUserProject: (userId, projectId) =>
    call(
      `/api/admin/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectId)}`,
      { method: 'DELETE' },
    ),
  // FIX317: anonymous redemption — trade login_name + access_code
  // + new password + email for a fresh Supabase auth user. Backend
  // rewrites the existing app_user.id to match the new auth user id.
  redeemAccount: (body) => call('/api/auth/redeem', { method: 'POST', body }),
  // FIX316.2.1 / FIX317 (Visitor flow): self-signup with no access
  // code. Creates a fresh visitor app_user + Supabase auth user.
  signupVisitor: (body) =>
    call('/api/auth/signup-visitor', { method: 'POST', body }),
  // FIX420 <panel-contact-admin>: anonymous Contact form post.
  contactAdmin: (body) => call('/api/contact', { method: 'POST', body }),
  // FIX421 <panel-message-list>: list contact messages, optionally
  // filtered by project.
  listContactMessages: (projectId) =>
    call(
      `/api/admin/messages${projectId != null ? `?project_id=${encodeURIComponent(projectId)}` : ''}`,
    ),
  // FIX414 <panel-app-versions>: admin-only deploy history.
  listAppVersions: () => call('/api/admin/versions'),
  // FIX509 <panel-language-setup>: language list (public read,
  // admin-only writes).
  listLanguages: () => call('/api/languages'),
  createLanguage: (body) =>
    call('/api/admin/languages', { method: 'POST', body }),
  updateLanguage: (code, body) =>
    call(`/api/admin/languages/${encodeURIComponent(code)}`, { method: 'PATCH', body }),
  deleteLanguage: (code) =>
    call(`/api/admin/languages/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  // FIX351 <panel-project-list>: admin-only project + managers CRUD.
  listAdminProjects: () => call('/api/admin/projects'),
  createAdminProject: (body) =>
    call('/api/admin/projects', { method: 'POST', body }),
  updateAdminProject: (id, body) =>
    call(`/api/admin/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  clearProjectManagers: (id) =>
    call(`/api/admin/projects/${encodeURIComponent(id)}/clear-managers`, { method: 'POST' }),
  // FIX351.2.7 / FIX351.2.8: shift selected project up/down in the
  // panel order (and therefore the home page list).
  moveAdminProject: (id, direction) =>
    call(`/api/admin/projects/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      body: { direction },
    }),
  // Writes
  saveSetup: (payload) => call('/api/setup', { method: 'POST', body: payload }),
  importGsheet: (projectId, plan) =>
    call(`/api/projects/${projectId}/import-gsheet`, { method: 'POST', body: plan }),
  getExistingImages: (projectId) =>
    call(`/api/projects/${projectId}/existing-images`),
  signUpload: (body) => call('/api/images/sign-upload', { method: 'POST', body }),
  confirmImage: (body) => call('/api/images/confirm', { method: 'POST', body }),
  // FIX371 orphan cleanup: drop a bucket object that has no image DB row.
  deleteOrphanImage: (body) =>
    call('/api/images/delete-orphan', { method: 'POST', body }),
  // FIX524.4.10 non-destructive save: update rotation and/or crop on the
  // Image row. Partial payloads are accepted (omit keys to leave them
  // unchanged). Returns { id, rotation, crop }.
  updateImage: (imageId, patch) =>
    call(`/api/images/${encodeURIComponent(imageId)}`, { method: 'PATCH', body: patch }),
  // FIX521.3.5.2: replace an image's stored bytes with a client-shrunk
  // version. Backend writes a new versioned key, repoints the row, and
  // deletes the old object. Returns { storage_key, url, bytes }.
  replaceImageBytes: (imageId, body) =>
    call(`/api/images/${encodeURIComponent(imageId)}/replace-bytes`, { method: 'POST', body }),
  // FIX521.5.8.0 / FIX521.5.8.1: persist an item's Zoom Factor (max ZF of its
  // images), recomputed by the client whenever the item's images change.
  setFolderZoomFactor: (folderId, zoomFactor) =>
    call(`/api/folders/${encodeURIComponent(folderId)}/zoom-factor`, { method: 'POST', body: { zoom_factor: zoomFactor } }),
  // FIX520.3.4 / FIX520.4.5: set (or, with null, clear) the logged-in
  // caller's own rating for this item. Returns { folder_id, rating_value_id }.
  setMyRating: (folderId, ratingValueId) =>
    call(`/api/folders/${encodeURIComponent(folderId)}/rating`, { method: 'POST', body: { rating_value_id: ratingValueId } }),
  // FIX521: update caption / section / sort_order on the folder_image row.
  // Partial payloads are accepted. Returns { id, caption, section, sort_order }.
  updateFolderImage: (folderImageId, patch) =>
    call(`/api/folder-images/${encodeURIComponent(folderImageId)}`, { method: 'PATCH', body: patch }),
  // FIX521.2.1.4: remove an image from an item. Cascades to image + bucket
  // when no other folder_image references the same image_id.
  deleteFolderImage: (folderImageId) =>
    call(`/api/folder-images/${encodeURIComponent(folderImageId)}`, { method: 'DELETE' }),
  // FIX400.3.3: rename a project and/or update its cover_image_key.
  updateProject: (projectId, patch) =>
    call(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: patch }),
  // FIX400.3.2.1.2: get a signed upload URL for a new project cover image.
  signProjectCoverUpload: (projectId, filename) =>
    call(`/api/projects/${encodeURIComponent(projectId)}/sign-cover-upload`, {
      method: 'POST',
      body: { filename },
    }),
  // Planned writes — backend routes will be added when FIX entries land.
  // FIX620.4.2.2: bare item creation (no image yet) — lets the client stage
  // a captured photo locally before any upload happens.
  createFolder: (body) => call('/api/folders', { method: 'POST', body }),
  // FIX652.2.2 <cmd-publish-all-changes>: applies a pending Ref swap (FIX657)
  // to a real item's folder row.
  renameFolder: (folderId, name) =>
    call(`/api/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: { name } }),
  // FIX652.2.1 <cmd-publish-all-changes>: deletes a real item's folder + images.
  deleteFolder: (folderId) =>
    call(`/api/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' }),
  setFolderProperty: notYet('setFolderProperty'),
};
