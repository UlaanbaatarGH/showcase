// FIX521.5.7 / FIX521.5.7.1: Zoom Factor (ZF) against a Reference Viewport (RV).
// RV is hardcoded for now (a maximized Chrome page on a 1080p laptop). ZF tells
// how much an image's resolution exceeds the width it occupies when shown
// full-page in the RV: ZF = max(Wi/Wv, Hi/Hv). ZF 1 = exactly fills; higher =
// spare resolution that can be trimmed.
export const REFERENCE_VIEWPORT = { w: 1920, h: 911 };

// FIX521.5.7: per-image zoom factor. null when dimensions are unknown.
export function zoomFactor(w, h) {
  const { w: rw, h: rh } = REFERENCE_VIEWPORT;
  if (!w || !h || !rw || !rh) return null;
  return Math.max(w / rw, h / rh);
}
