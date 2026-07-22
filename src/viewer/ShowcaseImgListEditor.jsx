import { Fragment, useEffect, useRef, useState } from 'react';
import ShowcaseImageCanvas from './ShowcaseImageCanvas.jsx';
import {
  updateImage, updateFolderImage, deleteFolderImage, replaceImageBytes,
  getFolderImages, signUpload, confirmImage,
} from '../data/backend.js';
import { zoomFactor } from '../zoom.js';

// FIX600 / FIX600.1 <panel-showcase-img-list-editor> local-app extension:
// manage image addition/update/removal locally, staged with a Status column,
// then publish the batch to the website in one action (FIX610).

// FIX521.2.1.1.2 File Size column. Size isn't stored in the DB — fetch
// it via HEAD request to the public Supabase URL. Cached in-memory by
// URL so we only ask once per image per session.
function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// FIX521.2.1.1.7 / FIX521.5.7: the per-image Zoom Factor uses the shared
// zoomFactor() against the hardcoded Reference Viewport (see src/zoom.js).

// FIX521 <panel-showcase-img-list-editor>: replaces the image viewer when
// the user clicks <button-edit> on the Images tab (FIX515.3.2.1).
//
// Left panel: <table-item-img-info> — one row per image, columns
//   File name | File Size | Caption | Section
// with caption/section as inline inputs. One row is always selected
// (FIX521.2.1.1.10). Arrow-up/down buttons (FIX521.2.1.2/.3) and keyboard
// keys (FIX521.3.3/.4) reorder the list.
//
// Right panel: <panel_img_editor> — reuses the image editor UI previously
// embedded in the viewer (crop / rotate / reset / save). FIX521.5.4:
// selection is locked in the table while the image has pending edits.
//
// Table edits are auto-saved (FIX521.5.5) via PATCH /api/folder-images/:id.
export default function ShowcaseImgListEditor({
  images,
  selectedIdx,
  setSelectedIdx,
  setImages,
  onExitEdit,
  onItemBytesChange, // FIX521.3.5.4: report the item's new total image bytes
  onItemZoomChange,  // FIX521.5.8.1: report the item's Zoom Factor (max ZF)
  folderId,   // FIX610.3.5: which item to re-fetch from after Publish
  projectId,  // FIX610.3.1 / .3.5: needed for sign-upload / confirm
  itemName,   // FIX610.3.1 / .3.5: item folder name (item_name on the API)
}) {
  const currentImage = images[selectedIdx] ?? null;

  // FIX610: local-app-only staging controls (Add/Remove/Unremove/Publish +
  // Status column) are visible only when running the app locally (dev),
  // matching the gating already used elsewhere for admin-only surfaces.
  const isLocalApp = import.meta.env.DEV;
  // FIX610.3.1: rows staged locally (not yet uploaded) carry a synthetic
  // string id in this form so they can be told apart from real folder_image
  // ids (numeric) without a separate flag on every row.
  const isLocalRow = (im) => typeof im.id === 'string' && im.id.startsWith('local-');

  // Image-editor state (right panel). null until the user touches
  // rotate/crop; pinned to the currently selected folder_image.id via
  // draftForId so switching rows cancels any in-flight draft.
  const [imageDraft, setImageDraft] = useState(null);
  const [draftForId, setDraftForId] = useState(null);
  const [cropMode, setCropMode] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [error, setError] = useState(null);

  // FIX521.2.1.9: multi-selection for the Shrink action. selectedIdx (owned by
  // the parent) stays the *primary* row that drives the right-hand editor;
  // selIdxs holds every selected row (always includes the primary). anchor is
  // the Shift-click pivot.
  const [selIdxs, setSelIdxs] = useState(() => new Set([selectedIdx]));
  const [anchor, setAnchor] = useState(selectedIdx);
  // FIX521.2.1.9: the check/uncheck action of the last plain click. Shift-click
  // replays this action across the anchor..clicked range ("extend what I just
  // did"): 'select' checks the range, 'deselect' unchecks it.
  const [lastAction, setLastAction] = useState('select');

  // FIX521.2.1.4: Remove flow — overlay popup confirmation for removing all
  // selected images. Boolean: the confirmation overlay is shown or not.
  const [removeConfirm, setRemoveConfirm] = useState(false);

  // FIX521.2.1.6 <button-file-details>: toggle, off by default. Reveals
  // the file-name/size/resolution/zoom-factor detail line per row
  // (FIX521.2.1.1.13) — off by default keeps rows to a single line.
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);

  // FIX521.3.5: Shrink flow. stage: 'input' ('Image max zoom factor'), 'confirm'
  // (FIX521.3.5.4.1, cannot be undone), 'running' (progress). shrinkRatio is the
  // requested ZF (<input-requested-zf>) entered by the user; blank by default.
  const [shrinkStage, setShrinkStage] = useState(null);
  const [shrinkRatio, setShrinkRatio] = useState('');
  const [shrinkProgress, setShrinkProgress] = useState(null);

  // Keep the multi-selection valid as the list grows/shrinks (e.g. after a
  // Remove). Always leave at least one row selected (FIX521.2.1.1.10).
  useEffect(() => {
    setSelIdxs((prev) => {
      const next = new Set([...prev].filter((i) => i >= 0 && i < images.length));
      if (next.size === 0 && images.length > 0) next.add(0);
      return next;
    });
  }, [images.length]);

  // FIX521.2.1.1.2 file sizes: HEAD-fetched from the public Supabase URL.
  // Keyed by URL so the map is stable across re-renders / selection
  // changes. Value is a number (bytes) or null (unknown / fetch failed).
  const [sizesByUrl, setSizesByUrl] = useState({});
  useEffect(() => {
    let cancelled = false;
    const pending = images
      .map((im) => im.url)
      .filter((u) => u && !(u in sizesByUrl));
    if (pending.length === 0) return undefined;
    (async () => {
      for (const url of pending) {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          const len = r.headers.get('content-length');
          const n = len != null ? Number(len) : null;
          if (cancelled) return;
          setSizesByUrl((prev) =>
            url in prev ? prev : { ...prev, [url]: Number.isFinite(n) ? n : null },
          );
        } catch {
          if (cancelled) return;
          setSizesByUrl((prev) => (url in prev ? prev : { ...prev, [url]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [images, sizesByUrl]);

  // FIX521.2.1.1.6 (Resolution) / FIX521.2.1.1.7 (Zoom factor): natural pixel
  // dimensions per image, probed once per URL. Value: { w, h } or null.
  // crossOrigin MUST match the editor canvas (ShowcaseImageCanvas, which uses
  // 'anonymous'): the image host (R2) only returns CORS headers — and Vary:
  // Origin — when an Origin is sent, so a plain (no-crossOrigin) probe would
  // cache a header-less copy that the canvas's CORS load then reuses and the
  // browser blocks. Loading the probe with crossOrigin keeps the cached copy
  // CORS-valid for both.
  const [dimsByUrl, setDimsByUrl] = useState({});
  useEffect(() => {
    let cancelled = false;
    const pending = images.map((im) => im.url).filter((u) => u && !(u in dimsByUrl));
    if (pending.length === 0) return undefined;
    for (const url of pending) {
      const probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = () => {
        if (cancelled) return;
        setDimsByUrl((prev) =>
          url in prev ? prev : { ...prev, [url]: { w: probe.naturalWidth, h: probe.naturalHeight } },
        );
      };
      probe.onerror = () => {
        if (cancelled) return;
        setDimsByUrl((prev) => (url in prev ? prev : { ...prev, [url]: null }));
      };
      probe.src = url;
    }
    return () => { cancelled = true; };
  }, [images, dimsByUrl]);

  // FIX521.5.8 / FIX521.5.8.1: report the item's Zoom Factor (max ZF of its
  // images) once every image is measured. Fires on open (backfill) and on any
  // add / update / delete, so the parent can persist it for the item list.
  // onItemZoomChange is intentionally left out of the deps to avoid re-running
  // (and re-persisting) on every parent render; the selection is stable per edit.
  useEffect(() => {
    if (!images.length) { onItemZoomChange?.(null); return; }
    let zf = 0;
    for (const im of images) {
      const d = dimsByUrl[im.url];
      if (!d) return; // wait until every image is measured
      const z = zoomFactor(d.w, d.h);
      if (z != null) zf = Math.max(zf, z);
    }
    onItemZoomChange?.(zf || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, dimsByUrl]);

  // FIX521.5.7: Zoom Factor uses the hardcoded Reference Viewport (src/zoom.js),
  // not the live browser window.

  // FIX521.2.1.11 / FIX521.2.1.11.3: draggable vertical splitter between the
  // image list (left) and the image editor (right). Default 50/50 (.11.3); the
  // table h-scrolls when squeezed (.11.1) and the image pane resizes with it (.11.2).
  const [listPct, setListPct] = useState(50);
  const editorRef = useRef(null);
  const onSplitterDown = (e) => {
    e.preventDefault();
    const container = editorRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListPct(Math.max(15, Math.min(85, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const draftForCurrent =
    imageDraft && draftForId === currentImage?.id ? imageDraft : null;
  const hasPendingImageEdit = !!draftForCurrent;
  const effectiveRotation = draftForCurrent
    ? draftForCurrent.rotation
    : currentImage?.rotation ?? 0;
  const effectiveCrop = draftForCurrent
    ? draftForCurrent.crop
    : currentImage?.crop ?? null;

  // FIX521.5.4: changing item selection must not wipe pending edits on the
  // previous row; we gate selection changes on hasPendingImageEdit above,
  // so the effect below only needs to clear local state if the list shrinks
  // to nothing.
  useEffect(() => {
    if (!currentImage) {
      setImageDraft(null);
      setDraftForId(null);
      setCropMode(false);
    }
  }, [currentImage]);

  const ensureDraft = () => {
    if (draftForCurrent) return draftForCurrent;
    const fresh = {
      rotation: currentImage?.rotation ?? 0,
      crop: currentImage?.crop ?? null,
    };
    setImageDraft(fresh);
    setDraftForId(currentImage?.id ?? null);
    return fresh;
  };

  const rotateBy = (delta) => {
    const base = ensureDraft();
    const next = ((((base.rotation ?? 0) + delta) % 360) + 360) % 360;
    // Rotating invalidates the previous crop (coord space changes).
    setImageDraft({ rotation: next, crop: null });
    setCropMode(false);
  };

  const resetImage = () => {
    setImageDraft({ rotation: 0, crop: null });
    setDraftForId(currentImage?.id ?? null);
    setCropMode(false);
  };

  const onCropComplete = (rect) => {
    const base = ensureDraft();
    setImageDraft({ ...base, crop: rect });
    setCropMode(false);
  };

  const cancelImageEdit = () => {
    setImageDraft(null);
    setDraftForId(null);
    setCropMode(false);
  };

  const saveImageEdit = async () => {
    if (!draftForCurrent || !currentImage?.image_id) return;
    setSavingImage(true);
    try {
      const updated = await updateImage(currentImage.image_id, {
        rotation: draftForCurrent.rotation,
        crop: draftForCurrent.crop,
      });
      setImages((prev) =>
        prev.map((im) =>
          im.image_id === currentImage.image_id
            ? { ...im, rotation: updated.rotation, crop: updated.crop }
            : im,
        ),
      );
      setImageDraft(null);
      setDraftForId(null);
      setCropMode(false);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSavingImage(false);
    }
  };

  // Row selection — blocked while the image editor has pending changes.
  // Single-selects: collapses any multi-selection to this one row.
  const trySelect = (nextIdx) => {
    console.log('[sel] trySelect', { nextIdx, hasPendingImageEdit, anchor, selIdxs: [...selIdxs] });
    if (hasPendingImageEdit) return;
    if (nextIdx < 0 || nextIdx >= images.length) return;
    setSelectedIdx(nextIdx);
    setSelIdxs(new Set([nextIdx]));
    setAnchor(nextIdx);
    setLastAction('select'); // FIX521.2.1.9: a plain single-select is a "check"
  };

  // FIX521.2.1.9: focusing a row's Section/Caption input makes it the primary
  // row (so the editor follows it, and keyboard-tab navigation still updates
  // the selection) WITHOUT collapsing the multi-selection or moving the
  // Shift-click anchor. Using trySelect here reset `anchor` and clobbered
  // `selIdxs` — and because focus fires before click, it ran *before*
  // onRowClick, which broke Shift-click (range collapsed to the clicked row)
  // and made plain clicks behave differently on input cells vs plain cells.
  const focusRowPrimary = (idx) => {
    console.log('[sel] focusRowPrimary (input onFocus)', { idx, hasPendingImageEdit, anchor, selIdxs: [...selIdxs] });
    if (hasPendingImageEdit) return;
    if (idx < 0 || idx >= images.length) return;
    setSelectedIdx(idx);
  };

  // FIX521.2.1.9: plain click selects one; Ctrl/Cmd-click toggles a row (and
  // records whether that was a check or uncheck); Shift-click replays that last
  // action across the anchor..clicked range. The clicked row becomes the
  // primary (drives the editor). Blocked while an image edit is pending.
  const onRowClick = (e, idx) => {
    console.log('[sel] onRowClick', {
      idx,
      target: e.target?.tagName,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      anchor,
      lastAction,
      selIdxs: [...selIdxs],
      hasPendingImageEdit,
    });
    if (hasPendingImageEdit) return;
    if (e.shiftKey) {
      // FIX521.2.1.9: replay the last plain click's action across the
      // anchor..idx range. lastAction 'select' checks the range, 'deselect'
      // unchecks it. Merge into the current selection (rows outside the range
      // are left as-is); the anchor stays put so the endpoint can be dragged.
      const lo = Math.min(anchor, idx);
      const hi = Math.max(anchor, idx);
      const s = new Set(selIdxs);
      for (let i = lo; i <= hi; i++) {
        if (lastAction === 'deselect') s.delete(i);
        else s.add(i);
      }
      if (s.size === 0 && images.length > 0) s.add(selectedIdx); // FIX521.2.1.1.10
      setSelIdxs(s);
      if (s.has(idx)) setSelectedIdx(idx);
      else if (!s.has(selectedIdx) && s.size) setSelectedIdx(Math.min(...s));
    } else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selIdxs);
      let action;
      if (s.has(idx)) { s.delete(idx); action = 'deselect'; }
      else { s.add(idx); action = 'select'; }
      if (s.size === 0) { s.add(idx); action = 'select'; } // one row always selected (FIX521.2.1.1.10)
      setSelIdxs(s);
      setAnchor(idx);
      setLastAction(action); // FIX521.2.1.9: Ctrl-click sets the action Shift replays
      if (s.has(idx)) setSelectedIdx(idx);
      else if (!s.has(selectedIdx)) setSelectedIdx(Math.min(...s));
    } else {
      trySelect(idx);
    }
  };

  // FIX521.2.1.9.2: a leftmost checkbox per row is an easy way to (multi-)select
  // a row without clicking into its Section/Caption input fields. Toggles the
  // row in/out of the selection and keeps it as the primary when added.
  const toggleRowSelect = (idx) => {
    console.log('[sel] toggleRowSelect', { idx, hasPendingImageEdit, anchor, lastAction, selIdxs: [...selIdxs] });
    if (hasPendingImageEdit) return;
    const s = new Set(selIdxs);
    let action;
    if (s.has(idx)) { s.delete(idx); action = 'deselect'; }
    else { s.add(idx); action = 'select'; }
    if (s.size === 0) { s.add(idx); action = 'select'; } // one row always selected (FIX521.2.1.1.10)
    setSelIdxs(s);
    setAnchor(idx);
    setLastAction(action); // FIX521.2.1.9: this becomes the action Shift-click replays
    if (s.has(idx)) setSelectedIdx(idx);
    else if (!s.has(selectedIdx)) setSelectedIdx(Math.min(...s));
  };

  // FIX521.2.1.9.3: one-click select-all (the header checkbox). Clicking again
  // when everything is selected collapses back to just the primary row.
  const allRowsSelected = images.length > 0 && selIdxs.size === images.length;
  const toggleSelectAll = () => {
    console.log('[sel] toggleSelectAll', { allRowsSelected, hasPendingImageEdit, selIdxs: [...selIdxs] });
    if (hasPendingImageEdit) return;
    if (allRowsSelected) {
      setSelIdxs(new Set([selectedIdx]));
      setAnchor(selectedIdx);
    } else {
      setSelIdxs(new Set(images.map((_, i) => i)));
    }
  };

  // FIX521.3.1 / FIX521.3.2: a multi-row move is only valid when the
  // selection is an unbroken block — moving a scattered selection as one
  // unit wouldn't have a sensible single "direction". null when selIdxs
  // has gaps (or is empty).
  const selBlock = (() => {
    if (selIdxs.size === 0) return null;
    const sorted = [...selIdxs].sort((a, b) => a - b);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    if (hi - lo + 1 !== sorted.length) return null;
    return { lo, hi };
  })();

  // Reorder: FIX521.3.1 (updated) — moves every row in a contiguous
  // selected block one position in `delta`'s direction (not just a
  // single row), by rotating the block against its one adjacent
  // "boundary" row. sort_order values are reassigned positionally so
  // the new order is preserved; row identities (ids) don't change.
  // PATCHes every affected folder_image row. UI is updated optimistically.
  const moveSelected = async (delta) => {
    if (hasPendingImageEdit || !selBlock) return;
    const { lo, hi } = selBlock;
    const rangeStart = delta < 0 ? lo - 1 : lo;
    const rangeEnd = delta < 0 ? hi : hi + 1;
    if (rangeStart < 0 || rangeEnd >= images.length) return;
    const range = images.slice(rangeStart, rangeEnd + 1);
    const orders = range.map((im) => im.sort_order);
    const rotated = delta < 0
      ? [...range.slice(1), range[0]] // boundary-above moves to bottom of range
      : [range[range.length - 1], ...range.slice(0, -1)]; // boundary-below moves to top
    const updated = rotated.map((im, k) => ({ ...im, sort_order: orders[k] }));
    const newImages = [...images];
    for (let k = 0; k < updated.length; k++) newImages[rangeStart + k] = updated[k];
    setImages(newImages);
    const newLo = lo + delta;
    const newHi = hi + delta;
    setSelIdxs(new Set(Array.from({ length: newHi - newLo + 1 }, (_, k) => newLo + k)));
    setSelectedIdx(selectedIdx + delta);
    setAnchor(anchor + delta);
    try {
      await Promise.all(
        updated.map((im) => updateFolderImage(im.id, { sort_order: im.sort_order })),
      );
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  // FIX521.3.3 / .3.4: Arrow-up / Arrow-down change selection (do NOT
  // reorder — the buttons do that). Only fires when focus is on the table
  // container, not when typing into an input.
  const tableRef = useRef(null);
  const onTableKeyDown = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      trySelect(selectedIdx - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      trySelect(selectedIdx + 1);
    }
  };

  // Auto-save caption / section on blur. Updating local images state is
  // done on every keystroke for snappy UI; the PATCH is debounced to blur
  // to avoid hammering the backend while the user types.
  const patchFolderImage = async (fiId, patch) => {
    try {
      await updateFolderImage(fiId, patch);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  const onCaptionChange = (fiId, value) => {
    setImages((prev) =>
      prev.map((im) => (im.id === fiId ? { ...im, caption: value } : im)),
    );
  };
  const onSectionChange = (fiId, value) => {
    setImages((prev) =>
      prev.map((im) => (im.id === fiId ? { ...im, section: value } : im)),
    );
  };

  // FIX521.2.1.1.5 / <item-main-img> + FIX521.5.6: at most one image per
  // item is the Main one. Toggling on a row sets is_main here and clears
  // it on every sibling — both locally (snappy UI) and on the server in
  // a single PATCH (the backend re-applies the same atomic clear).
  const setMain = async (fiId, value) => {
    setImages((prev) =>
      prev.map((im) =>
        im.id === fiId ? { ...im, is_main: value } : { ...im, is_main: value ? false : im.is_main },
      ),
    );
    try {
      await updateFolderImage(fiId, { is_main: value });
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  // FIX521.2.1.4: Remove all the selected images after an overlay popup
  // confirmation. Locked while a pending image edit exists (same lock pattern
  // as selection / reorder).
  const confirmRemove = async () => {
    const targets = [...selIdxs].map((i) => images[i]).filter(Boolean);
    if (targets.length === 0) { setRemoveConfirm(false); return; }
    const removedIds = new Set(targets.map((im) => im.id));
    try {
      await Promise.all(targets.map((im) => deleteFolderImage(im.id)));
      // Drop the removed rows locally and adjust selection so a row stays
      // selected (FIX521.2.1.1.10).
      const next = images.filter((im) => !removedIds.has(im.id));
      setImages(next);
      let newIdx = selectedIdx;
      if (next.length === 0) newIdx = 0;
      else if (selectedIdx >= next.length) newIdx = next.length - 1;
      setSelectedIdx(newIdx);
      setSelIdxs(new Set(next.length ? [newIdx] : []));
      setAnchor(newIdx);
      setRemoveConfirm(false);
    } catch (e) {
      setError(e.message || String(e));
      setRemoveConfirm(false);
    }
  };

  // FIX521.3.5.2: re-encode an image at a uniform scale factor f (new dims =
  // natural dims × f), keeping good JPEG quality.
  const reencodeByFactor = (url, f) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = Math.max(1, Math.round(img.naturalWidth * f));
        const h = Math.max(1, Math.round(img.naturalHeight * f));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Could not encode image')); return; }
            const fr = new FileReader();
            // Return the new pixel dims too, so the caller can store the
            // image's recomputed ZF (FIX521.5.8.1 <img-zoom-factor>).
            fr.onload = () => resolve({ base64: String(fr.result).split(',')[1], bytes: blob.size, w, h });
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          },
          'image/jpeg',
          0.9,
        );
      };
      img.onerror = () => reject(new Error('Could not load image for shrinking'));
      img.src = url;
    });

  // FIX521.3.10 <action-shrink-images>: for each selected image, check its ZF
  // (FIX521.3.10.1). FIX521.3.10.1.1: IF image ZF > <input-requested-zf> THEN
  // shrink it to end up with ZF == requested. Scaling by f = requested/current
  // makes the new ZF equal the requested value; images already at or below it
  // are left unchanged.
  const runShrink = async () => {
    const target = Number(shrinkRatio); // <input-requested-zf>
    const targets = [...selIdxs].sort((a, b) => a - b).map((i) => images[i]).filter(Boolean);
    setShrinkStage('running');
    setShrinkProgress({ done: 0, total: targets.length });
    const updates = {}; // image_id -> { url, bytes }
    try {
      for (let k = 0; k < targets.length; k++) {
        const im = targets[k];
        const cd = dimsByUrl[im.url];
        const current = cd ? zoomFactor(cd.w, cd.h) : null;
        if (current != null && current > target) {
          const f = target / current;
          const { base64, w, h } = await reencodeByFactor(im.url, f);
          const res = await replaceImageBytes(im.image_id, {
            data_base64: base64,
            content_type: 'image/jpeg',
            // FIX521.5.8.1: store the shrunk image's recomputed ZF.
            zoom_factor: zoomFactor(w, h),
          });
          updates[im.image_id] = { url: res.url, bytes: res.bytes };
        }
        setShrinkProgress({ done: k + 1, total: targets.length });
      }
      setImages((prev) =>
        prev.map((im) =>
          updates[im.image_id] ? { ...im, url: updates[im.image_id].url } : im,
        ),
      );
      // FIX521.3.10.2: reflect the new sizes in the list immediately.
      setSizesByUrl((prev) => {
        const next = { ...prev };
        for (const u of Object.values(updates)) next[u.url] = u.bytes;
        return next;
      });
      // FIX521.3.10.3: report the item's new total image bytes so the item
      // list's 'Img size' column updates (when that column is shown).
      let total = 0;
      let allKnown = true;
      for (const im of images) {
        const u = updates[im.image_id];
        const b = u ? u.bytes : sizesByUrl[im.url];
        if (b == null) { allKnown = false; break; }
        total += b;
      }
      if (allKnown) onItemBytesChange?.(total);
      setShrinkStage(null);
      setShrinkProgress(null);
    } catch (e) {
      setError(e.message || String(e));
      setShrinkStage(null);
      setShrinkProgress(null);
    }
  };

  // FIX521.3.5.1.1: the input's ghost value is the current max ZF among the
  // selected images. FIX521.3.5.1.2 / FIX521.3.5.2: the requested ZF must be
  // >= 1. No upper bound — images already at/below the requested ZF are left
  // unchanged by <action-shrink-images> (FIX521.3.10.1.1).
  const selectedZfs = [...selIdxs]
    .map((i) => images[i])
    .filter(Boolean)
    .map((im) => { const d = dimsByUrl[im.url]; return d ? zoomFactor(d.w, d.h) : null; })
    .filter((r) => r != null);
  const maxSelZf = selectedZfs.length ? Math.max(...selectedZfs) : null;
  const shrinkValid =
    shrinkRatio.trim() !== '' &&
    Number.isFinite(Number(shrinkRatio)) &&
    Number(shrinkRatio) >= 1;

  return (
    <div
      className="sc-img-list-editor"
      ref={editorRef}
      style={{ '--list-pct': `${listPct}%` }}
    >
      <div
        className="sc-img-list-pane"
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onTableKeyDown}
      >
        {/* FIX521.2.1.10 (updated): toolbar sits above the table header. */}
        <div className="sc-img-list-reorder">
          <button
            type="button"
            data-yagu-id="button-arrow-up"
            onClick={() => moveSelected(-1)}
            disabled={hasPendingImageEdit || !selBlock || selBlock.lo <= 0}
            title="Move selected image(s) up"
          >
            ↑
          </button>
          <button
            type="button"
            data-yagu-id="button-arrow-down"
            onClick={() => moveSelected(1)}
            disabled={hasPendingImageEdit || !selBlock || selBlock.hi >= images.length - 1}
            title="Move selected image(s) down"
          >
            ↓
          </button>
          {/* FIX521.2.1.4: Remove button — overlay popup confirms removing all
              selected images. */}
          <button
            type="button"
            data-yagu-id="button-remove-image"
            onClick={() => setRemoveConfirm(true)}
            disabled={hasPendingImageEdit || selIdxs.size === 0}
            title="Remove selected image(s)"
          >
            Remove
          </button>
          {/* FIX521.2.1.5 <button-shrink-image-list>: shrink selected image(s).
              Enabled when 1+ rows are selected (FIX521.2.1.5.1). */}
          <button
            type="button"
            data-yagu-id="button-shrink-image-list"
            onClick={() => { setShrinkRatio(''); setShrinkStage('input'); }}
            disabled={hasPendingImageEdit || selIdxs.size === 0}
            title="Shrink selected image(s)"
          >
            Shrink
          </button>
          {/* FIX521.2.1.6 <button-file-details>: toggle, off by default. */}
          <button
            type="button"
            data-yagu-id="button-file-details"
            className={fileDetailsOpen ? 'active' : ''}
            aria-pressed={fileDetailsOpen}
            onClick={() => setFileDetailsOpen((v) => !v)}
            title="Show file name, size, resolution and zoom factor"
          >
            File details
          </button>
          <button
            type="button"
            className="sc-img-list-done"
            onClick={onExitEdit}
            disabled={hasPendingImageEdit}
            title="Done editing"
          >
            Done
          </button>
        </div>
        {/* FIX521.2.1.1.11 / FIX521.2.1.1.12: a scrolling wrapper holds
            the whole table — <table> itself doesn't honor overflow, so
            without this the rows would either spill past the panel
            (no scrollbar) or push the layout. tbody rows have a fixed
            height (FIX521.2.1.1.11) so a long caption can't make one
            row taller than the others. */}
        <div className="sc-img-list-scroll">
        <table className="sc-img-list-table" data-yagu-id="table-item-img-info">
          <thead>
            <tr>
              {/* FIX521.2.1.9.2 / .9.3: leftmost select column with a select-all
                  checkbox in the header. */}
              <th style={{ textAlign: 'center' }} title="Select all rows">
                <input
                  type="checkbox"
                  data-yagu-id="select-all-rows"
                  checked={allRowsSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selIdxs.size > 0 && !allRowsSelected;
                  }}
                  onChange={toggleSelectAll}
                  disabled={hasPendingImageEdit || images.length === 0}
                />
              </th>
              {/* FIX521.2.1.12: column order — Section, Caption, Main. File
                  name/size/Resolution/Zoom factor moved out of the header
                  (FIX521.2.1.1.13): they're now an unlabeled detail line
                  per row, shown only via <button-file-details>. */}
              <th>Section</th>
              <th>Caption</th>
              {/* FIX521.2.1.1.5 / <item-main-img>: per-row Main flag.
                  At most one is set per item (FIX521.5.6). */}
              <th title="Main image of the item">Main</th>
              {/* FIX610.3.10: Status column, local-app only. */}
              {isLocalApp && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {images.map((im, idx) => {
              const isSelected = selIdxs.has(idx);
              const dimsZ = dimsByUrl[im.url];
              const zf = dimsZ ? zoomFactor(dimsZ.w, dimsZ.h) : null; // FIX521.2.1.1.7
              // FIX521.2.1.1.13: zebra striping now keys off the image
              // index (one card per image) rather than tbody's nth-child
              // (which would misalign once some cards render 2 <tr>s and
              // others render 1).
              const parity = idx % 2 === 0 ? 'even' : 'odd';
              const rowClass = `${parity}${isSelected ? ' selected' : ''}`;
              return (
                <Fragment key={im.id}>
                  <tr
                    className={rowClass}
                    onClick={(e) => onRowClick(e, idx)}
                  >
                    {/* FIX521.2.1.9.2: easy row selection via a toggle BUTTON
                        (not a checkbox) so it is visually distinct from the Main
                        checkbox on the same row, which is real data. Plain click
                        toggles the row in/out; Shift-click extends a range from
                        the anchor. Clean button target — no text-input interference. */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`sc-row-select-toggle${isSelected ? ' on' : ''}`}
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('[sel] toggleButton', { idx, shift: e.shiftKey, ctrl: e.ctrlKey, isSelected });
                          if (e.shiftKey || e.ctrlKey || e.metaKey) onRowClick(e, idx);
                          else toggleRowSelect(idx);
                        }}
                        disabled={hasPendingImageEdit}
                        title={isSelected ? 'Selected — click to deselect (Shift-click for a range)' : 'Select this row (Shift-click for a range)'}
                      >
                        {isSelected ? '✓' : ''}
                      </button>
                    </td>
                    {/* FIX521.2.1.12: order — Section, Caption, Main. */}
                    <td>
                      <input
                        type="text"
                        value={im.section ?? ''}
                        onChange={(e) => onSectionChange(im.id, e.target.value)}
                        onBlur={(e) =>
                          patchFolderImage(im.id, { section: e.target.value || null })
                        }
                        onFocus={() => focusRowPrimary(idx)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={im.caption ?? ''}
                        onChange={(e) => onCaptionChange(im.id, e.target.value)}
                        onBlur={(e) =>
                          patchFolderImage(im.id, { caption: e.target.value || null })
                        }
                        onFocus={() => focusRowPrimary(idx)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        data-yagu-id="item-main-img"
                        type="checkbox"
                        checked={!!im.is_main}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setMain(im.id, e.target.checked)}
                        title="Use as the item's main image"
                      />
                    </td>
                    {/* FIX610.3.10: Status column — '', 'Added' or 'Removed'. */}
                    {isLocalApp && <td className="sc-img-list-status">{im.status || ''}</td>}
                  </tr>
                  {/* FIX521.2.1.1.13: card line 2 — unlabeled File name /
                      File Size / Resolution / Zoom factor, shown only when
                      <button-file-details> is on. */}
                  {fileDetailsOpen && (
                    <tr
                      className={`${rowClass} sc-img-list-detail-row`}
                      onClick={(e) => onRowClick(e, idx)}
                    >
                      {/* Blank cell under the select column — the detail
                          line spreads from under Section, not the row
                          selector. */}
                      <td></td>
                      <td colSpan={isLocalApp ? 4 : 3} className="sc-img-list-detail-cell">
                        {/* FIX521.2.1.1.1: File name (read-only). */}
                        <span className="filename" title={im.filename}>
                          {im.filename ?? ''}
                        </span>
                        {/* FIX521.2.1.1.2: File Size (read-only). */}
                        <span className="filesize">{formatBytes(sizesByUrl[im.url])}</span>
                        {/* FIX521.2.1.1.6: Resolution (read-only). */}
                        <span className="filesize">
                          {dimsByUrl[im.url]
                            ? `${dimsByUrl[im.url].w} × ${dimsByUrl[im.url].h}`
                            : '…'}
                        </span>
                        {/* FIX521.2.1.1.7: Zoom factor (read-only) — vs Reference Viewport. */}
                        <span className="filesize">
                          {zf == null ? '…' : zf.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {images.length === 0 && (
              <tr>
                <td colSpan={isLocalApp ? 5 : 4} className="empty">No images in this item.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* FIX521.2.1.11 / FIX521.2.1.11.2: drag to resize; the image pane (and
          the image inside it) squeezes/expands with the splitter. */}
      <div
        className="sc-img-list-splitter"
        onMouseDown={onSplitterDown}
        title="Drag to resize"
      />

      <div className="sc-img-list-editor-pane">
        {currentImage ? (
          <>
            <div className="sc-viewer-toolbox">
              <button
                type="button"
                data-yagu-id="button-crop"
                className={cropMode ? 'active' : ''}
                disabled={!currentImage}
                onClick={() => setCropMode((v) => !v)}
              >
                {cropMode ? 'Cropping…' : 'Crop'}
              </button>
              <button
                type="button"
                data-yagu-id="button-adjust-crop"
                disabled
                title="Adjust-crop drag handles not yet implemented"
              >
                Adjust crop
              </button>
              <input
                type="range"
                min="-45"
                max="45"
                defaultValue="0"
                disabled
                data-yagu-id="slider-rotate"
                title="Slider rotation not yet implemented"
              />
              <button
                type="button"
                data-yagu-id="button-rotate270"
                disabled={!currentImage}
                onClick={() => rotateBy(-90)}
                title="Rotate −90°"
              >
                ⟲
              </button>
              <button
                type="button"
                data-yagu-id="button-rotate90"
                disabled={!currentImage}
                onClick={() => rotateBy(90)}
                title="Rotate +90°"
              >
                ⟳
              </button>
              <button
                type="button"
                disabled={!currentImage || !draftForCurrent}
                onClick={resetImage}
                title="Reset rotation & crop"
              >
                Reset
              </button>
            </div>
            <div className="sc-viewer-img-wrap">
              <ShowcaseImageCanvas
                url={currentImage.url}
                rotation={effectiveRotation}
                crop={effectiveCrop}
                cropMode={cropMode}
                onCropComplete={onCropComplete}
                className="sc-viewer-img"
              />
              {currentImage.caption && (
                <div className="sc-viewer-caption">{currentImage.caption}</div>
              )}
            </div>
            <footer className="sc-viewer-edit-footer">
              <button
                type="button"
                onClick={cancelImageEdit}
                disabled={savingImage || !draftForCurrent}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={saveImageEdit}
                disabled={savingImage || !draftForCurrent}
                title={draftForCurrent ? 'Save changes' : 'No changes to save'}
              >
                {savingImage ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </>
        ) : (
          <div className="sc-viewer-empty">No image selected.</div>
        )}
        {error && <div className="sc-viewer-err">{error}</div>}
      </div>

      {/* FIX521.2.1.4: overlay popup confirming removal of all selected images */}
      {removeConfirm && (
        <div className="setup-overlay" onMouseDown={() => setRemoveConfirm(false)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>Remove {selIdxs.size} images</p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setRemoveConfirm(false)}>Cancel</button>
              <button type="button" className="primary" onClick={confirmRemove}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX521.3.5: <button-shrink-image-list> opens this overlay popup. */}
      {shrinkStage === 'input' && (
        <div className="setup-overlay" onMouseDown={() => setShrinkStage(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            {/* FIX521.3.5.1: input field 'Image max zoom factor'. */}
            <label className="sc-shrink-row">
              Image max zoom factor
              <input
                type="text"
                autoFocus
                data-yagu-id="input-requested-zf" /* FIX521.3.5.1.0 */
                value={shrinkRatio}
                /* FIX521.3.5.1.1: ghost value (italic) = current max ZF. */
                placeholder={maxSelZf != null ? maxSelZf.toFixed(2) : ''}
                /* FIX521.3.5.1.2: input does not allow a value < 1. */
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || !(Number(v) < 1)) setShrinkRatio(v);
                }}
              />
            </label>
            {/* FIX521.3.5.2 */}
            <div className="sc-shrink-hint">value must be &gt;=1</div>
            <div className="sc-shrink-actions">
              {/* FIX521.3.5.3 */}
              <button type="button" onClick={() => setShrinkStage(null)}>Cancel</button>
              {/* FIX521.3.5.4 → FIX521.3.5.4.1 confirmation popup */}
              <button
                type="button"
                className="primary"
                disabled={!shrinkValid}
                onClick={() => setShrinkStage('confirm')}
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX521.3.5.4.1: confirmation overlay popup */}
      {shrinkStage === 'confirm' && (
        <div className="setup-overlay" onMouseDown={() => setShrinkStage(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>BEWARE. Shrinking the {selIdxs.size} images cannot be undone.</p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setShrinkStage(null)}>Cancel</button>
              {/* FIX521.3.5.4.2: on 'Confirm' do <action-shrink-images> */}
              <button type="button" className="primary" onClick={runShrink}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {shrinkStage === 'running' && (
        <div className="setup-overlay">
          <div className="sc-shrink-box">
            <p>Shrinking… {shrinkProgress?.done ?? 0}/{shrinkProgress?.total ?? 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}
