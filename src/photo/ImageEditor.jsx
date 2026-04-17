/**
 * FIX501.4 — Image Editor
 * Canvas-based image viewer with crop + rotation.
 * Metadata stored as sidecar .meta.json; non-destructive and destructive save.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './ImageEditor.css';

const SERVER_URL = 'http://localhost:3001';

// ── Metadata helpers ─────────────────────────────────────────────────────────

function metaPath(imagePath) {
  return imagePath + '.meta.json';
}

const DEFAULT_META = { crop: null, rotation: 0 };

async function loadMeta(imagePath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(metaPath(imagePath))}`);
    if (!res.ok) return { ...DEFAULT_META };
    const data = await res.json();
    if (!data.content) return { ...DEFAULT_META };
    return { ...DEFAULT_META, ...JSON.parse(data.content) };
  } catch { return { ...DEFAULT_META }; }
}

async function saveMeta(imagePath, meta) {
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: metaPath(imagePath), content: JSON.stringify(meta, null, 2) }),
  });
}

function imageUrl(filePath) {
  return `${SERVER_URL}/agent/dir/image?path=${encodeURIComponent(filePath)}`;
}

async function fetchFileSize(filePath) {
  try {
    const r = await fetch(`${SERVER_URL}/file/stat?path=${encodeURIComponent(filePath)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.exists ? d.size : null;
  } catch {
    return null;
  }
}

function formatSize(bytes) {
  if (bytes == null) return '…';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Shrink defaults — targets a web-friendly size for typical book-page scans.
const SHRINK_MAX_EDGE = 2000;
const SHRINK_QUALITY = 0.82;

// ── ImageEditor component ────────────────────────────────────────────────────

export default function ImageEditor({ imagePath, onRefresh, moveToNext = false, onMoveToNextChange, onAfterSave, readOnly = false }) {
  const canvasRef = useRef(null);
  const areaRef = useRef(null);
  const imgRef = useRef(null); // holds the HTMLImageElement

  // State
  const [meta, setMeta] = useState({ ...DEFAULT_META });
  const [savedMeta, setSavedMeta] = useState({ ...DEFAULT_META }); // last-saved state
  const [imgLoaded, setImgLoaded] = useState(false);
  const [rotation, setRotation] = useState(0); // fine slider: -45..+45
  const [rotation90, setRotation90] = useState(0); // accumulated ±90 steps
  // Crop rect in rotated-image pixel coordinates
  const [cropRect, setCropRect] = useState(null); // { x, y, w, h }
  // FIX501.4.3.1: Two-click crop mode
  const [cropClicking, setCropClicking] = useState(false); // waiting for clicks
  const [cropClickCorner, setCropClickCorner] = useState(null); // first click { x, y } in rotated-image coords
  const [cropMousePos, setCropMousePos] = useState(null); // live mouse pos for preview rect
  // FIX501.4.3.9: Adjust crop mode (toggle, shows full image + drag handles)
  const [adjustCropActive, setAdjustCropActive] = useState(false);
  const [dragging, setDragging] = useState(null); // { handle, startX, startY, startRect }
  // Cache bust for reload after destructive save
  const [cacheBust, setCacheBust] = useState(0);
  // FIX501.4.3.20: right-click context menu on the edited image
  const [imgContextMenu, setImgContextMenu] = useState(null); // { x, y }
  // Disk size of the image being edited (bytes). Refreshed on load and after save/shrink.
  const [fileSize, setFileSize] = useState(null);

  const totalRotation = rotation90 + rotation;
  const hasChanges = cropRect !== null || totalRotation !== 0;

  // ── Load image + metadata when imagePath changes ─────────────────────────
  useEffect(() => {
    if (!imagePath) { setImgLoaded(false); return; }
    setImgLoaded(false);
    setCropClicking(false);
    setCropClickCorner(null);
    setCropMousePos(null);
    setAdjustCropActive(false);
    setCropRect(null);
    setRotation(0);
    setRotation90(0);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl(imagePath) + '&t=' + cacheBust;

    loadMeta(imagePath).then(m => {
      setMeta(m);
      setSavedMeta(m);
      setRotation(m.rotation % 90 || 0); // fine component
      setRotation90(Math.round(m.rotation / 90) * 90); // 90° component
      if (m.crop) setCropRect({ ...m.crop });
    });
    fetchFileSize(imagePath).then(setFileSize);
  }, [imagePath, cacheBust]);

  // ── Render canvas ────────────────────────────────────────────────────────
  // Two-step: rotate the full image, then crop from the rotated result.
  // Crop rect is in rotated-image coordinates.
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const area = areaRef.current;
    if (!canvas || !img || !area || !imgLoaded) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const rad = (totalRotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rw = iw * cos + ih * sin;
    const rh = iw * sin + ih * cos;

    // Crop rect in rotated-image coords
    const cx = cropRect?.x ?? 0;
    const cy = cropRect?.y ?? 0;
    const cw = cropRect?.w ?? rw;
    const ch = cropRect?.h ?? rh;

    // Fit cropped region into available area
    const areaW = area.clientWidth;
    const areaH = area.clientHeight;
    const scale = Math.min(1, areaW / cw, areaH / ch);

    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // Translate so the crop region maps to (0,0)
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    // Draw the rotated full image (centered in its rotated bounding box)
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }, [imgLoaded, cropRect, totalRotation]);

  // Compute the rotated image dimensions (used by crop mode and handle drag)
  const getRotatedDims = useCallback(() => {
    const img = imgRef.current;
    if (!img) return { rw: 0, rh: 0 };
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const rad = (totalRotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return { rw: iw * cos + ih * sin, rh: iw * sin + ih * cos };
  }, [totalRotation]);

  // When crop mode is active, render the rotated full image (no crop) so user can place the crop rectangle
  const renderCropMode = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const area = areaRef.current;
    if (!canvas || !img || !area || !imgLoaded) return;

    const ctx = canvas.getContext('2d');
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const { rw, rh } = getRotatedDims();

    const areaW = area.clientWidth;
    const areaH = area.clientHeight;
    const scale = Math.min(1, areaW / rw, areaH / rh);

    canvas.width = Math.round(rw * scale);
    canvas.height = Math.round(rh * scale);

    const rad = (totalRotation * Math.PI) / 180;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }, [imgLoaded, totalRotation, getRotatedDims]);

  // Show full rotated image during crop clicking or adjust crop; otherwise show cropped result
  const showFullImage = cropClicking || adjustCropActive;
  // renderTick: force a second render after canvas resize so SVG overlay reads correct dims
  const [, setRenderTick] = useState(0);
  useEffect(() => {
    if (showFullImage) renderCropMode();
    else renderCanvas();
    setRenderTick(t => t + 1);
  }, [showFullImage, renderCropMode, renderCanvas]);

  // Also re-render on resize
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (showFullImage) renderCropMode();
      else renderCanvas();
    });
    if (areaRef.current) obs.observe(areaRef.current);
    return () => obs.disconnect();
  }, [renderCanvas, renderCropMode, showFullImage]);

  // ── Crop rectangle in screen coordinates ─────────────────────────────────
  // Map image-pixel crop rect to screen coordinates relative to canvas
  const getCropScreenRect = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cropRect) return null;

    const { rw, rh } = getRotatedDims();
    if (rw === 0 || rh === 0) return null;
    // Crop rect is in rotated-image pixel coords; map to canvas screen coords
    const scaleX = canvas.width / rw;
    const scaleY = canvas.height / rh;
    return {
      x: cropRect.x * scaleX,
      y: cropRect.y * scaleY,
      w: cropRect.w * scaleX,
      h: cropRect.h * scaleY,
    };
  };

  // ── Crop handle drag ─────────────────────────────────────────────────────
  const HANDLE_SIZE = 8;

  const handleMouseDown = (handle, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ handle, startX: e.clientX, startY: e.clientY, startRect: { ...cropRect } });
  };

  useEffect(() => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { rw, rh } = getRotatedDims();
    const scaleX = canvas.width / rw;
    const scaleY = canvas.height / rh;

    const onMove = (e) => {
      const dx = (e.clientX - dragging.startX) / scaleX;
      const dy = (e.clientY - dragging.startY) / scaleY;
      const r = dragging.startRect;
      let { x, y, w, h } = r;

      const handle = dragging.handle;
      if (handle === 'move') {
        x = Math.max(0, Math.min(rw - w, r.x + dx));
        y = Math.max(0, Math.min(rh - h, r.y + dy));
      } else {
        // Resize handles
        if (handle.includes('w')) { x = Math.max(0, Math.min(r.x + r.w - 20, r.x + dx)); w = r.w - (x - r.x); }
        if (handle.includes('e')) { w = Math.max(20, Math.min(rw - r.x, r.w + dx)); }
        if (handle.includes('n')) { y = Math.max(0, Math.min(r.y + r.h - 20, r.y + dy)); h = r.h - (y - r.y); }
        if (handle.includes('s')) { h = Math.max(20, Math.min(rh - r.y, r.h + dy)); }
      }

      setCropRect({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };

    const onUp = () => setDragging(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  // ── Actions ──────────────────────────────────────────────────────────────

  // FIX501.4.3.1: Two-click crop — push button enters click mode
  const handleCropClick = () => {
    setCropClicking(true);
    setCropClickCorner(null);
    setCropMousePos(null);
    setAdjustCropActive(false);
  };

  // Convert a mouse event on the canvas area to rotated-image pixel coordinates
  const mouseToImageCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { rw, rh } = getRotatedDims();
    const x = ((e.clientX - rect.left) / rect.width) * rw;
    const y = ((e.clientY - rect.top) / rect.height) * rh;
    return { x: Math.round(Math.max(0, Math.min(rw, x))), y: Math.round(Math.max(0, Math.min(rh, y))) };
  };

  // Is an event inside the canvas (image) bounding box?
  const isInsideCanvas = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const r = canvas.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  // FIX501.4.3.1.1: Mouse tracking during crop mode
  // Step 1: crosshair follows mouse before first click
  // Step 2: preview rectangle follows mouse after first click
  // FIX501.4.3.1.1.2.2 / FIX501.4.3.1.1.3.2: only update cropMousePos while the cursor is
  // inside the image; when it leaves, keep the last in-image position so a click outside
  // can fall back to it.
  const handleAreaMouseMove = (e) => {
    if (!cropClicking) return;
    if (!isInsideCanvas(e)) return;
    const pos = mouseToImageCoords(e);
    if (pos) setCropMousePos(pos);
  };

  // FIX501.4.3.20: right-click on the edited image opens context menu (not during crop mode)
  const handleImageContextMenu = (e) => {
    if (cropClicking || adjustCropActive) return;
    if (!isInsideCanvas(e)) return;
    e.preventDefault();
    setImgContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Close on outside click
  useEffect(() => {
    if (!imgContextMenu) return;
    const close = () => setImgContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [imgContextMenu]);

  // FIX501.4.3.21: ESC quits Crop mode if active
  useEffect(() => {
    if (!cropClicking) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCropClicking(false);
        setCropClickCorner(null);
        setCropMousePos(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cropClicking]);

  // Click during two-click crop — accepts clicks anywhere in the canvas area
  const handleAreaClick = (e) => {
    if (!cropClicking) return;
    // FIX501.4.3.1.1.2.2 / FIX501.4.3.1.1.3.2: outside image → use last tracked in-image position
    const pos = isInsideCanvas(e) ? mouseToImageCoords(e) : cropMousePos;
    if (!pos) return;

    if (!cropClickCorner) {
      setCropClickCorner(pos);
    } else {
      // Second click — sort corners so rect always has positive dimensions
      const x1 = Math.min(cropClickCorner.x, pos.x);
      const y1 = Math.min(cropClickCorner.y, pos.y);
      const x2 = Math.max(cropClickCorner.x, pos.x);
      const y2 = Math.max(cropClickCorner.y, pos.y);
      if (x2 - x1 < 10 || y2 - y1 < 10) return; // too small — ignore
      setCropRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      setCropClicking(false);
      setCropClickCorner(null);
      setCropMousePos(null);
    }
  };

  // Get the live preview rect for two-click crop (screen coords)
  // Works in any direction — corners are sorted so rect always has positive w/h
  const getCropPreviewScreenRect = () => {
    if (!cropClickCorner || !cropMousePos) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { rw, rh } = getRotatedDims();
    if (rw === 0) return null;
    const scaleX = canvas.width / rw;
    const scaleY = canvas.height / rh;
    const x1 = Math.min(cropClickCorner.x, cropMousePos.x);
    const y1 = Math.min(cropClickCorner.y, cropMousePos.y);
    const x2 = Math.max(cropClickCorner.x, cropMousePos.x);
    const y2 = Math.max(cropClickCorner.y, cropMousePos.y);
    return {
      x: x1 * scaleX, y: y1 * scaleY,
      w: (x2 - x1) * scaleX, h: (y2 - y1) * scaleY,
    };
  };

  // FIX501.4.3.9: Adjust Crop toggle
  const handleToggleAdjustCrop = () => {
    if (adjustCropActive) {
      // Turning OFF
      if (cropRect) {
        const { rw, rh } = getRotatedDims();
        const isFullImage = cropRect.x === 0 && cropRect.y === 0
          && Math.abs(cropRect.w - rw) < 1 && Math.abs(cropRect.h - rh) < 1;
        if (!isFullImage) {
          if (!confirm('Apply crop?')) {
            setCropRect(savedMeta.crop ? { ...savedMeta.crop } : null);
          }
        }
      }
      setAdjustCropActive(false);
    } else {
      // Turning ON — initialize crop rect to current or full image
      if (!cropRect) {
        const { rw, rh } = getRotatedDims();
        if (rw > 0) setCropRect({ x: 0, y: 0, w: Math.round(rw), h: Math.round(rh) });
      }
      setCropClicking(false);
      setAdjustCropActive(true);
    }
  };

  // FIX501.4.4.1: Reset
  const handleReset = () => {
    setCropRect(null);
    setRotation(0);
    setRotation90(0);
    setCropClicking(false);
    setCropClickCorner(null);
    setAdjustCropActive(false);
  };

  // FIX501.4.3.5: Fine rotation from slider
  const handleSliderChange = (e) => {
    setRotation(Number(e.target.value));
  };

  // FIX501.4.3.6 / FIX501.4.3.7: ±90° rotation
  const handleRotate90 = (delta) => {
    setRotation90(prev => prev + delta);
  };

  // FIX501.4.2.2: Cancel
  const handleCancel = () => {
    // Restore to saved metadata
    if (savedMeta.crop) setCropRect({ ...savedMeta.crop });
    else setCropRect(null);
    setRotation(savedMeta.rotation % 90 || 0);
    setRotation90(Math.round(savedMeta.rotation / 90) * 90);
    setCropClicking(false);
    setCropClickCorner(null);
    setAdjustCropActive(false);
  };

  // FIX501.4.4.10: Non-destructive save
  const handleShallowSave = async () => {
    const newMeta = { crop: cropRect, rotation: totalRotation };
    await saveMeta(imagePath, newMeta);
    setMeta(newMeta);
    setSavedMeta(newMeta);
    onAfterSave?.(); // FIX501.4.4.10.1
  };

  // Build the edited image on an offscreen canvas (rotation + crop applied).
  // Returns the canvas plus the natural crop dimensions.
  const bakeEditedCanvas = () => {
    const img = imgRef.current;
    if (!img) return null;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const rad = (totalRotation * Math.PI) / 180;
    const { rw, rh } = getRotatedDims();
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = Math.round(rw);
    rotCanvas.height = Math.round(rh);
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih);

    const cx = cropRect?.x ?? 0;
    const cy = cropRect?.y ?? 0;
    const cw = cropRect?.w ?? Math.round(rw);
    const ch = cropRect?.h ?? Math.round(rh);

    const offscreen = document.createElement('canvas');
    offscreen.width = cw;
    offscreen.height = ch;
    offscreen.getContext('2d').drawImage(rotCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
    return offscreen;
  };

  // Shared "save cropped/rotated bytes to disk" logic used by Save and Shrink.
  const writeBakedImage = async (canvas, mime, quality) => {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
    await fetch(`${SERVER_URL}/agent/dir/image/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath, data: base64 }),
    });
    // Remove meta file — crop and rotation are now baked in
    try {
      await fetch(`${SERVER_URL}/file/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: metaPath(imagePath) }),
      });
    } catch { /* file may not exist */ }
    const resetMeta = { crop: null, rotation: 0 };
    setMeta(resetMeta);
    setSavedMeta(resetMeta);
    onRefresh?.();
    onAfterSave?.();
    setCropRect(null);
    setRotation(0);
    setRotation90(0);
    setCropClicking(false);
    setCropClickCorner(null);
    setAdjustCropActive(false);
    setCacheBust(Date.now());
  };

  // Shrink: resize + recompress as JPEG, with current crop + rotation baked in.
  const handleShrink = async () => {
    console.log('[shrink] start', { imagePath, imgLoaded, hasImgRef: !!imgRef.current });
    try {
      const baked = bakeEditedCanvas();
      if (!baked) {
        alert('Shrink aborted: image not ready yet.');
        return;
      }
      console.log('[shrink] baked canvas', { w: baked.width, h: baked.height });
      const maxEdge = Math.max(baked.width, baked.height);
      let outW = baked.width;
      let outH = baked.height;
      if (maxEdge > SHRINK_MAX_EDGE) {
        const scale = SHRINK_MAX_EDGE / maxEdge;
        outW = Math.round(baked.width * scale);
        outH = Math.round(baked.height * scale);
      }
      console.log('[shrink] output size', { outW, outH });
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      out.getContext('2d').drawImage(baked, 0, 0, outW, outH);
      const blob = await new Promise((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob returned null (canvas may be tainted)'))),
          'image/jpeg',
          SHRINK_QUALITY,
        );
      });
      console.log('[shrink] blob size', blob.size);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const saveResp = await fetch(`${SERVER_URL}/agent/dir/image/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: imagePath, data: base64 }),
      });
      if (!saveResp.ok) {
        const body = await saveResp.text().catch(() => '');
        throw new Error(`Agent save failed (${saveResp.status}): ${body.slice(0, 200)}`);
      }
      try {
        await fetch(`${SERVER_URL}/file/delete`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: metaPath(imagePath) }),
        });
      } catch { /* file may not exist */ }
      const resetMeta = { crop: null, rotation: 0 };
      setMeta(resetMeta);
      setSavedMeta(resetMeta);
      onRefresh?.();
      onAfterSave?.();
      setCropRect(null);
      setRotation(0);
      setRotation90(0);
      setCropClicking(false);
      setCropClickCorner(null);
      setAdjustCropActive(false);
      setCacheBust(Date.now());
      console.log('[shrink] done');
    } catch (e) {
      console.error('[shrink] failed', e);
      alert(`Shrink failed: ${e.message || e}`);
    }
  };

  // FIX501.4.4.11: Destructive save
  // FIX501.4.4.11.3: no confirmation popup
  const handleDestructiveSave = async () => {
    if (!imgRef.current) return;

    const img = imgRef.current;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Step 1: Rotate the full image onto an intermediate canvas
    const rad = (totalRotation * Math.PI) / 180;
    const { rw, rh } = getRotatedDims();
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = Math.round(rw);
    rotCanvas.height = Math.round(rh);
    const rotCtx = rotCanvas.getContext('2d');
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih);

    // Step 2: Crop from the rotated result (crop rect is in rotated-image coords)
    const cx = cropRect?.x ?? 0;
    const cy = cropRect?.y ?? 0;
    const cw = cropRect?.w ?? Math.round(rw);
    const ch = cropRect?.h ?? Math.round(rh);

    const offscreen = document.createElement('canvas');
    offscreen.width = cw;
    offscreen.height = ch;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(rotCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

    // Determine output format
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/png';

    const blob = await new Promise(resolve => offscreen.toBlob(resolve, mime, 0.92));
    const reader = new FileReader();
    const base64 = await new Promise(resolve => {
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });

    await fetch(`${SERVER_URL}/agent/dir/image/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath, data: base64 }),
    });

    // FIX501.4.4.11.1: Remove meta data file after destructive save
    try {
      await fetch(`${SERVER_URL}/file/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: metaPath(imagePath) }),
      });
    } catch { /* file may not exist — ok */ }
    const resetMeta = { crop: null, rotation: 0 };
    setMeta(resetMeta);
    setSavedMeta(resetMeta);
    onRefresh?.(); // FIX501.4.4.11.1: refresh file explorer (italic → normal)
    onAfterSave?.(); // FIX501.4.4.11.2: move-to-next variant
    setCropRect(null);
    setRotation(0);
    setRotation90(0);
    setCropClicking(false);
    setCropClickCorner(null);
    setAdjustCropActive(false);
    setCacheBust(Date.now());
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!imagePath) {
    return (
      <div className="image-editor">
        <div className="image-editor-header" />
        <div className="image-editor-canvas-area">
          <span className="image-editor-empty">No image selected</span>
        </div>
      </div>
    );
  }

  // Compute overlay rects for rendering
  const adjustScreenCrop = adjustCropActive ? getCropScreenRect() : null;
  const previewScreenCrop = cropClicking ? getCropPreviewScreenRect() : null;
  const anyOverlay = adjustScreenCrop || previewScreenCrop;
  const overlayRect = adjustScreenCrop || previewScreenCrop;
  const isCropMode = cropClicking || adjustCropActive;
  // FIX501.4.3.1.1.1: Crosshair lines at mouse position (before first click) or first click point (after)
  const crosshairSource = cropClicking ? (cropClickCorner || cropMousePos) : null;
  const clickMarker = (crosshairSource && canvasRef.current) ? (() => {
    const { rw, rh } = getRotatedDims();
    if (rw === 0) return null;
    return { x: (crosshairSource.x / rw) * canvasRef.current.width, y: (crosshairSource.y / rh) * canvasRef.current.height };
  })() : null;

  return (
    <div className="image-editor">
      {/* FIX501.4.2: Toolbox header — hidden in read-only mode (FIX501.50.4.9) */}
      {!readOnly && (
      <div className="image-editor-header">
        {/* FIX501.4.2.10.1: Toolbox left */}
        <div className="image-editor-toolbox">
          {/* FIX501.4.2.1.1: Reset */}
          <button className="image-editor-btn" onClick={handleReset} data-yagu-action="button-reset">Reset</button>

          <div className="image-editor-separator" />

          {/* FIX501.4.2.1.2: Crop — push button, two-click mode */}
          <button
            className={`image-editor-btn${cropClicking ? ' active' : ''}`}
            onClick={handleCropClick}
            data-yagu-action="button-crop"
          >Crop</button>

          {/* FIX501.4.2.1.6: Adjust Crop — toggle, visible when crop exists */}
          <button
            className={`image-editor-btn${adjustCropActive ? ' active' : ''}`}
            onClick={handleToggleAdjustCrop}
            disabled={!cropRect && !adjustCropActive}
            data-yagu-action="button-adjust-crop"
          >Adjust Crop</button>

          <div className="image-editor-separator" />

          {/* FIX501.4.2.1.3: Rotate slider */}
          <div className="image-editor-slider-group">
            <span>Rotate</span>
            <input
              type="range" min={-45} max={45} value={rotation}
              onChange={handleSliderChange}
              disabled={isCropMode}
              data-yagu-action="slider-rotate"
            />
            <span className="slider-value">{rotation}°</span>
          </div>

          {/* FIX501.4.2.1.4: Rotate -90° */}
          <button
            className="image-editor-btn"
            onClick={() => handleRotate90(-90)}
            disabled={isCropMode}
            data-yagu-action="button-rotate270"
          >-90°</button>

          {/* FIX501.4.2.1.5: Rotate +90° */}
          <button
            className="image-editor-btn"
            onClick={() => handleRotate90(90)}
            disabled={isCropMode}
            data-yagu-action="button-rotate90"
          >+90°</button>
        </div>

        {/* FIX501.4.2.10.2: Cancel + Save right */}
        <div className="image-editor-actions">
          {/* FIX501.4.2.4: 'Move to next' — label before, checkbox after */}
          <label
            className="image-editor-move-to-next"
            data-yagu-id="checkbox move-to-next"
            title="After save, select the next node in the File Explorer"
          >
            Move to next
            <input
              type="checkbox"
              checked={moveToNext}
              onChange={e => onMoveToNextChange?.(e.target.checked)}
            />
          </label>
          {/* FIX501.4.2.2: Cancel */}
          <button className="image-editor-btn" onClick={handleCancel} data-yagu-action="button-cancel">Cancel</button>
          {/* FIX501.4.2.3: Shallow Save */}
          <button
            className="image-editor-btn image-editor-btn-save"
            onClick={handleShallowSave}
            disabled={!hasChanges}
            data-yagu-action="button-non-destruct-save"
          >Shallow Save</button>
          {/* FIX501.4.2.3: Destructive Save */}
          <button
            className="image-editor-btn image-editor-btn-save"
            onClick={handleDestructiveSave}
            disabled={!hasChanges}
            data-yagu-action="button-destruct-save"
          >Save</button>
          {/* Shrink: bakes crop + rotation, resizes to max {SHRINK_MAX_EDGE}px edge,
              re-encodes as JPEG @ {SHRINK_QUALITY}. */}
          <button
            className="image-editor-btn image-editor-btn-save"
            onClick={handleShrink}
            disabled={!imgLoaded}
            title={`Resize to max ${SHRINK_MAX_EDGE}px and re-encode JPEG @ ${Math.round(SHRINK_QUALITY * 100)}%`}
          >Shrink</button>
          <span className="image-editor-filesize" title="Current file size on disk">
            {formatSize(fileSize)}
          </span>
        </div>
      </div>
      )}

      {/* FIX501.4.5: Canvas area */}
      <div
        className="image-editor-canvas-area"
        ref={areaRef}
        style={{ cursor: !readOnly && cropClicking ? 'crosshair' : undefined }}
        onMouseMove={readOnly ? undefined : handleAreaMouseMove}
        onClick={readOnly ? undefined : handleAreaClick}
        onContextMenu={readOnly ? undefined : handleImageContextMenu}
      >
        {/* Wrapper: position:relative so SVG overlay aligns exactly to the canvas */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <canvas ref={canvasRef} />

          {/* Crop overlay — shown during adjust-crop (with handles), two-click preview, or click marker */}
          {(anyOverlay || clickMarker) && canvasRef.current && (
            <svg
              className="crop-overlay"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
              }}
              viewBox={`0 0 ${canvasRef.current.width} ${canvasRef.current.height}`}
            >
            {/* Dimmed regions + crop border — only when overlay rect exists */}
            {overlayRect && (<>
              <path
                className="crop-dim"
                d={`M0,0 H${canvasRef.current.width} V${canvasRef.current.height} H0 Z
                    M${overlayRect.x},${overlayRect.y} V${overlayRect.y + overlayRect.h} H${overlayRect.x + overlayRect.w} V${overlayRect.y} Z`}
                fillRule="evenodd"
              />
              <rect
                className="crop-border"
                x={overlayRect.x} y={overlayRect.y}
                width={overlayRect.w} height={overlayRect.h}
              />
            </>)}

            {/* Crosshair at first click point */}
            {clickMarker && (
              <>
                <line x1={clickMarker.x} y1={0} x2={clickMarker.x} y2={canvasRef.current.height}
                  stroke="#fff" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
                <line x1={0} y1={clickMarker.y} x2={canvasRef.current.width} y2={clickMarker.y}
                  stroke="#fff" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
              </>
            )}

            {/* Drag handles — only in adjust-crop mode */}
            {adjustCropActive && (<>
              {/* Move handle (center area) */}
              <rect
                x={overlayRect.x} y={overlayRect.y}
                width={overlayRect.w} height={overlayRect.h}
                fill="transparent" style={{ pointerEvents: 'all', cursor: 'move' }}
                onMouseDown={e => handleMouseDown('move', e)}
              />
              {/* Corner handles */}
              {[
                { id: 'nw', cx: overlayRect.x, cy: overlayRect.y },
                { id: 'ne', cx: overlayRect.x + overlayRect.w, cy: overlayRect.y },
                { id: 'sw', cx: overlayRect.x, cy: overlayRect.y + overlayRect.h },
                { id: 'se', cx: overlayRect.x + overlayRect.w, cy: overlayRect.y + overlayRect.h },
              ].map(h => (
                <rect
                  key={h.id}
                  className={`crop-handle crop-handle-${h.id}`}
                  x={h.cx - HANDLE_SIZE / 2} y={h.cy - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE} height={HANDLE_SIZE}
                  onMouseDown={e => handleMouseDown(h.id, e)}
                />
              ))}
              {/* Edge handles */}
              {[
                { id: 'n', cx: overlayRect.x + overlayRect.w / 2, cy: overlayRect.y },
                { id: 's', cx: overlayRect.x + overlayRect.w / 2, cy: overlayRect.y + overlayRect.h },
                { id: 'w', cx: overlayRect.x, cy: overlayRect.y + overlayRect.h / 2 },
                { id: 'e', cx: overlayRect.x + overlayRect.w, cy: overlayRect.y + overlayRect.h / 2 },
              ].map(h => (
                <rect
                  key={h.id}
                  className={`crop-handle crop-handle-${h.id}`}
                  x={h.cx - HANDLE_SIZE / 2} y={h.cy - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE} height={HANDLE_SIZE}
                  onMouseDown={e => handleMouseDown(h.id, e)}
                />
              ))}
            </>)}
          </svg>
        )}
        </div>{/* end canvas wrapper */}
      </div>

      {/* FIX501.4.3.20: Context menu on right-click */}
      {imgContextMenu && (
        <div
          className="image-editor-context-menu"
          style={{ left: imgContextMenu.x, top: imgContextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* FIX501.4.3.20.1: Save → destructive save */}
          <div
            className="image-editor-context-option"
            onClick={() => { setImgContextMenu(null); handleDestructiveSave(); }}
          >Save</div>
          {/* FIX501.4.3.20.2: Shallow Save → non-destructive save */}
          <div
            className="image-editor-context-option"
            onClick={() => { setImgContextMenu(null); handleShallowSave(); }}
          >Shallow Save</div>
          {/* FIX501.4.3.20.3: Crop → enters two-click crop flow */}
          <div
            className="image-editor-context-option"
            onClick={() => { setImgContextMenu(null); handleCropClick(); }}
          >Crop</div>
        </div>
      )}
    </div>
  );
}
