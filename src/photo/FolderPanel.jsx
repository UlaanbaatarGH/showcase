/**
 * FIX501.30 — Folder panel
 * Shows folder properties (editable) and all images stacked vertically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './FolderPanel.css';

// FIX501.30.3.1: Magnifying lens — shown while hovering (zoom >= 2) or while Shift is held (any zoom)
function MagnifiableImage({ src, alt, zoom, lensSize, imgScale = 100 }) {
  const imgRef = useRef(null);
  const [lens, setLens] = useState(null); // { x, y, bgX, bgY, bgW, bgH }
  const shiftHeldRef = useRef(false);
  const lastMouseRef = useRef(null);

  const computeLens = (clientX, clientY) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    const bgW = rect.width * zoom;
    const bgH = rect.height * zoom;
    const bgX = -(px * zoom - lensSize / 2);
    const bgY = -(py * zoom - lensSize / 2);
    return { x: px - lensSize / 2, y: py - lensSize / 2, bgX, bgY, bgW, bgH };
  };

  const lensShouldShow = () => zoom > 1 || shiftHeldRef.current;

  const handleMouseMove = (e) => {
    lastMouseRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (lensShouldShow()) setLens(computeLens(e.clientX, e.clientY));
    else setLens(null);
  };

  const handleMouseLeave = () => setLens(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Shift') {
        shiftHeldRef.current = true;
        if (lastMouseRef.current) setLens(computeLens(lastMouseRef.current.clientX, lastMouseRef.current.clientY));
      }
    };
    const onKeyUp = (e) => {
      if (e.key === 'Shift') {
        shiftHeldRef.current = false;
        if (zoom === 1) setLens(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [zoom, lensSize]);

  // When zoom/lensSize changes while hovering, recompute lens from last known cursor
  useEffect(() => {
    if (lensShouldShow() && lastMouseRef.current) {
      setLens(computeLens(lastMouseRef.current.clientX, lastMouseRef.current.clientY));
    } else {
      setLens(null);
    }

  }, [zoom, lensSize]);

  return (
    <div
      className="folder-panel-img-wrap"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ width: `${imgScale}%` }}
    >
      <img ref={imgRef} src={src} alt={alt} loading="lazy" style={{ width: '100%' }} />
      {lens && (
        <div
          className="folder-panel-lens"
          style={{ left: lens.x, top: lens.y, width: lensSize, height: lensSize }}
        >
          <img
            src={src}
            alt=""
            style={{
              position: 'absolute',
              left: lens.bgX, top: lens.bgY,
              width: lens.bgW, height: lens.bgH,
              maxWidth: 'none', maxHeight: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

const SERVER_URL = 'http://localhost:3001';
const PROPERTIES_FILE = 'properties.txt';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

function isImageFile(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTS.has(name.substring(dot).toLowerCase());
}

function imageUrl(filePath) {
  return `${SERVER_URL}/agent/dir/image?path=${encodeURIComponent(filePath)}`;
}

// FIX500.2.2.2.1.1: line format = "id:label:value"
function parseProperties(content) {
  if (!content) return [];
  return content.split('\n').filter(line => line.length > 0).map(line => {
    const first = line.indexOf(':');
    if (first < 0) return null;
    const second = line.indexOf(':', first + 1);
    if (second < 0) return null;
    const id = parseInt(line.substring(0, first), 10);
    if (isNaN(id)) return null;
    return { id, label: line.substring(first + 1, second), value: line.substring(second + 1) };
  }).filter(Boolean);
}

function serializeProperties(props, note) {
  // FIX501.3.3.5.5: optional leading "#:note:<text>" line carries the folder note
  const lines = [];
  if (note) lines.push(`#:note:${note}`);
  for (const p of props) lines.push(`${p.id}:${p.label}:${p.value ?? ''}`);
  return lines.join('\n') + '\n';
}

async function readProperties(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + PROPERTIES_FILE)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return parseProperties(data.content || '');
  } catch { return []; }
}

async function writeProperties(folderPath, props) {
  // FIX501.3.3.5.5: preserve the folder note across any rewrite
  let note = '';
  try {
    const r = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/.note.txt')}`);
    if (r.ok) note = ((await r.json()).content || '').split('\n')[0];
  } catch { /* no note */ }
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath + '/' + PROPERTIES_FILE, content: serializeProperties(props, note) }),
  });
}

async function fetchDirList(dirPath) {
  const res = await fetch(`${SERVER_URL}/agent/dir/list?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.entries || [];
}

// FIX501.30.3.3 / FIX501.3.5.3: Main image — stored as filename in .main-image.txt
const MAIN_IMAGE_FILE = '.main-image.txt';

async function readMainImage(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + MAIN_IMAGE_FILE)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data.content || '').trim();
    return name || null;
  } catch { return null; }
}

async function writeMainImage(folderPath, name) {
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath + '/' + MAIN_IMAGE_FILE, content: name || '' }),
  });
}

// FIX501.3.3.2.1: read .sort.txt to honor the persisted order
async function readSortFile(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/.sort.txt')}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content || '').split('\n').filter(Boolean);
  } catch { return null; }
}

export default function FolderPanel({ folderPath, refreshKey, mainImageIconHeight = 80 }) {
  const [properties, setProperties] = useState([]);
  const [images, setImages] = useState([]);
  // Magnifier controls
  const [zoom, setZoom] = useState(1);       // 1, 2 or 3
  const [lensSize, setLensSize] = useState(400); // Wide (default), 200 = Narrow
  // FIX501.30.3.2: Global image size slider (% of natural/container width)
  const [imgScale, setImgScale] = useState(100); // percent, 25..200
  // FIX501.30.3.3: Main image
  const [mainImageName, setMainImageName] = useState(null);
  const [topImageName, setTopImageName] = useState(null);
  const imagesContainerRef = useRef(null);
  // FIX501.30.2.3.1: track image panel height to constrain the first image
  const [imagesPanelHeight, setImagesPanelHeight] = useState(null);

  const loadAll = useCallback(async () => {
    if (!folderPath) return;
    setProperties(await readProperties(folderPath));
    const entries = await fetchDirList(folderPath);
    let imgNames = entries.filter(e => e.type === 'file' && isImageFile(e.name)).map(e => e.name);
    // FIX501.3.3.2.1: apply the persisted sort order (.sort.txt) if present
    const sortOrder = await readSortFile(folderPath);
    if (sortOrder && sortOrder.length > 0) {
      const orderMap = new Map(sortOrder.map((n, i) => [n, i]));
      imgNames = [...imgNames].sort((a, b) => {
        const ai = orderMap.has(a) ? orderMap.get(a) : Infinity;
        const bi = orderMap.has(b) ? orderMap.get(b) : Infinity;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
      });
    }
    setImages(imgNames);
    setMainImageName(await readMainImage(folderPath));
    setTopImageName(imgNames[0] || null);
  }, [folderPath]);

  // Re-read when folderPath changes OR refreshKey is bumped (e.g., setup save)
  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  const handleValueChange = (idx, value) => {
    setProperties(props => props.map((p, i) => i === idx ? { ...p, value } : p));
  };

  const handleValueBlur = async () => {
    await writeProperties(folderPath, properties);
  };

  // FIX501.30.2.3.1: Observe image panel height so the first image can be clipped to fit
  useEffect(() => {
    const el = imagesContainerRef.current;
    if (!el) return;
    setImagesPanelHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setImagesPanelHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // FIX501.30.3.3: Track topmost visible image via scroll
  useEffect(() => {
    const container = imagesContainerRef.current;
    if (!container) return;
    const update = () => {
      // At scrollTop=0 the first image is at the top — avoid relying on DOM
      // measurements which are unreliable before lazy-loaded images resolve.
      if (container.scrollTop === 0) {
        setTopImageName(images[0] || null);
        return;
      }
      const containerTop = container.getBoundingClientRect().top;
      const wraps = container.querySelectorAll('[data-image-name]');
      for (const el of wraps) {
        if (el.getBoundingClientRect().bottom > containerTop + 20) {
          setTopImageName(el.getAttribute('data-image-name'));
          return;
        }
      }
    };
    update();
    container.addEventListener('scroll', update);
    return () => container.removeEventListener('scroll', update);
  }, [images]);

  // FIX501.30.3.3.3: Toggle main flag on topmost image
  const handleMainToggle = async () => {
    if (!topImageName) return;
    const next = mainImageName === topImageName ? null : topImageName;
    setMainImageName(next);
    await writeMainImage(folderPath, next);
  };
  const mainActive = topImageName && mainImageName === topImageName;

  if (!folderPath) return null;

  return (
    <div className="folder-panel">
      {/* FIX501.30.2.1: Property panel */}
      <div className="folder-panel-props">
        <div className="folder-panel-props-title">Properties</div>
        {properties.length === 0 ? (
          <div className="folder-panel-empty">No properties defined.</div>
        ) : (
          <table className="folder-panel-table">
            <tbody>
              {properties.map((p, idx) => (
                <tr key={idx}>
                  <td className="folder-panel-label">{p.label}</td>
                  <td>
                    <input
                      type="text"
                      value={p.value}
                      onChange={e => handleValueChange(idx, e.target.value)}
                      onBlur={handleValueBlur}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* FIX501.30.2.1.3: Main Image Icon below the Properties list */}
        {/* FIX501.30.2.1.3.1: height from <input-main-img-icon-height> / FIX501.30.2.1.3.2: left-aligned */}
        {mainImageName && (
          <div className="folder-panel-main-icon">
            <div className="folder-panel-main-icon-label">Main Image Icon</div>
            <img
              src={imageUrl(folderPath + '/' + mainImageName)}
              alt={mainImageName}
              style={{ height: `${mainImageIconHeight}px`, width: 'auto' }}
            />
          </div>
        )}
      </div>

      {/* FIX501.30.2.2: Image list (header + vertical stack) */}
      <div className="folder-panel-images-wrap">
        {/* FIX501.30.2.2: Image List Header */}
        <div className="folder-panel-magnifier-toolbar">
          {/* FIX501.30.2.2.1: Group — Magnifying lens */}
          <span className="folder-panel-toolbar-label">Lens</span>
          <div className="folder-panel-toggle-group">
            {[1, 2, 3].map(z => (
              <button
                key={z}
                className={`folder-panel-toggle${zoom === z ? ' active' : ''}`}
                onClick={() => setZoom(z)}
              >x{z}</button>
            ))}
          </div>
          <div className="folder-panel-toggle-group">
            <button
              className={`folder-panel-toggle${lensSize === 400 ? ' active' : ''}`}
              onClick={() => setLensSize(400)}
              disabled={zoom === 1}
            >Wide</button>
            <button
              className={`folder-panel-toggle${lensSize === 200 ? ' active' : ''}`}
              onClick={() => setLensSize(200)}
              disabled={zoom === 1}
            >Narrow</button>
          </div>
          {/* FIX501.30.2.2.2 / FIX501.30.3.3: Button 'Main' — toggles main flag on topmost image */}
          <button
            className={`folder-panel-toggle folder-panel-main-btn${mainActive ? ' main-on' : ''}`}
            onClick={handleMainToggle}
            disabled={!topImageName}
            data-yagu-id="button-main-image"
            title={mainActive ? 'Clear main image' : 'Set as main image'}
          >Main</button>
          {/* FIX501.30.2.2.3: Group — Image size / FIX501.30.3.2: Image size slider */}
          <div className="folder-panel-slider-group">
            <span className="folder-panel-toolbar-label">Size</span>
            <input
              type="range"
              min={25} max={200} step={5}
              value={imgScale}
              onChange={e => setImgScale(Number(e.target.value))}
            />
            <span className="folder-panel-slider-value">{imgScale}%</span>
          </div>
        </div>
        <div className="folder-panel-images" ref={imagesContainerRef}>
          {images.length === 0 ? (
            <div className="folder-panel-empty">No images in this folder.</div>
          ) : (
            images.map((name, idx) => (
              <div
                key={name}
                data-image-name={name}
                className={`folder-panel-image-slot${idx === 0 ? ' folder-panel-image-first' : ''}`}
                style={idx === 0 && imagesPanelHeight ? { maxHeight: `${imagesPanelHeight}px` } : undefined}
              >
                <MagnifiableImage
                  src={imageUrl(folderPath + '/' + name)}
                  alt={name}
                  zoom={zoom}
                  lensSize={lensSize}
                  imgScale={imgScale}
                />
                {mainImageName === name && (
                  <div className="folder-panel-main-badge" title="Main image">✓ Main</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
