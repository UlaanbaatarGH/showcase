// FIX652 [ex-FIX375] / FIX660: the publish pipeline shared by
// <cmd-publish-all-changes> and <cmd-publish-selection> (ShowcaseView) —
// FIX660.3 explicitly requires the two to do "exactly" the same thing, just
// over a different scope of items, so this is the one implementation both
// call into. FIX610.3.5(removed): originally also backed a per-item Publish
// button in ShowcaseImgListEditor, since removed.
import { deleteFolderImage, updateFolderImage, signUpload, confirmImage, getFolderImages, replaceImageBytes } from '../data/backend.js';
import { zoomFactor } from '../zoom.js';
import { bakeRotatedCropToBlob } from './ShowcaseImageCanvas.jsx';

// FIX610.3.1: rows staged locally (not yet uploaded) carry a synthetic
// string id in this form.
export function isLocalRow(im) {
  return typeof im.id === 'string' && im.id.startsWith('local-');
}

// Reads a Blob into the base64 payload replaceImageBytes expects — mirrors
// itemStaging.js's writeLocalImageBytes encoding.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
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
    if (scope.has(idx) && im.deleted && !isLocalRow(im)) {
      await deleteFolderImage(im.id);
      bump();
    }
  }

  const remaining = images
    .map((im, origIdx) => ({ im, origIdx }))
    .filter(({ im, origIdx }) => {
      if (scope.has(origIdx) && im.deleted) return false;
      if (isLocalRow(im) && !scope.has(origIdx)) return false;
      return true;
    });

  const staged = []; // { filename, caption, section, is_main } — applied after refetch
  const pendingPatches = []; // in-scope existing rows needing a PATCH (move and/or field edits)
  for (let idx = 0; idx < remaining.length; idx++) {
    const { im, origIdx } = remaining[idx];
    if (isLocalRow(im)) {
      // FIX670.20.3.1: any pending non-destructive rotation/crop metadata
      // must become a destructive pixel change no later than publish —
      // bake it now, before upload, instead of carrying it through as
      // still-live metadata (the server has no notion of it either way).
      let uploadBlob = im.localFile;
      let bakedUrl = null;
      if (im.rotation || im.crop) {
        uploadBlob = await bakeRotatedCropToBlob(im.url, im.rotation ?? 0, im.crop ?? null);
        bakedUrl = URL.createObjectURL(uploadBlob);
      }
      const sign = await signUpload({ project_id: projectId, item_name: itemName, filename: im.filename });
      const putRes = await fetch(sign.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': uploadBlob.type || 'application/octet-stream' },
        body: uploadBlob,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status}) for ${im.filename}`);
      const dims = await measureDims(bakedUrl || im.url);
      await confirmImage({
        project_id: projectId,
        item_name: itemName,
        storage_key: sign.storage_key,
        sort_order: idx,
        replaces_image_id: null,
        zoom_factor: dims ? zoomFactor(dims.w, dims.h) : null,
      });
      // confirmImage doesn't accept caption/section/is_main either —
      // carried through a follow-up PATCH below, once the row has an id.
      if (im.caption || im.section || im.is_main) {
        staged.push({ filename: im.filename, caption: im.caption, section: im.section, is_main: im.is_main });
      }
      if (bakedUrl) URL.revokeObjectURL(bakedUrl);
      URL.revokeObjectURL(im.url);
      // FIX670.30: the server now has its own durable copy (uploaded above);
      // the on-disk staging folder is resynced by the caller right after
      // publishItemImages() returns (syncStagingFolder against finalImages),
      // which prunes this file and removes the whole folder once nothing's
      // left pending for the item.
      bump();
    } else if (scope.has(origIdx)) {
      // Bug fix (FIX610.3.6 / FIX611.1): a chged public row may carry
      // freshly-baked crop/rotate pixels (localFile set — Flatten/Shrink
      // bake the transform into new bytes and reset rotation/crop to
      // 0/null right there) that were never actually uploaded — the
      // caption/section/is_main-only patch below silently dropped them.
      // FIX670.20.3.1: a row can also still carry *un-baked* rotation/crop
      // metadata (FIX611.1's non-destructive edit, never flattened by the
      // user) — flatten it now, before publishing, same as the local-row
      // branch above. Rotation/crop always takes priority over a present
      // localFile: since the FIX611.1 byte-copy fix, a row's first-ever
      // local edit stages the *original* (unbaked) bytes as localFile
      // alongside the still-pending rotation/crop, so localFile alone no
      // longer implies "already baked" the way it does for Flatten/Shrink.
      if ((im.localFile || im.rotation || im.crop) && im.image_id) {
        const needsBake = im.rotation || im.crop;
        const blob = needsBake ? await bakeRotatedCropToBlob(im.url, im.rotation ?? 0, im.crop ?? null) : im.localFile;
        const bakedUrl = needsBake ? URL.createObjectURL(blob) : im.url;
        const dims = await measureDims(bakedUrl);
        const data_base64 = await blobToBase64(blob);
        await replaceImageBytes(im.image_id, {
          data_base64,
          content_type: blob.type || 'image/jpeg',
          zoom_factor: dims ? zoomFactor(dims.w, dims.h) : null,
        });
        URL.revokeObjectURL(bakedUrl);
      }
      const patch = { caption: im.caption || null, section: im.section || null, is_main: im.is_main };
      if (im.moved) patch.sort_order = im.sort_order;
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
    }
    fresh = await getFolderImages(folderId);
  }

  const stillStagedLocal = images.filter((im, idx) => isLocalRow(im) && !scope.has(idx));
  const stillPendingById = new Map(
    images
      .filter((im, idx) => !isLocalRow(im) && (im.chged || im.moved || im.deleted) && !scope.has(idx))
      .map((im) => [im.id, im]),
  );
  const finalFresh = fresh
    .map((im) => {
      const withBaseline = { ...im, origSortOrder: im.sort_order };
      const pending = stillPendingById.get(im.id);
      if (!pending) return withBaseline;
      return {
        ...withBaseline,
        // Chged/Moved/Deleted are independent flags — each carries through
        // the merge on its own, so a still-pending Moved+Chged row doesn't
        // lose either half.
        chged: pending.chged,
        moved: pending.moved,
        deleted: pending.deleted,
        sort_order: pending.moved ? pending.sort_order : withBaseline.sort_order,
        caption: pending.caption,
        section: pending.section,
        is_main: pending.is_main,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
  return [...finalFresh, ...stillStagedLocal];
}
