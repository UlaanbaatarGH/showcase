import { useEffect, useRef, useState } from 'react';

// FIX520.2 / FIX520.2.10: canvas-based viewer that honors image.rotation
// and image.crop (both set non-destructively via PATCH /api/images/:id).
//
// Crop coords are in rotated-image space — same convention as the photo
// module's ImageEditor. When rotation is 0, crop.x/y map straight to the
// original pixel grid. When rotation ≠ 0, crop applies *after* rotation.
//
// In `cropMode`, the component draws the full rotated image (ignoring the
// current crop) and captures two clicks to produce a new crop rectangle.
// A dashed preview rectangle follows the mouse between the clicks
// (FIX501.4.3.1 two-click flow).
export default function ShowcaseImageCanvas({
  url,
  rotation = 0,
  crop = null,
  cropMode = false,
  onCropComplete,
  className,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!img) {
      // No image yet — wipe the canvas so the previous frame doesn't
      // linger while the next one loads.
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
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // Crop origin → canvas (0,0)
    ctx.translate(-cx, -cy);
    // Center of rotated image, rotate, then draw the original centered.
    ctx.translate(rotW / 2, rotH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    if (cropMode && mousePos) {
      // FIX501.4.3.1.1.1: dotted vertical + horizontal guide lines at the
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
  }, [img, rotation, crop, cropMode, firstCorner, mousePos]);

  // Translate a mouse event into rotated-image coordinates. The canvas
  // itself is scaled by CSS (object-fit-like), so we convert through the
  // bounding rect ratio.
  const toImageCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
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

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={cropMode ? { cursor: 'crosshair' } : undefined}
    />
  );
}
