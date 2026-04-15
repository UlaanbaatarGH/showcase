/**
 * FIX502 — Showcase View
 * Table of folders having a property file; columns configurable via setup.
 */

import { useState, useEffect, useCallback } from 'react';
import './ShowcaseView.css';

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

async function fetchDirList(dirPath) {
  const res = await fetch(`${SERVER_URL}/agent/dir/list?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.entries || [];
}

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

function serializeProperties(props) {
  return props.map(p => `${p.id}:${p.label}:${p.value ?? ''}`).join('\n') + '\n';
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
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath + '/' + PROPERTIES_FILE, content: serializeProperties(props) }),
  });
}

const MAIN_IMAGE_FILE = '.main-image.txt';

async function readMainImageName(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + MAIN_IMAGE_FILE)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data.content || '').trim();
    return name || null;
  } catch { return null; }
}

async function findQualifyingFolders(rootPath) {
  const result = [];
  async function walk(dirPath) {
    const entries = await fetchDirList(dirPath);
    const hasProps = entries.some(e => e.type === 'file' && e.name === PROPERTIES_FILE);
    if (hasProps) {
      // FIX501.30.3.3.3.2: Main image icon — only shown when a Main image is explicitly flagged
      const mainName = await readMainImageName(dirPath);
      const mainEntry = mainName && entries.find(e => e.type === 'file' && e.name === mainName);
      const firstImage = entries.find(e => e.type === 'file' && isImageFile(e.name));
      result.push({
        path: dirPath,
        name: dirPath.substring(dirPath.lastIndexOf('/') + 1),
        mainImage: mainEntry ? dirPath + '/' + mainEntry.name : null,
        firstImage: firstImage ? dirPath + '/' + firstImage.name : null,
      });
    }
    for (const e of entries) {
      if (e.type === 'folder') await walk(dirPath + '/' + e.name);
    }
  }
  await walk(rootPath);
  return result;
}

// FIX500.2.3.2.1.2.4: Roman numeral → integer (null if not a valid Roman numeral)
const ROMAN_RE = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
function romanToInt(s) {
  if (typeof s !== 'string') return null;
  const str = s.trim().toUpperCase();
  if (!str || !ROMAN_RE.test(str)) return null;
  const m = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const v = m[str[i]];
    const n = m[str[i + 1]];
    total += (n && v < n) ? -v : v;
  }
  return total;
}

export default function ShowcaseView({ rootFolder, columns, folderColumnName = '', romanYearConverter = false, refreshKey, mainImageIconHeight = 80, selectedPath, onSelectPath }) {
  const [rows, setRows] = useState([]); // { path, name, firstImage, mainImage, props: [{id,label,value}] }
  const setSelectedPath = onSelectPath || (() => {});
  // FIX520: viewer state — list of images in selected folder + current index
  const [viewerImages, setViewerImages] = useState([]); // array of full paths
  const [viewerIndex, setViewerIndex] = useState(0);
  // FIX510.2.1.3: sort state — array of { column, dir } (second entry optional, via ctrl-click)
  const [sortKeys, setSortKeys] = useState([]);
  // FIX510.2.1.3: filter state — { columnLabel: filterText }
  const [filters, setFilters] = useState({});

  const loadAll = useCallback(async () => {
    if (!rootFolder) return;
    const folders = await findQualifyingFolders(rootFolder);
    const loaded = await Promise.all(folders.map(async f => ({
      ...f,
      props: await readProperties(f.path),
    })));
    setRows(loaded);
  }, [rootFolder]);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  const getCellValue = (row, colLabel) => {
    if (colLabel === 'Folder name') return row.name;
    if (colLabel === 'Main image icon') return row.mainImage || '';
    const p = row.props.find(p => p.label === colLabel);
    return p ? p.value : '';
  };

  const handleSortClick = (colLabel, ctrl) => {
    setSortKeys(prev => {
      const existing = prev.find(k => k.column === colLabel);
      if (ctrl) {
        // FIX510.2.1.3.2: ctrl-click adds / toggles secondary key
        if (existing) {
          return prev.map(k => k.column === colLabel ? { ...k, dir: k.dir === 'asc' ? 'desc' : 'asc' } : k);
        }
        return [...prev.slice(0, 1), { column: colLabel, dir: 'asc' }];
      }
      // FIX510.2.1.3.1: plain click replaces primary; keep secondary if present
      if (existing && prev[0].column === colLabel) {
        return [{ column: colLabel, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }, ...prev.slice(1)];
      }
      return [{ column: colLabel, dir: 'asc' }];
    });
  };

  const handleFilterChange = (colLabel, value) => {
    setFilters(f => ({ ...f, [colLabel]: value }));
  };

  // FIX510.2.1.4: edit a value — not Folder name, not Main image icon
  const handleCellEdit = async (row, colLabel, value) => {
    const newProps = row.props.map(p => p.label === colLabel ? { ...p, value } : p);
    await writeProperties(row.path, newProps);
    setRows(rs => rs.map(r => r.path === row.path ? { ...r, props: newProps } : r));
  };

  // Apply filters + sort
  const filtered = rows.filter(row => {
    for (const [col, text] of Object.entries(filters)) {
      if (!text) continue;
      const v = String(getCellValue(row, col) || '').toLowerCase();
      if (!v.includes(text.toLowerCase())) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    for (const { column, dir } of sortKeys) {
      const va = String(getCellValue(a, column) || '');
      const vb = String(getCellValue(b, column) || '');
      const cmp = va.localeCompare(vb);
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });

  const selectedRow = sorted.find(r => r.path === selectedPath);

  // FIX501.3.3.6.1: scroll the selected item into view (e.g., after Ctrl-Space from File Explorer)
  useEffect(() => {
    if (!selectedPath) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-showcase-path="${CSS.escape(selectedPath)}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }, [selectedPath, rows]);

  // FIX520: Load images of selected folder; FIX520.5.1: start at Main image if defined
  useEffect(() => {
    if (!selectedRow) { setViewerImages([]); setViewerIndex(0); return; }
    let cancelled = false;
    fetchDirList(selectedRow.path).then(entries => {
      if (cancelled) return;
      const imgs = entries
        .filter(e => e.type === 'file' && isImageFile(e.name))
        .map(e => selectedRow.path + '/' + e.name);
      setViewerImages(imgs);
      const mainIdx = selectedRow.mainImage ? imgs.indexOf(selectedRow.mainImage) : -1;
      setViewerIndex(mainIdx >= 0 ? mainIdx : 0);
    });
    return () => { cancelled = true; };
  }, [selectedRow]);

  // FIX510.3.2 / FIX510.3.3: arrow-key navigation — Up/Down in list, Left/Right in viewer
  useEffect(() => {
    const handler = (e) => {
      const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      const isHorizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (!isVertical && !isHorizontal) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isVertical) {
        // FIX510.3.2
        if (sorted.length === 0) return;
        e.preventDefault();
        const idx = sorted.findIndex(r => r.path === selectedPath);
        let next;
        if (idx < 0) next = 0;
        else if (e.key === 'ArrowDown') next = Math.min(sorted.length - 1, idx + 1);
        else next = Math.max(0, idx - 1);
        setSelectedPath(sorted[next].path);
      } else {
        // FIX510.3.3
        if (viewerImages.length === 0) return;
        e.preventDefault();
        setViewerIndex(i => {
          if (e.key === 'ArrowRight') return Math.min(viewerImages.length - 1, i + 1);
          return Math.max(0, i - 1);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sorted, selectedPath, viewerImages]);

  return (
    <div className="showcase-view">
      {/* FIX502.2.1 / FIX503: Showcase Header panel */}
      <div className="showcase-header" data-yagu-id="panel-showcase-header">
        <span className="showcase-header-title">Showcase</span>
        <span className="showcase-header-path">{rootFolder}</span>
        <span className="showcase-header-count">{sorted.length} folder{sorted.length === 1 ? '' : 's'}</span>
      </div>

      <div className="showcase-body">
        {/* FIX502.2.2 / FIX510: Showcase List panel */}
        <div className="showcase-list" data-yagu-id="panel-showcase-list">
          <div className="showcase-table-wrap">
            <table className="showcase-table">
              <thead>
                <tr>
                  {columns.map(col => {
                    const sk = sortKeys.find(k => k.column === col.name);
                    // FIX500.2.3.2.1.2.1.1: width sample — character count defines column width
                    const widthStyle = col.widthSample ? { width: `${col.widthSample.length}ch` } : undefined;
                    return (
                      <th
                        key={col.name}
                        style={widthStyle}
                        onClick={(e) => handleSortClick(col.name, e.ctrlKey || e.metaKey)}
                        title="Click to sort; Ctrl-click for secondary sort"
                      >
                        {/* FIX500.2.3.2.1.2.3: override 'Folder name' header text if set */}
                        {col.name === 'Folder name' && folderColumnName.trim() ? folderColumnName : col.name}
                        {sk && <span className="showcase-sort-ind"> {sk.dir === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                    );
                  })}
                </tr>
                <tr className="showcase-filter-row">
                  {columns.map(col => (
                    <th key={col.name}>
                      <input
                        type="text"
                        className="showcase-filter-input"
                        value={filters[col.name] || ''}
                        placeholder="filter…"
                        onChange={e => handleFilterChange(col.name, e.target.value)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={columns.length} className="showcase-empty">No folders with properties.</td></tr>
                ) : sorted.map(row => {
                  const selected = row.path === selectedPath;
                  return (
                    <tr
                      key={row.path}
                      data-showcase-path={row.path}
                      className={selected ? 'selected' : ''}
                      onClick={() => setSelectedPath(row.path)}
                    >
                      {columns.map(col => {
                        // FIX500.2.3.2.1.2.1.2: wrap flag on cell
                        const cellStyle = col.wrap
                          ? { whiteSpace: 'normal', wordBreak: 'break-word' }
                          : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                        if (col.name === 'Main image icon') {
                          return (
                            <td key={col.name} className="showcase-cell-icon">
                              {/* FIX501.30.3.3.3.2: Main Image Icon — only when a main image is flagged */}
                              {row.mainImage && <img src={imageUrl(row.mainImage)} alt="" style={{ height: `${mainImageIconHeight}px`, width: 'auto', maxWidth: 'none' }} />}
                            </td>
                          );
                        }
                        let value = getCellValue(row, col.name);
                        // FIX500.2.3.2.1.2.4: Roman year converter — postfix '(yyyy)' on 'Year' columns when the value is a Roman numeral
                        if (romanYearConverter && col.name.toLowerCase() === 'year' && value) {
                          const yr = romanToInt(value);
                          if (yr !== null) value = `${value} (${yr})`;
                        }
                        // FIX510.2.1.4: editing is on hold — Showcase is read-only; edit via File Explorer (Ctrl-Space)
                        return (
                          <td
                            key={col.name}
                            className={col.name === 'Folder name' ? 'showcase-cell-readonly' : undefined}
                            style={cellStyle}
                          >{value}</td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FIX502.2.3 / FIX520: Showcase Image viewer */}
        <div className="showcase-viewer" data-yagu-id="panel-showcase-img-viewer">
          {/* FIX520.2.1: Image */}
          <div className="showcase-viewer-image">
            {viewerImages.length > 0 ? (
              <img src={imageUrl(viewerImages[viewerIndex])} alt="" />
            ) : (
              <div className="showcase-viewer-empty">
                {selectedRow ? 'No images in this folder' : 'Select a folder to view its images'}
              </div>
            )}
          </div>
          {/* FIX520.2.2 / FIX520.2.3: Previous / Next image */}
          <div className="showcase-viewer-nav">
            <button
              className="showcase-viewer-nav-btn"
              onClick={() => setViewerIndex(i => Math.max(0, i - 1))}
              disabled={viewerImages.length === 0 || viewerIndex === 0}
              title="Previous image"
            >&lt;</button>
            <span className="showcase-viewer-counter">
              {viewerImages.length === 0 ? '' : `${viewerIndex + 1} / ${viewerImages.length}`}
            </span>
            <button
              className="showcase-viewer-nav-btn"
              onClick={() => setViewerIndex(i => Math.min(viewerImages.length - 1, i + 1))}
              disabled={viewerImages.length === 0 || viewerIndex >= viewerImages.length - 1}
              title="Next image"
            >&gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableCell({ value, onCommit, wrap }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  if (wrap) {
    return (
      <textarea
        className="showcase-cell-textarea"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); } }}
        onClick={e => e.stopPropagation()}
      />
    );
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); } }}
      onClick={e => e.stopPropagation()}
    />
  );
}
