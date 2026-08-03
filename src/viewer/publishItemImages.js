// FIX610.3.5 / FIX652 [ex-FIX375]: the publish pipeline shared by the per-item
// <button-publish-img> (ShowcaseImgListEditor) and the cross-item
// <cmd-publish-changes> command (ShowcaseView) — FIX652 explicitly requires
// the two to do "exactly" the same thing, just over a different scope of
// rows, so this is the one implementation both call into.
import { deleteFolderImage, updateFolderImage, signUpload, confirmImage, getFolderImages, updateImage } from '../data/backend.js';
import { zoomFactor } from '../zoom.js';

// FIX610.3.1: rows staged locally (not yet uploaded) carry a synthetic
// string id in this form.
export function isLocalRow(im) {
  return typeof im.id === 'string' && im.id.startsWith('local-');
}

// Natural pixel dimensions of an image, probed fresh (not reliant on any
// component's own dims cache, so this module has no React dependency).
function measureDims(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Publishes every row in `images` whose index is in `scopeIdxs` (the caller
// filters this to non-blank status beforehand — a per-item Publish scopes
// to the current selection, a cross-item Publish scopes to everything
// staged). Returns the merged images array: fresh server truth for
// everything now public, plus anything intentionally left out of scope
// (still-staged Added rows, still-pending Removed/Moved/Changed rows) —
// see FIX610.3.4 / FIX610.3.6 for why those need to survive the merge.
export async function publishItemImages({ projectId, itemName, folderId, images, scopeIdxs, onProgress }) {
  const scope = new Set(scopeIdxs);
  const total = scope.size;
  let done = 0;
  const bump = () => { done += 1; onProgress?.(done, total); };

  for (let idx = 0; idx < images.length; idx++) {
    const im = images[idx];
    if (scope.has(idx) && im.status === 'Removed' && !isLocalRow(im)) {
      await deleteFolderImage(im.id);
      bump();
    }
  }

  const remaining = images
    .map((im, origIdx) => ({ im, origIdx }))
    .filter(({ im, origIdx }) => {
      if (scope.has(origIdx) && im.status === 'Removed') return false;
      if (isLocalRow(im) && !scope.has(origIdx)) return false;
      return true;
    });

  const staged = []; // { filename, caption, section, is_main } — applied after refetch
  const pendingPatches = []; // in-scope existing rows needing a PATCH (move and/or field edits)
  for (let idx = 0; idx < remaining.length; idx++) {
    const { im, origIdx } = remaining[idx];
    if (isLocalRow(im)) {
      const sign = await signUpload({ project_id: projectId, item_name: itemName, filename: im.filename });
      const putRes = await fetch(sign.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': im.localFile.type || 'application/octet-stream' },
        body: im.localFile,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status}) for ${im.filename}`);
      const dims = await measureDims(im.url);
      await confirmImage({
        project_id: projectId,
        item_name: itemName,
        storage_key: sign.storage_key,
        sort_order: idx,
        replaces_image_id: null,
        zoom_factor: dims ? zoomFactor(dims.w, dims.h) : null,
      });
      // confirmImage doesn't accept rotation/crop either — carried through
      // the same follow-up-PATCH mechanism as caption/section/is_main
      // below, otherwise a crop/rotation staged on a not-yet-published row
      // (ShowcaseImgListEditor.jsx's saveImageEdit) would silently vanish
      // the moment Publish actually uploads it.
      if (im.caption || im.section || im.is_main || im.rotation || im.crop) {
        staged.push({
          filename: im.filename, caption: im.caption, section: im.section, is_main: im.is_main,
          rotation: im.rotation, crop: im.crop,
        });
      }
      URL.revokeObjectURL(im.url);
      // FIX670.30: the server now has its own durable copy (uploaded above);
      // the on-disk staging folder is resynced by the caller right after
      // publishItemImages() returns (syncStagingFolder against finalImages),
      // which prunes this file and removes the whole folder once nothing's
      // left pending for the item.
      bump();
    } else if (scope.has(origIdx)) {
      const patch = { caption: im.caption || null, section: im.section || null, is_main: im.is_main };
      if (im.status === 'Moved') patch.sort_order = im.sort_order;
      pendingPatches.push({ id: im.id, patch });
    }
  }
  for (const p of pendingPatches) {
    await updateFolderImage(p.id, p.patch);
    bump();
  }

  let fresh = await getFolderImages(folderId);
  if (staged.length) {
    for (const s of staged) {
      const row = fresh.find((f) => f.filename === s.filename);
      if (!row) continue;
      await updateFolderImage(row.id, {
        caption: s.caption || null,
        section: s.section || null,
        is_main: s.is_main,
      });
      if ((s.rotation || s.crop) && row.image_id) {
        await updateImage(row.image_id, { rotation: s.rotation ?? 0, crop: s.crop ?? null });
      }
    }
    fresh = await getFolderImages(folderId);
  }

  const stillStagedLocal = images.filter((im, idx) => isLocalRow(im) && !scope.has(idx));
  const stillPendingById = new Map(
    images
      .filter((im, idx) => !isLocalRow(im) && im.status !== '' && !scope.has(idx))
      .map((im) => [im.id, im]),
  );
  const finalFresh = fresh
    .map((im) => {
      const withBaseline = { ...im, origSortOrder: im.sort_order };
      const pending = stillPendingById.get(im.id);
      if (!pending) return withBaseline;
      return {
        ...withBaseline,
        status: pending.status,
        // FIX610.4.1[ex-610.3.12] [ex-610.3.7]: carry the cumulate flag through the merge too, so a
        // still-pending Moved+Changed row doesn't lose its "Changed" half.
        fieldsChanged: pending.fieldsChanged,
        sort_order: pending.status === 'Moved' ? pending.sort_order : withBaseline.sort_order,
        caption: pending.caption,
        section: pending.section,
        is_main: pending.is_main,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
  return [...finalFresh, ...stillStagedLocal];
}
