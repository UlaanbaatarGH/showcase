/**
 * FIX501 — Photo Module
 * Standalone file explorer + image viewer, using the Agent server for file I/O.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ImageEditor from './ImageEditor.jsx';
import FolderPanel from './FolderPanel.jsx';
import ShowcaseView from '../ShowcaseView.jsx';
import SlaveFileExplorer from './SlaveFileExplorer.jsx';
import './PhotoModule.css';

const SERVER_URL = 'http://localhost:3001';
const LS_KEY = 'photo-module-root';
const SORT_FILE = 'sort.txt';
const SETUP_FILE = '.photo-setup.json'; // FIX505.3.10.1
const PROPERTIES_FILE = 'properties.txt'; // FIX500.20 / FIX501.3.3.5.2.2
const MAIN_IMAGE_FILE = '.main-image.txt'; // FIX501.3.5.3 / FIX501.30.3.3
const NOTE_FILE = '.note.txt'; // FIX501.3.3.5.5
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

function isImageFile(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTS.has(name.substring(dot).toLowerCase());
}

// ── Agent helpers ─────────────────────────────────────────────────────────────

async function fetchDirList(dirPath) {
  const res = await fetch(`${SERVER_URL}/agent/dir/list?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.entries || [];
}

async function agentRename(oldPath, newPath) {
  await fetch(`${SERVER_URL}/agent/dir/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
}

async function agentMkdir(dirPath) {
  await fetch(`${SERVER_URL}/agent/dir/mkdir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });
}

// FIX501.50.9.2: copy a file/folder recursively on the server
async function agentCopy(src, dst) {
  await fetch(`${SERVER_URL}/agent/dir/copy`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src, dst }),
  });
}

async function agentRemove(targetPath) {
  await fetch(`${SERVER_URL}/agent/dir/rmdir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });
}

// FIX501.3.3.5.5: per-folder note stored in .note.txt (single line)
async function readFolderNote(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + NOTE_FILE)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return (data.content || '').split('\n')[0];
  } catch { return ''; }
}
async function writeFolderNote(folderPath, text) {
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath + '/' + NOTE_FILE, content: text || '' }),
  });
}

// FIX501.3.5.3: Read main image marker for a folder
async function readMainImageName(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + MAIN_IMAGE_FILE)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data.content || '').trim();
    return name || null;
  } catch { return null; }
}

async function readSortFile(dirPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(dirPath + '/' + SORT_FILE)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content || '').split('\n').filter(Boolean);
  } catch { return null; }
}

async function writeSortFile(dirPath, names) {
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath + '/' + SORT_FILE, content: names.join('\n') }),
  });
}

// FIX500.1.2: Photo setup — load/save list of property labels
async function loadSetup(rootFolder) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(rootFolder + '/' + SETUP_FILE)}`);
    if (!res.ok) return { properties: [], showcaseColumns: [{ name: 'Folder name', widthSample: '', wrap: false }], mainImageIconHeight: 80, folderColumnName: '', romanYearConverter: false };
    const data = await res.json();
    if (!data.content) return { properties: [], showcaseColumns: [{ name: 'Folder name', widthSample: '', wrap: false }], mainImageIconHeight: 80, folderColumnName: '', romanYearConverter: false };
    const parsed = JSON.parse(data.content);
    // FIX506.2.1.1: migrate / repair properties to ensure every entry has a valid numeric id
    const raw = parsed.properties || [];
    // Pass 1: normalize — strings → {id:null, label}; objects → keep valid numeric id, else null
    const props = raw.map(p => {
      if (typeof p === 'string') return { id: null, label: p };
      const validId = (typeof p.id === 'number' && Number.isFinite(p.id));
      return { id: validId ? p.id : null, label: p.label || '' };
    }).filter(p => p.label.trim());
    // Pass 2: assign fresh unique IDs to any entry with id === null
    const used = new Set(props.filter(p => p.id !== null).map(p => p.id));
    let next = 1;
    for (const p of props) {
      if (p.id === null) {
        while (used.has(next)) next++;
        p.id = next;
        used.add(next);
      }
    }
    // FIX500.2.3.2.1: showcase columns — default must include 'Folder name'
    // FIX500.2.3.2.1.2.1.1 / .1.2: each column is { name, widthSample, wrap }
    const rawCols = Array.isArray(parsed.showcaseColumns)
      ? parsed.showcaseColumns.map(c => {
          if (typeof c === 'string') return { name: c, widthSample: '', wrap: false };
          if (c && typeof c === 'object' && typeof c.name === 'string') {
            return { name: c.name, widthSample: typeof c.widthSample === 'string' ? c.widthSample : '', wrap: !!c.wrap };
          }
          return null;
        }).filter(Boolean)
      : [];
    const showcaseColumns = rawCols.some(c => c.name === 'Folder name')
      ? rawCols
      : [{ name: 'Folder name', widthSample: '', wrap: false }, ...rawCols];
    // FIX506.2.2: Main Image Icon height (px) — cannot be empty, default 80
    const rawH = parsed.mainImageIconHeight;
    const mainImageIconHeight = (typeof rawH === 'number' && rawH > 0) ? rawH : 80;
    // FIX500.2.3.2.1.2.3: optional override for the 'Folder name' column header
    const folderColumnName = typeof parsed.folderColumnName === 'string' ? parsed.folderColumnName : '';
    // FIX500.2.3.2.1.2.4: Roman year converter flag
    const romanYearConverter = !!parsed.romanYearConverter;
    return { properties: props, showcaseColumns, mainImageIconHeight, folderColumnName, romanYearConverter };
  } catch { return { properties: [], showcaseColumns: [{ name: 'Folder name', widthSample: '', wrap: false }], mainImageIconHeight: 80, folderColumnName: '', romanYearConverter: false }; }
}

async function saveSetup(rootFolder, setup) {
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: rootFolder + '/' + SETUP_FILE, content: JSON.stringify(setup, null, 2) }),
  });
}

// FIX506.2.1.1: Property format = { id: number, label: string }
// properties.txt line format: "id:label:value"
// FIX501.3.3.5.5: optional leading "#:note:<text>" line carries the folder note
function serializePropertyFile(props, note) {
  const lines = [];
  if (note) lines.push(`#:note:${note}`);
  for (const p of props) lines.push(`${p.id}:${p.label}:${p.value ?? ''}`);
  return lines.join('\n') + '\n';
}

function parsePropertyFile(content) {
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

async function readPropertiesFile(folderPath) {
  try {
    const res = await fetch(`${SERVER_URL}/file/read?path=${encodeURIComponent(folderPath + '/' + PROPERTIES_FILE)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return parsePropertyFile(data.content || '');
  } catch { return null; }
}

async function writePropertiesFile(folderPath, props) {
  // FIX501.3.3.5.5: preserve the folder note across any rewrite
  const note = await readFolderNote(folderPath);
  await fetch(`${SERVER_URL}/file/write`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath + '/' + PROPERTIES_FILE, content: serializePropertyFile(props, note) }),
  });
}

// FIX500.20 / FIX501.3.3.5.2.2: Create properties.txt in a folder (from setup)
async function createPropertiesFile(folderPath, setupProperties) {
  const props = setupProperties.map(sp => ({ id: sp.id, label: sp.label, value: '' }));
  await writePropertiesFile(folderPath, props);
}

// FIX505.3.10.2: Recursively find all folders containing properties.txt under a root
async function findPropertyFolders(rootPath) {
  const result = [];
  async function walk(dirPath) {
    const entries = await fetchDirList(dirPath);
    const hasProps = entries.some(e => e.type === 'file' && e.name === PROPERTIES_FILE);
    if (hasProps) result.push(dirPath);
    for (const e of entries) {
      if (e.type === 'folder') await walk(dirPath + '/' + e.name);
    }
  }
  await walk(rootPath);
  return result;
}

// FIX505.3.10.2: Apply setup changes to one properties.txt file
async function propagateSetupChange(folderPath, newSetupProps) {
  const existing = await readPropertiesFile(folderPath);
  if (!existing) return;
  const existingById = new Map(existing.map(p => [p.id, p]));
  const updated = newSetupProps.map(sp => {
    const prev = existingById.get(sp.id);
    return { id: sp.id, label: sp.label, value: prev ? prev.value : '' };
  });
  await writePropertiesFile(folderPath, updated);
}

// ── Tree Node component ──────────────────────────────────────────────────────

function TreeNode({ entry, parentPath, depth, selectedPaths, onSelect, onRefreshParent, onContextMenu, registerPath, forcedExpanded, forcedCollapsed, onDropPaths, treeRefreshVersion }) {
  const fullPath = parentPath + '/' + entry.name;
  const isFolder = entry.type === 'folder';
  const [expanded, setExpanded] = useState(depth < 2); // FIX500.30.2.1: expand levels 0-1
  const [children, setChildren] = useState(null); // null = not loaded
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(entry.name);
  const renameRef = useRef(null);
  // FIX501.3.3.5.5: per-folder note, shown after the folder name
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!isFolder) return;
    let cancelled = false;
    readFolderNote(fullPath).then(n => { if (!cancelled) setNote(n); });
    return () => { cancelled = true; };
  }, [fullPath, isFolder, treeRefreshVersion]);

  // FIX501.3.3.5: Register this path for shift-click range selection (during render)
  registerPath?.(fullPath);

  // FIX510.3.1: When jumping from Showcase, expand ancestors so target becomes visible
  useEffect(() => {
    if (forcedExpanded && forcedExpanded.has(fullPath) && !expanded) {
      setExpanded(true);
    }
  }, [forcedExpanded, fullPath, expanded]);
  // FIX501.3.3.5.3: Collapse-all command
  useEffect(() => {
    if (forcedCollapsed && forcedCollapsed.has(fullPath) && expanded) {
      setExpanded(false);
    }
  }, [forcedCollapsed, fullPath, expanded]);

  const lastRefreshSeenRef = useRef(0);

  const loadChildren = useCallback(async () => {
    if (!isFolder) return;
    const raw = await fetchDirList(fullPath);
    // FIX501.3.5.1 / FIX501.3.5.2: detect meta files, filter them out, mark files that have one
    // FIX501.3.3.5.2.3: filter out properties.txt; also .main-image.txt
    const META_SUFFIX = '.meta.json';
    const metaNames = new Set(raw.filter(e => e.type === 'file' && e.name.endsWith(META_SUFFIX)).map(e => e.name));
    const filtered = raw.filter(e => !(e.type === 'file' && (e.name.endsWith(META_SUFFIX) || e.name === PROPERTIES_FILE || e.name === MAIN_IMAGE_FILE || e.name === NOTE_FILE)));
    // FIX501.3.5.3: read main image marker for this folder
    const mainImg = await readMainImageName(fullPath);
    for (const e of filtered) {
      e.hasMeta = metaNames.has(e.name + META_SUFFIX);
      e.isMainImage = e.type === 'file' && mainImg === e.name;
    }
    // Apply sort file ordering
    const sortOrder = await readSortFile(fullPath);
    if (sortOrder && sortOrder.length > 0) {
      const orderMap = new Map(sortOrder.map((n, i) => [n, i]));
      filtered.sort((a, b) => {
        const ai = orderMap.has(a.name) ? orderMap.get(a.name) : 9999;
        const bi = orderMap.has(b.name) ? orderMap.get(b.name) : 9999;
        if (ai !== bi) return ai - bi;
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    setChildren(filtered);
  }, [fullPath, isFolder]);

  useEffect(() => {
    if (isFolder && expanded && children === null) {
      loadChildren();
    }
  }, [isFolder, expanded, children, loadChildren]);

  // Global refresh signal — re-fetch children if we've already loaded them
  useEffect(() => {
    if (treeRefreshVersion > 0 && treeRefreshVersion !== lastRefreshSeenRef.current && children !== null) {
      lastRefreshSeenRef.current = treeRefreshVersion;
      loadChildren();
    }
  }, [treeRefreshVersion, children, loadChildren]);

  // FIX501.3.3.5: Click selects (no expand/collapse)
  const handleClick = (e) => {
    const type = isFolder ? 'folder' : 'file';
    onSelect(fullPath, type, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  };

  // FIX501.3.1.2: Icon click toggles expand/collapse (does not affect selection)
  const handleIconClick = (e) => {
    if (!isFolder) return;
    e.stopPropagation();
    setExpanded(v => !v);
  };

  const handleRenameSubmit = async () => {
    const newName = renameValue.trim();
    setRenaming(false);
    if (!newName || newName === entry.name) return;
    const newPath = parentPath + '/' + newName;
    await agentRename(fullPath, newPath);
    onRefreshParent();
  };

  const icon = isFolder
    ? (expanded ? '📂' : '📁')  // FIX501.3.1.1
    : (isImageFile(entry.name) ? '🖼' : '📄');

  // FIX501.50.7 / FIX501.3.3.2.2: drop target with before/after/into zones
  const [dropZone, setDropZone] = useState(null); // 'before' | 'after' | 'into' | null
  const rowRef = useRef(null);
  const zoneFromEvent = (e) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (isFolder) {
      if (y < h * 0.25) return 'before';
      if (y > h * 0.75) return 'after';
      return 'into';
    }
    return y < h / 2 ? 'before' : 'after';
  };
  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/x-photo-paths')) return;
    e.preventDefault();
    e.stopPropagation();
    const z = zoneFromEvent(e);
    if (z !== dropZone) setDropZone(z);
  };
  const handleDragLeave = () => setDropZone(null);
  const handleDrop = async (e) => {
    if (!e.dataTransfer.types.includes('application/x-photo-paths')) return;
    e.preventDefault();
    e.stopPropagation();
    const z = zoneFromEvent(e) || dropZone;
    setDropZone(null);
    const raw = e.dataTransfer.getData('application/x-photo-paths');
    const paths = raw.split('\n').filter(Boolean);
    let destFolder = parentPath;
    let beforeName = null;
    if (z === 'into' && isFolder) {
      destFolder = fullPath;
    } else if (z === 'before') {
      destFolder = parentPath;
      beforeName = entry.name;
    } else if (z === 'after') {
      destFolder = parentPath;
      // Find the next sibling in the currently-visible order
      const siblings = await fetchDirList(parentPath);
      const sortOrder = await readSortFile(parentPath);
      let names = siblings.map(s => s.name);
      if (sortOrder && sortOrder.length > 0) {
        const m = new Map(sortOrder.map((n, i) => [n, i]));
        names.sort((a, b) => {
          const ai = m.has(a) ? m.get(a) : Infinity;
          const bi = m.has(b) ? m.get(b) : Infinity;
          if (ai !== bi) return ai - bi;
          return a.localeCompare(b);
        });
      }
      const idx = names.indexOf(entry.name);
      beforeName = (idx >= 0 && idx + 1 < names.length) ? names[idx + 1] : null;
    }
    await onDropPaths?.(paths, destFolder, beforeName);
    if (z === 'into' && isFolder) {
      await loadChildren();
      if (!expanded) setExpanded(true);
    } else {
      onRefreshParent?.();
    }
  };

  // FIX501.3.3.2.2: master rows are also drag sources (drag within master)
  const handleDragStart = (e) => {
    const paths = selectedPaths.has(fullPath) ? [...selectedPaths] : [fullPath];
    e.dataTransfer.setData('application/x-photo-paths', paths.join('\n'));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  return (
    <div className="photo-tree-node">
      <div
        ref={rowRef}
        className={`photo-tree-row${selectedPaths.has(fullPath) ? ' selected' : ''}${dropZone ? ' drop-' + dropZone : ''}`}
        data-tree-path={fullPath}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(entry.name); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, fullPath, parentPath, { isFolder, expanded }); }}
      >
        <span
          className="photo-tree-icon"
          onClick={handleIconClick}
          style={isFolder ? { cursor: 'pointer' } : undefined}
        >{icon}</span>
        {renaming ? (
          <input
            ref={renameRef}
            className="photo-tree-rename"
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(false); }}
            autoFocus
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="photo-tree-label" style={entry.hasMeta ? { fontStyle: 'italic' } : undefined}>
            {entry.name}
            {/* FIX501.3.5.3.1: green tick next to main image file name */}
            {entry.isMainImage && <span className="photo-tree-main-tick" title="Main image">✓</span>}
            {/* FIX501.3.3.5.5.3: folder note */}
            {isFolder && note && <span className="photo-tree-note"> — {note}</span>}
          </span>
        )}
      </div>
      {isFolder && expanded && children && (
        <div className="photo-tree-children">
          {children.map(child => (
            <TreeNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              selectedPaths={selectedPaths}
              onSelect={onSelect}
              onRefreshParent={loadChildren}
              onContextMenu={onContextMenu}
              registerPath={registerPath}
              forcedExpanded={forcedExpanded}
              forcedCollapsed={forcedCollapsed}
              onDropPaths={onDropPaths}
              treeRefreshVersion={treeRefreshVersion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Photo Module main component ──────────────────────────────────────────────

export default function PhotoModule({ onClose }) {
  const [rootFolder, setRootFolder] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [rootEntries, setRootEntries] = useState(null);
  // FIX501.3.3.5: Multi-selection
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState(null); // for shift-click range
  const visiblePathsRef = useRef([]); // ordered list of all visible paths for shift-click
  const [rootInput, setRootInput] = useState('');
  // FIX501.3.3.5: Context menu
  const [contextMenu, setContextMenu] = useState(null); // { x, y, path, parentPath }
  // FIX501.3.3.5.1: Move to subfolder dialog
  const [moveDialog, setMoveDialog] = useState(null); // { parentPath, defaultName }
  const [moveDialogName, setMoveDialogName] = useState('');
  // FIX501.3.3.5.4: Rename dialog
  const [renameDialog, setRenameDialog] = useState(null); // { path } | null
  const [renameDialogValue, setRenameDialogValue] = useState('');
  // FIX501.3.3.5.5: Add-note dialog
  const [noteDialog, setNoteDialog] = useState(null); // { path } | null
  const [noteDialogValue, setNoteDialogValue] = useState('');
  // FIX500.1.2: Photo setup (list of property labels)
  const [setup, setSetup] = useState({ properties: [], showcaseColumns: [{ name: 'Folder name', widthSample: '', wrap: false }], mainImageIconHeight: 80, folderColumnName: '', romanYearConverter: false });
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState([]); // working copy while dialog is open
  // FIX500.2.3.2.1: Showcase columns draft
  const [showcaseDraft, setShowcaseDraft] = useState([{ name: 'Folder name', widthSample: '', wrap: false }]);
  // FIX506.2.2: Main Image Icon height draft (as string — input can be typed)
  const [iconHeightDraft, setIconHeightDraft] = useState('80');
  // FIX500.2.3.2.1.2.3: Folder column name override
  const [folderColumnNameDraft, setFolderColumnNameDraft] = useState('');
  // FIX500.2.3.2.1.2.4: Roman year converter
  const [romanYearDraft, setRomanYearDraft] = useState(false);
  // FIX505.2.1 / FIX505.2.2: active tab in Setup dialog
  const [setupTab, setSetupTab] = useState('file-explorer'); // 'file-explorer' | 'showcase'
  // FIX501.3.3.10.2: Track the currently selected folder path IF it has properties.txt
  const [folderWithProps, setFolderWithProps] = useState(null);
  // Bump this to force FolderPanel to re-read its files after a setup save
  const [folderPanelRefresh, setFolderPanelRefresh] = useState(0);
  // FIX500.1.1: Menu + view switching
  const [currentView, setCurrentView] = useState('file-explorer'); // 'file-explorer' | 'showcase'
  const [menuOpen, setMenuOpen] = useState(null); // null | 'view'
  // FIX501.3.3.6 / FIX510.3.1: cross-view navigation
  const [showcaseSelectedPath, setShowcaseSelectedPath] = useState(null);
  const [forcedExpanded, setForcedExpanded] = useState(new Set());
  // FIX501.3.3.5.3: force-collapse set — counterpart to forcedExpanded
  const [forcedCollapsed, setForcedCollapsed] = useState(new Set());
  // Self-clear the force sets after children have applied them so they don't
  // linger and block subsequent manual expand/collapse.
  useEffect(() => {
    if (forcedExpanded.size === 0) return;
    const id = requestAnimationFrame(() => setForcedExpanded(new Set()));
    return () => cancelAnimationFrame(id);
  }, [forcedExpanded]);
  useEffect(() => {
    if (forcedCollapsed.size === 0) return;
    const id = requestAnimationFrame(() => setForcedCollapsed(new Set()));
    return () => cancelAnimationFrame(id);
  }, [forcedCollapsed]);
  // FIX501.4.2.4: 'Move to next' checkbox state — persists across image changes
  const [moveToNext, setMoveToNext] = useState(false);
  // Global signal: bump to make every loaded TreeNode re-read its children
  const [treeRefreshVersion, setTreeRefreshVersion] = useState(0);
  // FIX501.50: Split view
  const [splitView, setSplitView] = useState(() => localStorage.getItem('photo-module-split') === '1');
  // FIX501.50.8: Transfer mode — 'move' | 'copy'
  const [transferMode, setTransferMode] = useState(() => localStorage.getItem('photo-module-transfer') || 'move');
  const slaveDragPathsRef = useRef([]); // paths picked up during dragstart on slave

  const loadRoot = useCallback(async (folder) => {
    if (!folder) return;
    const entries = await fetchDirList(folder);
    // FIX501.3.5.1 / FIX501.3.5.2: detect meta files, filter them out, mark files that have one
    // FIX501.3.3.5.2.3: filter out properties.txt; also .main-image.txt
    const META_SUFFIX = '.meta.json';
    const metaNames = new Set(entries.filter(e => e.type === 'file' && e.name.endsWith(META_SUFFIX)).map(e => e.name));
    const filtered = entries.filter(e => !(e.type === 'file' && (e.name.endsWith(META_SUFFIX) || e.name === PROPERTIES_FILE || e.name === MAIN_IMAGE_FILE || e.name === NOTE_FILE)));
    // FIX501.3.5.3: read main image marker for the root folder
    const mainImg = await readMainImageName(folder);
    for (const e of filtered) {
      e.hasMeta = metaNames.has(e.name + META_SUFFIX);
      e.isMainImage = e.type === 'file' && mainImg === e.name;
    }
    // Apply sort ordering
    const sortOrder = await readSortFile(folder);
    if (sortOrder && sortOrder.length > 0) {
      const orderMap = new Map(sortOrder.map((n, i) => [n, i]));
      filtered.sort((a, b) => {
        const ai = orderMap.has(a.name) ? orderMap.get(a.name) : 9999;
        const bi = orderMap.has(b.name) ? orderMap.get(b.name) : 9999;
        if (ai !== bi) return ai - bi;
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    setRootEntries(filtered);
  }, []);

  // FIX500.30.2: Load root folder content on mount
  useEffect(() => {
    if (rootFolder) {
      loadRoot(rootFolder);
      loadSetup(rootFolder).then(setSetup);
    }
  }, [rootFolder, loadRoot]);

  const handleSetRoot = () => {
    // Strip wrapping quotes (Windows "Copy as path" pastes the path quoted)
    const folder = rootInput.trim().replace(/^["']|["']$/g, '').trim();
    if (!folder) return;
    localStorage.setItem(LS_KEY, folder);
    setRootFolder(folder);
  };

  // FIX501.3.3.5: Multi-select handler
  const handleSelect = (path, type, { ctrl, shift } = {}) => {
    setContextMenu(null); // close context menu on any click
    if (shift && lastSelectedPath) {
      // FIX501.3.3.5.3: Shift-click — range select
      const paths = visiblePathsRef.current;
      const fromIdx = paths.indexOf(lastSelectedPath);
      const toIdx = paths.indexOf(path);
      if (fromIdx >= 0 && toIdx >= 0) {
        const lo = Math.min(fromIdx, toIdx);
        const hi = Math.max(fromIdx, toIdx);
        const range = new Set(paths.slice(lo, hi + 1));
        setSelectedPaths(prev => new Set([...prev, ...range]));
      }
    } else if (ctrl) {
      // FIX501.3.3.5.2: Ctrl-click — toggle
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    } else {
      // FIX501.3.3.5.1: Plain click — single select
      setSelectedPaths(new Set([path]));
    }
    setLastSelectedPath(path);
  };

  // Register visible paths for shift-click range selection.
  // Each TreeNode calls registerPath(fullPath) during render (top-down order).
  // We reset the array at the start of each render via a ref counter.
  // Each parent render bumps renderTokenRef. The FIRST child to call registerPath
  // in a new token cycle resets visiblePaths, then itself + all subsequent children push.
  // This is robust to strict-mode double rendering AND to children that don't re-render.
  const renderTokenRef = useRef(0);
  const seenTokenRef = useRef(-1);
  renderTokenRef.current++;
  const registerPath = useCallback((path) => {
    if (seenTokenRef.current !== renderTokenRef.current) {
      seenTokenRef.current = renderTokenRef.current;
      visiblePathsRef.current = [];
    }
    visiblePathsRef.current.push(path);
  }, []);

  const handleAddFolder = async () => {
    if (!rootFolder) return;
    // Use first selected folder, or root
    let targetDir = rootFolder;
    for (const p of selectedPaths) {
      // Check if it's a folder by seeing if entries exist (simple heuristic: no extension)
      targetDir = p;
      break;
    }
    const name = prompt('New folder name:');
    if (!name?.trim()) return;
    await agentMkdir(targetDir + '/' + name.trim());
    loadRoot(rootFolder);
  };

  const handleRemove = async () => {
    if (selectedPaths.size === 0) return;
    const names = [...selectedPaths].map(p => p.split('/').pop()).join(', ');
    if (!confirm(`Delete ${names}?`)) return;
    // FIX501.3.3.4.1: pick the node that will be selected after deletion
    const paths = visiblePathsRef.current || [];
    const deletedSet = selectedPaths;
    const isDeleted = (p) => {
      for (const d of deletedSet) {
        if (p === d || p.startsWith(d + '/')) return true;
      }
      return false;
    };
    let firstDelIdx = -1, lastDelIdx = -1;
    paths.forEach((p, i) => {
      if (deletedSet.has(p)) {
        if (firstDelIdx < 0) firstDelIdx = i;
        lastDelIdx = i;
      }
    });
    let successor = null;
    for (let j = lastDelIdx + 1; j < paths.length; j++) {
      if (!isDeleted(paths[j])) { successor = paths[j]; break; }
    }
    if (!successor && firstDelIdx > 0) {
      for (let j = firstDelIdx - 1; j >= 0; j--) {
        if (!isDeleted(paths[j])) { successor = paths[j]; break; }
      }
    }
    for (const p of selectedPaths) {
      if (p !== rootFolder) await agentRemove(p);
    }
    if (successor) {
      setSelectedPaths(new Set([successor]));
      setLastSelectedPath(successor);
    } else {
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
    loadRoot(rootFolder);
    setTreeRefreshVersion(v => v + 1);
  };

  // FIX501.3.3.5: Context menu handler
  const handleContextMenu = (e, path, parentPath, nodeInfo = {}) => {
    // Ensure right-clicked item is in selection
    if (!selectedPaths.has(path)) {
      setSelectedPaths(new Set([path]));
      setLastSelectedPath(path);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, path, parentPath, ...nodeInfo });
  };

  // FIX501.3.3.5.4: Open rename dialog (folders only — FIX501.3.3.5.4.1)
  const handleRenameMenuOption = () => {
    if (!contextMenu || !contextMenu.isFolder) return;
    const name = contextMenu.path.split('/').pop();
    setRenameDialog({ path: contextMenu.path });
    setRenameDialogValue(name);
    setContextMenu(null);
  };
  const handleRenameDialogOk = async () => {
    if (!renameDialog) return;
    const name = renameDialogValue.trim();
    if (!name) return;
    const oldPath = renameDialog.path;
    const parent = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = parent + '/' + name;
    if (newPath !== oldPath) {
      await agentRename(oldPath, newPath);
      await loadRoot(rootFolder);
      setTreeRefreshVersion(v => v + 1);
      // If the renamed folder was selected, update selection to the new path
      if (selectedPaths.has(oldPath)) {
        setSelectedPaths(new Set([newPath]));
        setLastSelectedPath(newPath);
      }
    }
    setRenameDialog(null);
  };

  // FIX501.3.3.5.6: Duplicate a file with '-{n}' suffix (files only — .6.1)
  const handleDuplicateMenuOption = async () => {
    if (!contextMenu || contextMenu.isFolder) return;
    const src = contextMenu.path;
    const parent = contextMenu.parentPath;
    const srcName = src.substring(src.lastIndexOf('/') + 1);
    const dotIdx = srcName.lastIndexOf('.');
    const base = dotIdx >= 0 ? srcName.substring(0, dotIdx) : srcName;
    const ext = dotIdx >= 0 ? srcName.substring(dotIdx) : '';
    const siblings = await fetchDirList(parent);
    const existing = new Set(siblings.map(e => e.name));
    // FIX501.3.3.5.6.2: smallest n (1-based) that doesn't collide
    let n = 1;
    while (existing.has(`${base}-${n}${ext}`)) n++;
    const newName = `${base}-${n}${ext}`;
    await agentCopy(src, parent + '/' + newName);
    // Also copy the sidecar meta file if it exists
    try { await agentCopy(src + '.meta.json', parent + '/' + newName + '.meta.json'); } catch { /* no meta */ }
    setContextMenu(null);
    await loadRoot(rootFolder);
    setTreeRefreshVersion(v => v + 1);
    setFolderPanelRefresh(v => v + 1);
  };

  // FIX501.3.3.5.5: Open add-note dialog (folders only — FIX501.3.3.5.5.1)
  const handleAddNoteMenuOption = async () => {
    if (!contextMenu || !contextMenu.isFolder) return;
    const current = await readFolderNote(contextMenu.path);
    setNoteDialog({ path: contextMenu.path });
    setNoteDialogValue(current);
    setContextMenu(null);
  };
  const handleNoteDialogOk = async () => {
    if (!noteDialog) return;
    await writeFolderNote(noteDialog.path, noteDialogValue.trim());
    // Also mirror the note into properties.txt when it exists so it shows there too.
    const existing = await readPropertiesFile(noteDialog.path);
    if (existing) await writePropertiesFile(noteDialog.path, existing);
    setNoteDialog(null);
    setTreeRefreshVersion(v => v + 1);
    setFolderPanelRefresh(n => n + 1);
  };

  // FIX501.3.3.5.3: Collapse-all / Expand-all — toggle expansion of all sibling folders
  const handleToggleSiblings = async () => {
    if (!contextMenu || !contextMenu.isFolder) return;
    const { parentPath, expanded } = contextMenu;
    const siblings = await fetchDirList(parentPath);
    const siblingFolderPaths = siblings
      .filter(e => e.type === 'folder')
      .map(e => parentPath + '/' + e.name);
    if (expanded) {
      setForcedCollapsed(new Set(siblingFolderPaths));
      setForcedExpanded(new Set()); // release any previous expansion lock
    } else {
      setForcedExpanded(new Set(siblingFolderPaths));
      setForcedCollapsed(new Set());
    }
    setContextMenu(null);
  };

  // FIX501.3.3.5.1: Move to subfolder
  const handleMoveToSubfolder = () => {
    if (selectedPaths.size === 0) return;
    // Determine parent folder of the first selected item
    const firstPath = [...selectedPaths][0];
    const parentPath = firstPath.substring(0, firstPath.lastIndexOf('/'));
    // FIX501.3.3.5.1.1.1.1: Default name is a 3-digit number from 001, incremented within parent folder
    const existingNames = new Set((rootEntries || []).map(e => e.name));
    let n = 1;
    const pad = (v) => String(v).padStart(3, '0');
    while (existingNames.has(pad(n))) n++;
    const defaultName = pad(n);
    setMoveDialog({ parentPath, defaultName });
    setMoveDialogName(defaultName);
    setContextMenu(null);
  };

  // FIX501.3.3.5.2: Add Properties — create properties.txt in the selected folder
  const handleAddProperties = async () => {
    if (!contextMenu) return;
    const folderPath = contextMenu.path;
    await createPropertiesFile(folderPath, setup.properties || []);
    setContextMenu(null);
    // Directly show the Folder panel for this folder (FIX501.3.3.10.2)
    setFolderWithProps(folderPath);
  };

  // Check if the context-clicked folder already has a properties.txt
  // (cached on contextMenu state, fetched when context menu opens)
  const [contextFolderHasProps, setContextFolderHasProps] = useState(false);
  useEffect(() => {
    if (!contextMenu) { setContextFolderHasProps(false); return; }
    // Only check for single folder selection
    if (selectedPaths.size !== 1) { setContextFolderHasProps(true); return; } // hide menu item
    const firstPath = [...selectedPaths][0];
    if (firstPath !== contextMenu.path) { setContextFolderHasProps(true); return; }
    // Check if it's a folder by looking at rootEntries or fetching
    fetchDirList(contextMenu.path).then(entries => {
      const hasProps = entries.some(e => e.type === 'file' && e.name === PROPERTIES_FILE);
      setContextFolderHasProps(hasProps);
    }).catch(() => setContextFolderHasProps(true)); // not a folder — hide
  }, [contextMenu, selectedPaths]);

  // FIX500.1.2: Photo setup handlers
  // FIX506.2.1.1: properties are { id, label }
  const nextPropertyId = (props) => (props.reduce((max, p) => Math.max(max, p.id), 0) + 1);

  const handleOpenSetup = () => {
    // Draft is a deep copy of current setup properties
    setSetupDraft((setup.properties || []).map(p => ({ id: p.id, label: p.label })));
    setShowcaseDraft((setup.showcaseColumns || [{ name: 'Folder name', widthSample: '', wrap: false }]).map(c => ({ ...c })));
    setIconHeightDraft(String(setup.mainImageIconHeight || 80));
    setFolderColumnNameDraft(setup.folderColumnName || '');
    setRomanYearDraft(!!setup.romanYearConverter);
    setSetupDialogOpen(true);
  };

  const handleSetupSave = async () => {
    const cleaned = setupDraft.filter(p => p.label.trim()).map(p => ({ id: p.id, label: p.label.trim() }));
    // FIX500.2.3.2.1.3.2: 'Folder name' must always be present
    let columns = showcaseDraft.some(c => c.name === 'Folder name')
      ? showcaseDraft.map(c => ({ name: c.name, widthSample: c.widthSample || '', wrap: !!c.wrap }))
      : [{ name: 'Folder name', widthSample: '', wrap: false }, ...showcaseDraft.map(c => ({ name: c.name, widthSample: c.widthSample || '', wrap: !!c.wrap }))];
    // When a setup property is renamed, update any matching Showcase column name so
    // the Year/Roman converter (and all lookups) keep working.
    const oldById = new Map((setup.properties || []).map(p => [p.id, p.label]));
    const newById = new Map(cleaned.map(p => [p.id, p.label]));
    const renameMap = new Map();
    for (const [id, oldLabel] of oldById) {
      const newLabel = newById.get(id);
      if (newLabel && newLabel !== oldLabel) renameMap.set(oldLabel, newLabel);
    }
    if (renameMap.size > 0) {
      columns = columns.map(c => renameMap.has(c.name) ? { ...c, name: renameMap.get(c.name) } : c);
    }
    // FIX506.5.2: On save, update <list-showcase-columns-setup> — drop columns
    // whose underlying property has been removed. Keep 'Folder name' and 'Main image icon'.
    const validNames = new Set(['Folder name', 'Main image icon', ...cleaned.map(p => p.label)]);
    columns = columns.filter(c => validNames.has(c.name));
    // FIX506.2.2.1: Main Image Icon height — cannot be empty; fall back to 80 if invalid
    const parsedH = parseInt(iconHeightDraft, 10);
    const mainImageIconHeight = (Number.isFinite(parsedH) && parsedH > 0) ? parsedH : 80;
    const newSetup = { properties: cleaned, showcaseColumns: columns, mainImageIconHeight, folderColumnName: folderColumnNameDraft, romanYearConverter: romanYearDraft };
    await saveSetup(rootFolder, newSetup);
    setSetup(newSetup);
    // FIX505.3.10.2: propagate changes to all folder property files
    const folders = await findPropertyFolders(rootFolder);
    for (const f of folders) {
      await propagateSetupChange(f, cleaned);
    }
    setSetupDialogOpen(false);
    // Force FolderPanel to re-read
    setFolderPanelRefresh(n => n + 1);
  };

  const handleSetupCancel = () => setSetupDialogOpen(false);

  const handleSetupAdd = () => setSetupDraft(d => [...d, { id: nextPropertyId(d), label: '' }]);
  const handleSetupInsert = (idx) => setSetupDraft(d => [...d.slice(0, idx), { id: nextPropertyId(d), label: '' }, ...d.slice(idx)]);
  const handleSetupRemove = (idx) => setSetupDraft(d => d.filter((_, i) => i !== idx));
  const handleSetupChange = (idx, value) => setSetupDraft(d => d.map((p, i) => i === idx ? { ...p, label: value } : p));

  // FIX500.2.3.2.1.3: Showcase columns actions
  const handleShowcaseAdd = (name) => setShowcaseDraft(d => [...d, { name, widthSample: '', wrap: false }]);
  const handleShowcaseRemove = (idx) => setShowcaseDraft(d => {
    // FIX500.2.3.2.1.3.2: 'Folder name' cannot be removed
    if (d[idx].name === 'Folder name') return d;
    return d.filter((_, i) => i !== idx);
  });
  // FIX500.2.3.2.1.2.1.1 / .1.2: update width sample and wrap flag per item
  const handleShowcaseWidthChange = (idx, value) => setShowcaseDraft(d => d.map((c, i) => i === idx ? { ...c, widthSample: value } : c));
  const handleShowcaseWrapChange = (idx, checked) => setShowcaseDraft(d => d.map((c, i) => i === idx ? { ...c, wrap: checked } : c));
  const handleShowcaseMove = (idx, delta) => setShowcaseDraft(d => {
    const j = idx + delta;
    if (j < 0 || j >= d.length) return d;
    const next = [...d];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const handleMoveDialogOk = async () => {
    if (!moveDialog || !moveDialogName.trim()) return;
    const newFolder = moveDialog.parentPath + '/' + moveDialogName.trim();
    await agentMkdir(newFolder);
    for (const p of selectedPaths) {
      const name = p.split('/').pop();
      await agentRename(p, newFolder + '/' + name);
      // FIX501.3.3.5.1.2.3: also move associated .meta.json if it exists
      const metaOld = p + '.meta.json';
      const metaNew = newFolder + '/' + name + '.meta.json';
      try { await agentRename(metaOld, metaNew); } catch { /* no meta file — ok */ }
    }
    setMoveDialog(null);
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
    loadRoot(rootFolder);
  };

  // Close context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  // FIX500.1.1: Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  // FIX501.3.3.7: Up/Down arrows move the selection in the tree (no scrollbar movement)
  useEffect(() => {
    const handler = (e) => {
      if (currentView !== 'file-explorer') return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const paths = visiblePathsRef.current;
      if (!paths || paths.length === 0) return;
      e.preventDefault();
      let idx = lastSelectedPath ? paths.indexOf(lastSelectedPath) : -1;
      if (idx < 0) idx = 0;
      else if (e.key === 'ArrowDown') idx = Math.min(paths.length - 1, idx + 1);
      else idx = Math.max(0, idx - 1);
      const next = paths[idx];
      setSelectedPaths(new Set([next]));
      setLastSelectedPath(next);
      // Keep the newly selected row visible within the scrolling tree area.
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-tree-path="${CSS.escape(next)}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentView, lastSelectedPath]);

  // FIX501.3.3.6 / FIX510.3.1: Ctrl-Space toggles between File Explorer and Showcase
  useEffect(() => {
    const handler = (e) => {
      if (!(e.ctrlKey && e.code === 'Space')) return;
      // Skip when user is typing in a form field
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (currentView === 'file-explorer' && selectedPaths.size === 1) {
        const p = [...selectedPaths][0];
        // FIX501.3.3.6: only jump if the selected node is a folder with a property file
        if (folderWithProps === p) {
          e.preventDefault();
          setShowcaseSelectedPath(p);
          setCurrentView('showcase');
        }
      } else if (currentView === 'showcase' && showcaseSelectedPath) {
        // FIX510.3.1
        e.preventDefault();
        const target = showcaseSelectedPath;
        // Expand each ancestor folder under root so the target becomes visible in the tree
        const ancestors = new Set();
        let cur = target;
        while (cur.length > rootFolder.length && cur.startsWith(rootFolder + '/')) {
          const parent = cur.substring(0, cur.lastIndexOf('/'));
          if (parent && parent !== rootFolder) ancestors.add(parent);
          cur = parent;
        }
        setForcedExpanded(ancestors);
        setSelectedPaths(new Set([target]));
        setLastSelectedPath(target);
        setCurrentView('file-explorer');
        // FIX510.3.1.1: scroll the target into view (ancestors load asynchronously)
        let attempts = 0;
        const tryScroll = () => {
          const el = document.querySelector(`[data-tree-path="${CSS.escape(target)}"]`);
          if (el) { el.scrollIntoView({ block: 'center' }); return; }
          if (++attempts < 30) requestAnimationFrame(tryScroll);
        };
        requestAnimationFrame(tryScroll);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentView, selectedPaths, folderWithProps, showcaseSelectedPath, rootFolder]);

  // FIX501.50.9 / FIX501.3.3.2: Drop onto master — move/copy cross-folder, reorder same-folder
  const handleMasterDrop = async (srcPaths, destFolder, beforeName) => {
    // FIX501.50.7.3 / .7.4: prevent drops onto self or descendant
    const filtered = srcPaths.filter(p => {
      if (p === destFolder) return false;
      if (destFolder.startsWith(p + '/')) return false; // move into own descendant
      const parent = p.substring(0, p.lastIndexOf('/'));
      // Same-parent, no reorder hint → no-op
      if (parent === destFolder && !beforeName) return false;
      return true;
    });
    if (filtered.length === 0) return;
    // Cross-folder items need physical move/copy; same-parent items are reorders only
    const crossFolder = filtered.filter(p => p.substring(0, p.lastIndexOf('/')) !== destFolder);
    for (const p of crossFolder) {
      const name = p.split('/').pop();
      const dst = destFolder + '/' + name;
      if (transferMode === 'copy') {
        await agentCopy(p, dst);
        try { await agentCopy(p + '.meta.json', dst + '.meta.json'); } catch { /* no meta file */ }
      } else {
        await agentRename(p, dst);
        try { await agentRename(p + '.meta.json', dst + '.meta.json'); } catch { /* no meta file */ }
      }
    }
    // FIX501.3.3.2.3: reorder — persist the order in sort.txt of destFolder
    if (beforeName) {
      const entries = await fetchDirList(destFolder);
      const existingOrder = await readSortFile(destFolder);
      let order = (existingOrder && existingOrder.length > 0) ? [...existingOrder] : entries.map(e => e.name);
      // Ensure all entries are represented in the order list
      for (const e of entries) if (!order.includes(e.name)) order.push(e.name);
      // Remove the dropped names from their current positions
      const placed = filtered.map(p => p.split('/').pop());
      order = order.filter(n => !placed.includes(n));
      // Insert them before beforeName (or at front if beforeName not found)
      const idx = order.indexOf(beforeName);
      if (idx >= 0) order.splice(idx, 0, ...placed);
      else order.unshift(...placed);
      await writeSortFile(destFolder, order);
    }
    await loadRoot(rootFolder);
    // Force FolderPanel / ShowcaseView to re-read in case the drop target is currently visible
    setFolderPanelRefresh(n => n + 1);
    // Invalidate every loaded TreeNode's children so source folders lose moved items
    setTreeRefreshVersion(v => v + 1);
  };

  // FIX501.50.8: Persist Split and transfer mode preferences
  useEffect(() => { localStorage.setItem('photo-module-split', splitView ? '1' : '0'); }, [splitView]);
  useEffect(() => { localStorage.setItem('photo-module-transfer', transferMode); }, [transferMode]);

  const handleChangeRoot = () => {
    setRootFolder('');
    setRootEntries(null);
    setRootInput('');
    localStorage.removeItem(LS_KEY);
  };

  // Show image if exactly one file is selected and it's an image
  const singleSelected = selectedPaths.size === 1 ? [...selectedPaths][0] : null;
  const showImage = singleSelected && isImageFile(singleSelected.split('/').pop() || '');

  // FIX501.3.3.10.2: When a single folder is selected, check if it has a properties.txt
  // NOTE: must stay above the `if (!rootFolder)` early return to keep hook order stable.
  useEffect(() => {
    if (!singleSelected || showImage) { setFolderWithProps(null); return; }
    // Try to list the folder; if it has properties.txt, set folderWithProps
    let cancelled = false;
    fetchDirList(singleSelected).then(entries => {
      if (cancelled) return;
      const hasProps = entries.some(e => e.type === 'file' && e.name === PROPERTIES_FILE);
      setFolderWithProps(hasProps ? singleSelected : null);
    }).catch(() => { if (!cancelled) setFolderWithProps(null); });
    return () => { cancelled = true; };
  }, [singleSelected, showImage]);

  // FIX500.30.1: Prompt for root folder if not set
  if (!rootFolder) {
    return (
      <div className="photo-module">
        <div className="photo-header">
          <span className="photo-header-title">Photo</span>
          <span style={{ flex: 1 }} />
          <button className="photo-header-btn" onClick={onClose}>Close</button>
        </div>
        <div className="photo-root-prompt">
          <label>Select root folder for the photo library:</label>
          <input
            type="text"
            value={rootInput}
            onChange={e => setRootInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSetRoot(); }}
            placeholder="C:/Photos"
          />
          <button onClick={handleSetRoot}>Open</button>
        </div>
      </div>
    );
  }
  // Check if move dialog OK should be enabled
  // FIX501.3.3.5.1.1.3: OK enabled when name is not empty (folder may already exist)
  const moveDialogNameValid = moveDialog && moveDialogName.trim();

  return (
    <div className="photo-module">
      {/* FIX500.1: Top bar — Menu + Setup */}
      <div className="photo-header">
        {/* FIX500.1.1: Menu bar */}
        {/* FIX500.1.1.1: Top menu 'View' */}
        <div className="photo-menu" onMouseDown={e => e.stopPropagation()}>
          <button
            className="photo-header-btn"
            onClick={() => setMenuOpen(m => m === 'view' ? null : 'view')}
          >View ▾</button>
          {menuOpen === 'view' && (
            <div className="photo-menu-dropdown">
              {/* FIX500.1.1.1.1: File Explorer */}
              <div
                className="photo-menu-item"
                onClick={() => { setCurrentView('file-explorer'); setMenuOpen(null); }}
              >File Explorer</div>
              {/* FIX500.1.1.1.2: Showcase */}
              <div
                className="photo-menu-item"
                onClick={() => { setCurrentView('showcase'); setMenuOpen(null); }}
              >Showcase</div>
              {/* FIX501.50.2: Split toggle */}
              <div
                className="photo-menu-item"
                onClick={() => { setSplitView(v => !v); setMenuOpen(null); }}
              >{splitView ? '✓ ' : ''}Split File Explorer</div>
            </div>
          )}
        </div>
        {/* FIX500.1.2.1: Setup button — wheel icon */}
        <button
          className="photo-header-btn"
          onClick={handleOpenSetup}
          title="Photo setup"
          data-yagu-action="button-photo-setup"
        >⚙</button>
        <span style={{ flex: 1 }} />
        <button className="photo-header-btn photo-header-close" onClick={onClose} title="Close">✕</button>
      </div>

      {/* FIX501: File Explorer View */}
      {currentView === 'file-explorer' && (
        <div className="photo-view-file-explorer" data-yagu-id="view-file-explorer">
          {/* FIX501.2: Header panel */}
          <div className="photo-view-header">
            <span className="photo-view-header-path">{rootFolder}</span>
            <span style={{ flex: 1 }} />
            {/* FIX501.50.8: Move/Copy toggle — only relevant when Split is ON */}
            {splitView && (
              <div className="photo-transfer-toggle">
                <label title="Move drops (rename)">
                  <input
                    type="radio"
                    name="transfer-mode"
                    checked={transferMode === 'move'}
                    onChange={() => setTransferMode('move')}
                  />
                  Move
                </label>
                <label title="Copy drops">
                  <input
                    type="radio"
                    name="transfer-mode"
                    checked={transferMode === 'copy'}
                    onChange={() => setTransferMode('copy')}
                  />
                  Copy
                </label>
              </div>
            )}
            <button className="photo-header-btn" onClick={handleChangeRoot}>Change Root</button>
          </div>
          {/* FIX501.50.3: Split layout — Slave side | Master side */}
          <div className={splitView ? 'photo-split-wrap' : 'photo-single-wrap'}>
            {splitView && (
              <SlaveFileExplorer onDragStartPaths={(paths) => { slaveDragPathsRef.current = paths; }} />
            )}
            <div className="photo-body">
            {/* FIX501.3: File explorer panel */}
            <div className="photo-explorer" data-yagu-id="panel-file-explorer">
              {/* Toolbar — fixed, does not scroll */}
              <div className="photo-explorer-toolbar">
                <button onClick={handleAddFolder} title="Add folder">+ Folder</button>
                <button onClick={handleRemove} title="Remove selected" disabled={selectedPaths.size === 0}>Remove</button>
                <button onClick={() => loadRoot(rootFolder)} title="Refresh">Refresh</button>
              </div>
              {/* FIX501.3.1.3: Tree — scrollable area only */}
              <div className="photo-explorer-tree">
                {rootEntries && rootEntries.map(entry => (
                  <TreeNode
                    key={entry.name}
                    entry={entry}
                    parentPath={rootFolder}
                    depth={0}
                    selectedPaths={selectedPaths}
                    onSelect={handleSelect}
                    onRefreshParent={() => loadRoot(rootFolder)}
                    onContextMenu={handleContextMenu}
                    registerPath={registerPath}
                    forcedExpanded={forcedExpanded}
                    forcedCollapsed={forcedCollapsed}
                    onDropPaths={handleMasterDrop}
                    treeRefreshVersion={treeRefreshVersion}
                  />
                ))}
              </div>
            </div>

            {/* FIX501.4: Image editor panel / FIX501.30: Folder panel */}
            {folderWithProps
              ? <FolderPanel folderPath={folderWithProps} refreshKey={folderPanelRefresh} mainImageIconHeight={setup.mainImageIconHeight || 80} />
              : <ImageEditor
                  imagePath={showImage ? singleSelected : null}
                  onRefresh={() => { loadRoot(rootFolder); setTreeRefreshVersion(v => v + 1); }}
                  moveToNext={moveToNext}
                  onMoveToNextChange={setMoveToNext}
                  onAfterSave={() => {
                    // FIX501.4.4.10.1 / FIX501.4.4.11.1: advance selection after save when checkbox is ON
                    if (!moveToNext) return;
                    const paths = visiblePathsRef.current;
                    if (!paths || paths.length === 0) return;
                    const idx = lastSelectedPath ? paths.indexOf(lastSelectedPath) : -1;
                    if (idx < 0 || idx >= paths.length - 1) return;
                    const next = paths[idx + 1];
                    setSelectedPaths(new Set([next]));
                    setLastSelectedPath(next);
                    requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-tree-path="${CSS.escape(next)}"]`);
                      if (el) el.scrollIntoView({ block: 'nearest' });
                    });
                  }}
                />
            }
          </div>
          </div>
        </div>
      )}

      {/* FIX502: Showcase View — now the single shared component in src/ShowcaseView.jsx.
          Reads through the generic backend interface (Cloud impl in prod, Local impl in dev
          which currently delegates to Cloud). Local-filesystem-backed data for the admin will
          come when the Local Agent gains matching endpoints. */}
      {currentView === 'showcase' && (
        <div className="photo-view-showcase" data-yagu-id="view-showcase">
          <ShowcaseView />
        </div>
      )}

      {/* FIX501.3.3.5: Context menu */}
      {contextMenu && (
        <div
          className="photo-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="photo-context-option" onClick={handleMoveToSubfolder}>
            Move to subfolder...
          </div>
          {/* FIX501.3.3.5.2: Add Properties — single folder without properties.txt */}
          {!contextFolderHasProps && (
            <div className="photo-context-option" onClick={handleAddProperties}>
              Add properties
            </div>
          )}
          {/* FIX501.3.3.5.3: Collapse all / Expand all — folder only (FIX501.3.3.5.3.1) */}
          {contextMenu.isFolder && (
            <div className="photo-context-option" onClick={handleToggleSiblings}>
              {contextMenu.expanded ? 'Collapse all' : 'Expand all'}
            </div>
          )}
          {/* FIX501.3.3.5.4: Rename — folder only (FIX501.3.3.5.4.1) */}
          {contextMenu.isFolder && (
            <div className="photo-context-option" onClick={handleRenameMenuOption}>
              Rename
            </div>
          )}
          {/* FIX501.3.3.5.5: Add note — folder only (FIX501.3.3.5.5.1) */}
          {contextMenu.isFolder && (
            <div className="photo-context-option" onClick={handleAddNoteMenuOption}>
              Add note
            </div>
          )}
          {/* FIX501.3.3.5.6: Duplicate — file only (FIX501.3.3.5.6.1) */}
          {!contextMenu.isFolder && (
            <div className="photo-context-option" onClick={handleDuplicateMenuOption}>
              Duplicate
            </div>
          )}
        </div>
      )}

      {/* FIX501.3.3.5.5.2: Note dialog — click outside to dismiss */}
      {noteDialog && (
        <div className="photo-dialog-overlay" onMouseDown={() => setNoteDialog(null)}>
          <div className="photo-dialog" onMouseDown={e => e.stopPropagation()}>
            <div className="photo-dialog-title">Folder note</div>
            <label className="photo-dialog-label">Note (1 line):</label>
            <input
              type="text"
              value={noteDialogValue}
              onChange={e => setNoteDialogValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNoteDialogOk();
                if (e.key === 'Escape') setNoteDialog(null);
              }}
              autoFocus
            />
            <div className="photo-dialog-buttons">
              <button className="photo-header-btn photo-dialog-ok" onClick={handleNoteDialogOk}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX501.3.3.5.4.2: Rename dialog — click outside to dismiss */}
      {renameDialog && (
        <div className="photo-dialog-overlay" onMouseDown={() => setRenameDialog(null)}>
          <div className="photo-dialog" onMouseDown={e => e.stopPropagation()}>
            <div className="photo-dialog-title">Rename folder</div>
            <label className="photo-dialog-label">New name:</label>
            <input
              type="text"
              value={renameDialogValue}
              onChange={e => setRenameDialogValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && renameDialogValue.trim()) handleRenameDialogOk();
                if (e.key === 'Escape') setRenameDialog(null);
              }}
              autoFocus
            />
            <div className="photo-dialog-buttons">
              <button
                className="photo-header-btn photo-dialog-ok"
                disabled={!renameDialogValue.trim()}
                onClick={handleRenameDialogOk}
              >OK</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX501.3.3.5.1.1: Move to subfolder dialog */}
      {moveDialog && (
        <div className="photo-dialog-overlay">
          <div className="photo-dialog">
            <div className="photo-dialog-title">Move to subfolder</div>
            <label className="photo-dialog-label">Folder name:</label>
            <input
              type="text"
              value={moveDialogName}
              onChange={e => setMoveDialogName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && moveDialogNameValid) handleMoveDialogOk(); if (e.key === 'Escape') setMoveDialog(null); }}
              autoFocus
            />
            <div className="photo-dialog-buttons">
              <button className="photo-header-btn" onClick={() => setMoveDialog(null)}>Cancel</button>
              <button
                className="photo-header-btn photo-dialog-ok"
                disabled={!moveDialogNameValid}
                onClick={handleMoveDialogOk}
              >OK</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX500.2: Photo Setup panel (layer popup) / FIX505: Setup general panel / FIX505.4: layer popup */}
      {setupDialogOpen && (
        <div className="photo-dialog-overlay">
          <div className="photo-dialog photo-setup-dialog" data-yagu-id="panel-general-setup">
            <div className="photo-dialog-title">Photo Setup</div>
            {/* FIX505.2.1 / FIX505.2.2: Tabs */}
            <div className="photo-setup-tabs">
              <button
                className={`photo-setup-tab${setupTab === 'file-explorer' ? ' active' : ''}`}
                onClick={() => setSetupTab('file-explorer')}
              >File Explorer</button>
              <button
                className={`photo-setup-tab${setupTab === 'showcase' ? ' active' : ''}`}
                onClick={() => setSetupTab('showcase')}
              >Showcase</button>
            </div>
            {/* FIX505.2.3: View setup panel — bound to tab selection */}
            <div className="photo-setup-tab-content">
              {setupTab === 'file-explorer' && (
                // FIX506: File Explorer view setup panel
                <div data-yagu-id="panel-file-explorer-view-setup">
                  {/* FIX506.2.1: Field 'List of properties' */}
                  <label className="photo-dialog-label">List of properties:</label>
                  <div className="photo-setup-list" data-yagu-id="list-photo-properties">
                    {setupDraft.length === 0 && (
                      <div className="photo-setup-empty">No properties defined.</div>
                    )}
                    {setupDraft.map((prop, idx) => (
                      <div key={prop.id} className="photo-setup-row">
                        <input
                          type="text"
                          value={prop.label}
                          placeholder="Property name"
                          onChange={e => handleSetupChange(idx, e.target.value)}
                        />
                        {/* FIX506.2.1.2: insert above, remove */}
                        <button className="photo-setup-row-btn" title="Insert above" onClick={() => handleSetupInsert(idx)}>+</button>
                        <button className="photo-setup-row-btn" title="Remove" onClick={() => handleSetupRemove(idx)}>−</button>
                      </div>
                    ))}
                  </div>
                  <button className="photo-header-btn" onClick={handleSetupAdd}>Add property</button>
                  {/* FIX506.2.2: Field 'Main Image Icon height' (px) */}
                  <div className="photo-setup-field-row">
                    <label className="photo-dialog-label" htmlFor="input-main-img-icon-height">Main Image Icon height (px):</label>
                    <input
                      id="input-main-img-icon-height"
                      data-yagu-id="input-main-img-icon-height"
                      type="text"
                      value={iconHeightDraft}
                      onChange={e => setIconHeightDraft(e.target.value)}
                      className={iconHeightDraft.trim() === '' ? 'photo-input-invalid' : ''}
                    />
                  </div>
                </div>
              )}
              {setupTab === 'showcase' && (() => {
                // FIX500.2.3: Showcase view setup panel
                // FIX500.2.3.2.1.2.2: Item picker aggregates 'Folder name', property labels, 'Main image icon'
                const used = new Set(showcaseDraft.map(c => c.name));
                const pickerItems = ['Folder name', ...setupDraft.map(p => p.label.trim()).filter(Boolean), 'Main image icon']
                  .filter(n => !used.has(n));
                return (
                  <div data-yagu-id="panel-showcase-view-setup">
                    {/* FIX500.2.3.2.1: Section 'Showcase columns' */}
                    <label className="photo-dialog-label">Showcase columns:</label>
                    <div className="photo-setup-list" data-yagu-id="list-showcase-columns-setup">
                      {showcaseDraft.map((col, idx) => (
                        <div key={idx} className="photo-setup-row">
                          <input type="text" value={col.name} disabled />
                          {/* FIX500.2.3.2.1.2.1.1: width sample — free text, its length defines column width */}
                          <input
                            type="text"
                            className="photo-setup-width-sample"
                            placeholder="width sample"
                            value={col.widthSample}
                            onChange={e => handleShowcaseWidthChange(idx, e.target.value)}
                            title="Free text; its character length defines the column width"
                          />
                          {/* FIX500.2.3.2.1.2.1.2: wrap checkbox */}
                          <label className="photo-setup-wrap-label" title="Wrap the field value text">
                            <input
                              type="checkbox"
                              checked={col.wrap}
                              onChange={e => handleShowcaseWrapChange(idx, e.target.checked)}
                            />
                            wrap
                          </label>
                          {/* FIX500.2.3.2.1.3.3: move up/down */}
                          <button className="photo-setup-row-btn" title="Move up" onClick={() => handleShowcaseMove(idx, -1)} disabled={idx === 0}>▲</button>
                          <button className="photo-setup-row-btn" title="Move down" onClick={() => handleShowcaseMove(idx, 1)} disabled={idx === showcaseDraft.length - 1}>▼</button>
                          {/* FIX500.2.3.2.1.3.2: remove (but 'Folder name' cannot be removed) */}
                          <button
                            className="photo-setup-row-btn"
                            title={col.name === 'Folder name' ? "'Folder name' cannot be removed" : 'Remove'}
                            onClick={() => handleShowcaseRemove(idx)}
                            disabled={col.name === 'Folder name'}
                          >−</button>
                        </div>
                      ))}
                    </div>
                    {/* FIX500.2.3.2.1.3.1: Add a new item — picker */}
                    <div className="photo-setup-row">
                      <select
                        className="photo-setup-picker"
                        value=""
                        onChange={e => { if (e.target.value) { handleShowcaseAdd(e.target.value); e.target.value = ''; } }}
                      >
                        <option value="">+ Add column…</option>
                        {pickerItems.map(item => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </div>
                    {/* FIX500.2.3.2.1.2.3: Folder column name override */}
                    <div className="photo-setup-field-row">
                      <label className="photo-dialog-label" htmlFor="input-folder-column-name">Folder column name:</label>
                      <input
                        id="input-folder-column-name"
                        type="text"
                        value={folderColumnNameDraft}
                        placeholder="Folder name"
                        onChange={e => setFolderColumnNameDraft(e.target.value)}
                      />
                    </div>
                    {/* FIX500.2.3.2.1.2.4: Roman year converter */}
                    <div className="photo-setup-field-row">
                      <label className="photo-setup-wrap-label">
                        <input
                          type="checkbox"
                          checked={romanYearDraft}
                          onChange={e => setRomanYearDraft(e.target.checked)}
                        />
                        Roman year converter (postfix '(yyyy)' on 'Year' values when Roman)
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="photo-dialog-buttons">
              {/* FIX505.2.10: Cancel */}
              <button className="photo-header-btn" onClick={handleSetupCancel}>Cancel</button>
              {/* FIX505.2.11 / FIX505.3.10: Save */}
              <button
                className="photo-header-btn photo-dialog-ok"
                onClick={handleSetupSave}
                disabled={iconHeightDraft.trim() === ''}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
