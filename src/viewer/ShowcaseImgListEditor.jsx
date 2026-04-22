import { useEffect, useRef, useState } from 'react';
import ShowcaseImageCanvas from './ShowcaseImageCanvas.jsx';
import { updateImage, updateFolderImage } from '../data/backend.js';

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
  const trySelect = (nextIdx) => {
    if (hasPendingImageEdit) return;
    if (nextIdx < 0 || nextIdx >= images.length) return;
    setSelectedIdx(nextIdx);
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

  return (
    <div className="sc-img-list-editor">
      <div
        className="sc-img-list-pane"
        ref={tableRef}
        tabIndex={0}
        onKeyDown={onTableKeyDown}
      >
        <table className="sc-img-list-table" data-yagu-id="table-item-img-info">
          <thead>
            <tr>
              <th>File name</th>
              <th>File Size</th>
              <th>Caption</th>
              <th>Section</th>
            </tr>
          </thead>
          <tbody>
            {images.map((im, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <tr
                  key={im.id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => trySelect(idx)}
                >
                  <td className="filename" title={im.filename}>
                    {im.filename ?? ''}
                  </td>
                  <td className="filesize">{formatBytes(sizesByUrl[im.url])}</td>
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
                </tr>
              );
            })}
            {images.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">No images in this item.</td>
              </tr>
            )}
          </tbody>
        </table>
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
    </div>
  );
}
