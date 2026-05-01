// Cloud implementation of the backend interface. Talks to the FastAPI service
// on Render through the Vercel proxy (prod) or the Vite dev proxy (local dev).

let authToken = null;

export function setAuthToken(t) {
  authToken = t || null;
}

async function call(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let { body } = opts;
  if (body != null && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const r = await fetch(url, { ...opts, headers, body });
  const text = await r.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!r.ok) {
    const detail =
      (data && typeof data === 'object' && (data.detail || data.error)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${r.status}`;
    const err = new Error(String(detail).slice(0, 200));
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
  getShowcase: () => call('/api/showcase'),
  getFolderImages: (folderId) => call(`/api/folders/${folderId}/images`),
  // FIX410.1.1.1.1: admin-only login log, sorted most-recent first.
  listVisits: () => call('/api/admin/visits'),
  // Writes
  saveSetup: (payload) => call('/api/setup', { method: 'POST', body: payload }),
  importGsheet: (projectId, plan) =>
    call(`/api/projects/${projectId}/import-gsheet`, { method: 'POST', body: plan }),
  getExistingImages: (projectId) =>
    call(`/api/projects/${projectId}/existing-images`),
  // FIX507: total bytes used by the project's images in Supabase Storage.
  getStorageSize: (projectId) =>
    call(`/api/projects/${encodeURIComponent(projectId)}/storage-size`),
  signUpload: (body) => call('/api/images/sign-upload', { method: 'POST', body }),
  confirmImage: (body) => call('/api/images/confirm', { method: 'POST', body }),
  // FIX371 orphan cleanup: drop a bucket object that has no image DB row.
  deleteOrphanImage: (body) =>
    call('/api/images/delete-orphan', { method: 'POST', body }),
  // FIX520.2.10 non-destructive save: update rotation and/or crop on the
  // Image row. Partial payloads are accepted (omit keys to leave them
  // unchanged). Returns { id, rotation, crop }.
  updateImage: (imageId, patch) =>
    call(`/api/images/${encodeURIComponent(imageId)}`, { method: 'PATCH', body: patch }),
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
  createFolder: notYet('createFolder'),
  renameFolder: notYet('renameFolder'),
  setFolderProperty: notYet('setFolderProperty'),
};
