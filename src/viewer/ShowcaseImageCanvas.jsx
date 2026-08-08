import { useEffect, useRef, useState } from 'react';

// FIX520.2 / FIX524.4.10: canvas-based viewer that honors image.rotation
// and image.crop (both set non-destructively via PATCH /api/images/:id).
//
// Crop coords are in rotated-image space — same convention as the photo
// module's ImageEditor. When rotation is 0, crop.x/y map straight to the
// original pixel grid. When rotation ≠ 0, crop applies *after* rotation.
//
// In `cropMode`, the component draws the full rotated image (ignoring the
// current crop) and captures two clicks to produce a new crop rectangle.
// A dashed preview rectangle follows the mouse between the clicks
// (FIX524.3.1 two-click flow).
export default function ShowcaseImageCanvas({
  url,
  rotation = 0,
  crop = null,
  cropMode = false,
  onCropComplete,
  className,
  zoom = 1,
}) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [firstCorner, setFirstCorner] = useState(null); // { x, y } in rotated-image coords
  const [mousePos, setMousePos] = useState(null);

  // Reset crop interaction state whenever we enter / leave crop mode or
  // change image — stale corners from the previous round shouldn't leak.
  useEffect(() => {
    setFirstCorner(null);
    setMousePos(null);
  }, [cropMode, url]);

  useEffect(() => {
    // Clear the previous image synchronously so the draw effect doesn't
    // paint the stale bitmap with the new url's rotation/crop for one
    // frame — the symptom was "old image flashes while switching".
    setImg(null);
    if (!url) return undefined;
    const i = new Image();
    i.crossOrigin = 'anonymous';
    let alive = true;
    i.onload = () => { if (alive) setImg(i); };
    i.onerror = () => { if (alive) setImg(null); };
    i.src = url;
    return () => { alive = false; };
  }, [url]);

  // Offscreen buffer holding just the (expensive) rotated/cropped base
  // image — rendered once per img/rotation/crop/cropMode change, not on
  // every mouse move.
  const bufferRef = useRef(null);

  // Expensive draw: decode + rotate + (optionally) crop the source image.
  // Deliberately excludes mousePos/firstCorner from its deps — those used
  // to be in the SAME effect as this drawImage call, so every mouse move
  // re-ran a full-resolution rotate+draw (plus a canvas.width reset, which
  // forces a full buffer reallocation) just to move a crosshair. On a real
  // multi-megapixel photo that's slow enough that the redraw visibly can't
  // keep up with the cursor — the reported "crop rectangle doesn't follow
  // the mouse" bug was this lag, not a coordinate error.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!img) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const rad = ((rotation % 360) * Math.PI) / 180;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rotW = iw * cos + ih * sin;
    const rotH = iw * sin + ih * cos;

    const useCrop = !cropMode && crop;
    const cx = useCrop ? crop.x : 0;
    const cy = useCrop ? crop.y : 0;
    const cw = useCrop ? crop.width : rotW;
    const ch = useCrop ? crop.height : rotH;

    canvas.width = Math.max(1, Math.round(cw));
    canvas.height = Math.max(1, Math.round(ch));

    if (!bufferRef.current) bufferRef.current = document.createElement('canvas');
    const buffer = bufferRef.current;
    buffer.width = canvas.width;
    buffer.height = canvas.height;
    const bctx = buffer.getContext('2d');
    bctx.clearRect(0, 0, buffer.width, buffer.height);
    bctx.save();
    // Crop origin → canvas (0,0)
    bctx.translate(-cx, -cy);
    // Center of rotated image, rotate, then draw the original centered.
    bctx.translate(rotW / 2, rotH / 2);
    bctx.rotate(rad);
    bctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    bctx.restore();

    // Blit the freshly-rendered buffer now so the base image shows up even
    // before the cheap overlay effect below has a mousePos to draw with.
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0);
  }, [img, rotation, crop, cropMode]);

  // Cheap redraw: blit the cached buffer (no re-rotate/re-decode) and paint
  // the crosshair/preview rectangle on top. This is the one that reruns on
  // every mouse move, so it needs to stay fast regardless of photo size.
  useEffect(() => {
    const canvas = canvasRef.current;
    const buffer = bufferRef.current;
    if (!canvas || !buffer || !img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0);

    if (cropMode && mousePos) {
      // FIX524.3.1.1.1: dotted vertical + horizontal guide lines at the
      // cursor position — helps the user aim before each click.
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 215, 66, 0.8)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mousePos.x + 0.5, 0);
      ctx.lineTo(mousePos.x + 0.5, canvas.height);
      ctx.moveTo(0, mousePos.y + 0.5);
      ctx.lineTo(canvas.width, mousePos.y + 0.5);
      ctx.stroke();
      ctx.restore();

      // Preview rectangle once the first corner is locked.
      if (firstCorner) {
        const x = Math.min(firstCorner.x, mousePos.x);
        const y = Math.min(firstCorner.y, mousePos.y);
        const w = Math.abs(mousePos.x - firstCorner.x);
        const h = Math.abs(mousePos.y - firstCorner.y);
        ctx.save();
        // Dim the area outside the preview rect so the selection pops.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, y);
        ctx.fillRect(0, y, x, h);
        ctx.fillRect(x + w, y, canvas.width - x - w, h);
        ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
        ctx.strokeStyle = '#f5d742';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
    }
  }, [img, cropMode, firstCorner, mousePos]);

  // Translate a mouse event into rotated-image coordinates. `object-fit:
  // contain` (.sc-viewer-img) means the canvas's CSS box and its actual
  // painted content are NOT the same rectangle whenever their aspect
  // ratios differ (confirmed live: a 1848x4000 buffer inside a
  // 556.5x707.65625 box) — contain fits to the constraining axis and
  // letterboxes the other, so this replicates that same math to find the
  // real displayed rect before mapping the mouse position into it. Using
  // the raw bounding box directly (the old approach) used the wrong,
  // too-small scale factor on the letterboxed axis and ignored the offset
  // entirely — the bug reported as "the crop rectangle doesn't follow the
  // mouse" / "right edge only reaches 3/4 of the width".
  const toImageCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const bufRatio = canvas.width / canvas.height;
    const boxRatio = rect.width / rect.height;
    let dispW; let dispH;
    if (bufRatio > boxRatio) {
      // Content relatively wider than the box — fit to width, letterbox top/bottom.
      dispW = rect.width;
      dispH = rect.width / bufRatio;
    } else {
      // Content relatively taller than the box — fit to height, letterbox left/right.
      dispH = rect.height;
      dispW = rect.height * bufRatio;
    }
    const offsetX = (rect.width - dispW) / 2;
    const offsetY = (rect.height - dispH) / 2;
    const sx = canvas.width / dispW;
    const sy = canvas.height / dispH;
    // Clamp into the buffer's valid range: the CSS box is generally larger
    // than the displayed content (contain letterboxes the other axis), so
    // without this the guide lines/crop rect vanish off-canvas whenever the
    // cursor drifts into that blank margin instead of pinning to the edge.
    const x = Math.min(canvas.width, Math.max(0, (e.clientX - rect.left - offsetX) * sx));
    const y = Math.min(canvas.height, Math.max(0, (e.clientY - rect.top - offsetY) * sy));
    return { x, y };
  };

  const onMouseMove = (e) => {
    if (!cropMode) return;
    setMousePos(toImageCoords(e));
  };
  const onMouseLeave = () => {
    if (!cropMode) return;
    setMousePos(null);
  };
  const onClick = (e) => {
    if (!cropMode) return;
    const p = toImageCoords(e);
    if (!p) return;
    if (!firstCorner) {
      setFirstCorner(p);
      return;
    }
    const x = Math.min(firstCorner.x, p.x);
    const y = Math.min(firstCorner.y, p.y);
    const width = Math.abs(p.x - firstCorner.x);
    const height = Math.abs(p.y - firstCorner.y);
    if (width >= 1 && height >= 1) {
      onCropComplete?.({ x, y, width, height });
    }
    setFirstCorner(null);
  };

  // FIX520.3.3: zoom scales the canvas past its fitted size; transform
  // (rather than resizing the intrinsic bitmap) keeps this cheap and lets
  // the scrolling parent's overflow calculation pick up the larger box.
  const style = {
    ...(cropMode ? { cursor: 'crosshair' } : null),
    ...(zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: 'top left' } : null),
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={Object.keys(style).length ? style : undefined}
    />
  );
}

// FIX524.4.10 <action-save-img>: same rotate+crop composition as the draw
// effect above (lines 71-101), factored out so Save can bake the exact
// pixels the user is previewing instead of re-deriving the math. A fresh
// canvas per call, unlike the component's reused bufferRef — this only
// ever runs once per Save, not per frame.
export function bakeRotatedCrop(img, rotation, crop) {
  const rad = ((rotation % 360) * Math.PI) / 180;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotW = iw * cos + ih * sin;
  const rotH = iw * sin + ih * cos;

  const cx = crop ? crop.x : 0;
  const cy = crop ? crop.y : 0;
  const cw = crop ? crop.width : rotW;
  const ch = crop ? crop.height : rotH;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw));
  canvas.height = Math.max(1, Math.round(ch));
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(-cx, -cy);
  ctx.translate(rotW / 2, rotH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  return canvas;
}

// FIX611.3.2.1 / FIX670.20.3.1: url-in/blob-out flatten — loads the source
// image and bakes the given rotation/crop into new pixels, the shared
// primitive behind both the local-app Flatten command and the at-publish
// flatten (any pending non-destructive metadata must become a destructive
// pixel change no later than publish).
function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

export async function bakeRotatedCropToBlob(url, rotation, crop) {
  const img = await loadImageEl(url);
  const canvas = bakeRotatedCrop(img, rotation, crop);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.9);
  });
}
