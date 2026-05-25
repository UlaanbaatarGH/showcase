import { useEffect, useRef, useState } from 'react';
import ShowcaseImageCanvas from './ShowcaseImageCanvas.jsx';
import { updateImage, updateFolderImage, deleteFolderImage, replaceImageBytes } from '../data/backend.js';

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
}) {
  const currentImage = images[selectedIdx] ?? null;

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

  // FIX521.3.5: Shrink flow. stage: 'input' (size %), 'confirm' (cannot be
  // undone), 'running' (progress). pct is the target size percentage.
  const [shrinkStage, setShrinkStage] = useState(null);
  const [shrinkPct, setShrinkPct] = useState('80');
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

  // FIX521.2.1.1.6 (Resolution) / FIX521.2.1.1.7 (Disp. Ratio): natural pixel
  // dimensions per image, probed once per URL. Reading dimensions doesn't
  // taint anything, so no crossOrigin needed. Value: { w, h } or null.
  const [dimsByUrl, setDimsByUrl] = useState({});
  useEffect(() => {
    let cancelled = false;
    const pending = images.map((im) => im.url).filter((u) => u && !(u in dimsByUrl));
    if (pending.length === 0) return undefined;
    for (const url of pending) {
      const probe = new Image();
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

  // FIX521.2.1.1.7 (updated): the reference is the size the image takes when
  // displayed FULL in the browser page (fullscreen contain-fit), captured when
  // the page opens. Disp. ratio = natural pixels / fullscreen-displayed pixels.
  // The image scales uniformly, so that factor is max(w/winW, h/winH).
  const [viewport] = useState(() =>
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 0, h: 0 },
  );

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
    if (hasPendingImageEdit) return;
    if (nextIdx < 0 || nextIdx >= images.length) return;
    setSelectedIdx(nextIdx);
    setSelIdxs(new Set([nextIdx]));
    setAnchor(nextIdx);
  };

  // FIX521.2.1.9: plain click selects one; Ctrl/Cmd-click toggles a row;
  // Shift-click selects the range from the anchor. The clicked row becomes the
  // primary (drives the editor). Blocked while an image edit is pending.
  const onRowClick = (e, idx) => {
    if (hasPendingImageEdit) return;
    if (e.shiftKey) {
      const lo = Math.min(anchor, idx);
      const hi = Math.max(anchor, idx);
      const s = new Set();
      for (let i = lo; i <= hi; i++) s.add(i);
      setSelIdxs(s);
      setSelectedIdx(idx);
    } else if (e.ctrlKey || e.metaKey) {
      const s = new Set(selIdxs);
      if (s.has(idx)) s.delete(idx);
      else s.add(idx);
      if (s.size === 0) s.add(idx); // one row always selected (FIX521.2.1.1.10)
      setSelIdxs(s);
      setAnchor(idx);
      setSelectedIdx(idx);
    } else {
      trySelect(idx);
    }
  };

  // Reorder: swap sort_order between selected row and its neighbour,
  // then PATCH both folder_image rows. UI is updated optimistically.
  const moveSelected = async (delta) => {
    if (hasPendingImageEdit) return;
    const i = selectedIdx;
    const j = i + delta;
    if (j < 0 || j >= images.length) return;
    const a = images[i];
    const b = images[j];
    if (!a || !b) return;
    const swapped = [...images];
    swapped[i] = { ...b, sort_order: a.sort_order };
    swapped[j] = { ...a, sort_order: b.sort_order };
    setImages(swapped);
    setSelectedIdx(j);
    setSelIdxs(new Set([j]));
    setAnchor(j);
    try {
      await Promise.all([
        updateFolderImage(a.id, { sort_order: b.sort_order }),
        updateFolderImage(b.id, { sort_order: a.sort_order }),
      ]);
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

  // FIX521.2.1.4: Remove the selected image after a confirmation prompt.
  // Locked while a pending image edit exists (same lock pattern as
  // selection / reorder).
  const removeSelected = async () => {
    if (hasPendingImageEdit) return;
    const im = images[selectedIdx];
    if (!im) return;
    const ok = window.confirm(
      `Remove "${im.filename ?? 'this image'}" from this item?\n\n` +
      `If no other item references the underlying file, the file will also be deleted from storage.`,
    );
    if (!ok) return;
    try {
      await deleteFolderImage(im.id);
      // Drop the row locally and adjust selection so a row stays selected
      // (FIX521.2.1.1.10).
      const next = images.filter((_, idx) => idx !== selectedIdx);
      setImages(next);
      let newIdx = selectedIdx;
      if (next.length === 0) newIdx = 0;
      else if (selectedIdx >= next.length) newIdx = next.length - 1;
      setSelectedIdx(newIdx);
      setSelIdxs(new Set(next.length ? [newIdx] : []));
      setAnchor(newIdx);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  // FIX521.3.5.2: re-encode an image to roughly `pct`% of its byte size. JPEG
  // size scales ~ with pixel area, so scaling each side by sqrt(pct/100)
  // targets pct% of the bytes while keeping good quality.
  const reencodeToPercent = (url, pct) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const linear = Math.sqrt(Math.max(1, Math.min(100, pct)) / 100);
        const w = Math.max(1, Math.round(img.naturalWidth * linear));
        const h = Math.max(1, Math.round(img.naturalHeight * linear));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Could not encode image')); return; }
            const fr = new FileReader();
            fr.onload = () => resolve({ base64: String(fr.result).split(',')[1], bytes: blob.size });
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

  // FIX521.3.5.2 / FIX521.3.5.3: shrink every selected image, repoint each to
  // its new bytes, and refresh the displayed sizes.
  const runShrink = async () => {
    const pct = Number(shrinkPct);
    const targets = [...selIdxs].sort((a, b) => a - b).map((i) => images[i]).filter(Boolean);
    setShrinkStage('running');
    setShrinkProgress({ done: 0, total: targets.length });
    const updates = {}; // image_id -> { url, bytes }
    try {
      for (let k = 0; k < targets.length; k++) {
        const im = targets[k];
        const { base64 } = await reencodeToPercent(im.url, pct);
        const res = await replaceImageBytes(im.image_id, {
          data_base64: base64,
          content_type: 'image/jpeg',
        });
        updates[im.image_id] = { url: res.url, bytes: res.bytes };
        setShrinkProgress({ done: k + 1, total: targets.length });
      }
      setImages((prev) =>
        prev.map((im) =>
          updates[im.image_id] ? { ...im, url: updates[im.image_id].url } : im,
        ),
      );
      // FIX521.3.5.3: reflect the new sizes in the list immediately.
      setSizesByUrl((prev) => {
        const next = { ...prev };
        for (const u of Object.values(updates)) next[u.url] = u.bytes;
        return next;
      });
      setShrinkStage(null);
      setShrinkProgress(null);
    } catch (e) {
      setError(e.message || String(e));
      setShrinkStage(null);
      setShrinkProgress(null);
    }
  };

  return (
    <div className="sc-img-list-editor">
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
            disabled={hasPendingImageEdit || selectedIdx <= 0}
            title="Move selected image up"
          >
            ↑
          </button>
          <button
            type="button"
            data-yagu-id="button-arrow-down"
            onClick={() => moveSelected(1)}
            disabled={hasPendingImageEdit || selectedIdx >= images.length - 1}
            title="Move selected image down"
          >
            ↓
          </button>
          {/* FIX521.2.1.4: Remove button — confirms with the user. */}
          <button
            type="button"
            data-yagu-id="button-remove-image"
            onClick={removeSelected}
            disabled={hasPendingImageEdit || images.length === 0}
            title="Remove selected image"
          >
            Remove
          </button>
          {/* FIX521.2.1.5 <button-shrink-image-list>: shrink selected image(s).
              Enabled when 1+ rows are selected (FIX521.2.1.5.1). */}
          <button
            type="button"
            data-yagu-id="button-shrink-image-list"
            onClick={() => { setShrinkPct('80'); setShrinkStage('input'); }}
            disabled={hasPendingImageEdit || selIdxs.size === 0}
            title="Shrink selected image(s)"
          >
            Shrink
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
              {/* FIX521.2.1.12: column order — Section, Caption, Main, File name,
                  File size, Resolution, Disp. ratio. */}
              <th>Section</th>
              <th>Caption</th>
              {/* FIX521.2.1.1.5 / <item-main-img>: per-row Main flag.
                  At most one is set per item (FIX521.5.6). */}
              <th title="Main image of the item">Main</th>
              <th>File name</th>
              <th>File Size</th>
              {/* FIX521.2.1.1.6: pixel width × height, read-only. */}
              <th>Resolution</th>
              {/* FIX521.2.1.1.7: image pixels ÷ pixels when shown full, read-only. */}
              <th title="Image pixels ÷ pixels when shown fullscreen (at page open)">Disp. ratio</th>
            </tr>
          </thead>
          <tbody>
            {images.map((im, idx) => {
              const isSelected = selIdxs.has(idx);
              return (
                <tr
                  key={im.id}
                  className={isSelected ? 'selected' : ''}
                  onClick={(e) => onRowClick(e, idx)}
                >
                  {/* FIX521.2.1.12: order — Section, Caption, Main, File name,
                      File size, Resolution, Disp. ratio. */}
                  <td>
                    <input
                      type="text"
                      value={im.section ?? ''}
                      onChange={(e) => onSectionChange(im.id, e.target.value)}
                      onBlur={(e) =>
                        patchFolderImage(im.id, { section: e.target.value || null })
                      }
                      onFocus={() => trySelect(idx)}
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
                      onFocus={() => trySelect(idx)}
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
                  <td className="filename" title={im.filename}>
                    {im.filename ?? ''}
                  </td>
                  <td className="filesize">{formatBytes(sizesByUrl[im.url])}</td>
                  {/* FIX521.2.1.1.6: Resolution (read-only) */}
                  <td className="filesize">
                    {dimsByUrl[im.url]
                      ? `${dimsByUrl[im.url].w} × ${dimsByUrl[im.url].h}`
                      : '…'}
                  </td>
                  {/* FIX521.2.1.1.7: Disp. ratio (read-only) — vs fullscreen display */}
                  <td className="filesize">
                    {dimsByUrl[im.url] && viewport.w && viewport.h
                      ? Math.max(
                          dimsByUrl[im.url].w / viewport.w,
                          dimsByUrl[im.url].h / viewport.h,
                        ).toFixed(2)
                      : '…'}
                  </td>
                </tr>
              );
            })}
            {images.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">No images in this item.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

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

      {/* FIX521.3.5: size-% prompt */}
      {shrinkStage === 'input' && (
        <div className="setup-overlay" onMouseDown={() => setShrinkStage(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <label className="sc-shrink-row">
              Image size %
              <input
                type="text"
                autoFocus
                value={shrinkPct}
                onChange={(e) => setShrinkPct(e.target.value)}
              />
            </label>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setShrinkStage(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!(Number(shrinkPct) > 0 && Number(shrinkPct) <= 100)}
                onClick={() => setShrinkStage('confirm')}
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX521.3.5.1: cannot-be-undone confirmation */}
      {shrinkStage === 'confirm' && (
        <div className="setup-overlay" onMouseDown={() => setShrinkStage(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>Beware, shrinking images cannot be undone.</p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setShrinkStage(null)}>Cancel</button>
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
