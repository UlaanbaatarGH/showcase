/**
 * FIX501.50.4 — Slave File Explorer
 * Plain Windows-like tree: shows every file/folder (no hiding, no meta styling),
 * no toolbar, no context menu, no rename, no keyboard actions.
 * Drag source only — the Master is the drop target.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ImageEditor from './ImageEditor.jsx';

const SERVER_URL = 'http://localhost:3001';
const LS_KEY_SLAVE = 'photo-module-slave-root';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

function isImageFile(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTS.has(name.substring(dot).toLowerCase());
}

async function fetchDirList(dirPath) {
  const res = await fetch(`${SERVER_URL}/agent/dir/list?path=${encodeURIComponent(dirPath)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.entries || [];
}

// FIX501.50.6: Drag payload — newline-separated paths
const DRAG_MIME = 'application/x-photo-paths';

function SlaveTreeNode({ entry, parentPath, depth, selectedPaths, onSelect, onDragStartPaths, registerPath }) {
  const fullPath = parentPath + '/' + entry.name;
  const isFolder = entry.type === 'folder';
  const [expanded, setExpanded] = useState(depth < 2);
  const [children, setChildren] = useState(null);
  registerPath?.(fullPath);

  const loadChildren = useCallback(async () => {
    if (!isFolder) return;
    const raw = await fetchDirList(fullPath);
    // FIX501.50.4.8: plain listing — no filtering, sort folders first then alpha
    raw.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setChildren(raw);
  }, [fullPath, isFolder]);

  useEffect(() => {
    if (isFolder && expanded && children === null) loadChildren();
  }, [isFolder, expanded, children, loadChildren]);

  const handleClick = (e) => {
    onSelect(fullPath, isFolder ? 'folder' : 'file', { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  };
  const handleIconClick = (e) => {
    if (!isFolder) return;
    e.stopPropagation();
    setExpanded(v => !v);
  };
  const handleDragStart = (e) => {
    // If this row is not selected, drag only this one; else drag all selected
    const paths = selectedPaths.has(fullPath) ? [...selectedPaths] : [fullPath];
    onDragStartPaths?.(paths);
    e.dataTransfer.setData(DRAG_MIME, paths.join('\n'));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const icon = isFolder ? (expanded ? '📂' : '📁') : (isImageFile(entry.name) ? '🖼' : '📄');

  return (
    <div className="photo-tree-node">
      <div
        className={`photo-tree-row${selectedPaths.has(fullPath) ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
      >
        <span
          className="photo-tree-icon"
          onClick={handleIconClick}
          style={isFolder ? { cursor: 'pointer' } : undefined}
        >{icon}</span>
        <span className="photo-tree-label">{entry.name}</span>
      </div>
      {isFolder && expanded && children && (
        <div className="photo-tree-children">
          {children.map(child => (
            <SlaveTreeNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              selectedPaths={selectedPaths}
              onSelect={onSelect}
              onDragStartPaths={onDragStartPaths}
              registerPath={registerPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SlaveFileExplorer({ onDragStartPaths }) {
  const [rootFolder, setRootFolder] = useState(() => localStorage.getItem(LS_KEY_SLAVE) || '');
  const [rootInput, setRootInput] = useState('');
  const [rootEntries, setRootEntries] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState(null);
  const visiblePathsRef = useRef([]);
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

  const loadRoot = useCallback(async (folder) => {
    if (!folder) return;
    const entries = await fetchDirList(folder);
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setRootEntries(entries);
  }, []);

  useEffect(() => { if (rootFolder) loadRoot(rootFolder); }, [rootFolder, loadRoot]);

  const handleSetRoot = () => {
    // Strip wrapping quotes (Windows "Copy as path" pastes the path quoted)
    const folder = rootInput.trim().replace(/^["']|["']$/g, '').trim();
    if (!folder) return;
    localStorage.setItem(LS_KEY_SLAVE, folder);
    setRootFolder(folder);
  };
  const handleChangeRoot = () => {
    setRootFolder('');
    setRootEntries(null);
    setRootInput('');
    localStorage.removeItem(LS_KEY_SLAVE);
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  };

  const handleSelect = (path, type, { ctrl, shift } = {}) => {
    if (shift && lastSelectedPath) {
      const paths = visiblePathsRef.current;
      const fromIdx = paths.indexOf(lastSelectedPath);
      const toIdx = paths.indexOf(path);
      if (fromIdx >= 0 && toIdx >= 0) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        setSelectedPaths(prev => new Set([...prev, ...paths.slice(lo, hi + 1)]));
      }
    } else if (ctrl) {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
    } else {
      setSelectedPaths(new Set([path]));
    }
    setLastSelectedPath(path);
  };

  const singleSelected = selectedPaths.size === 1 ? [...selectedPaths][0] : null;
  const showImage = singleSelected && isImageFile(singleSelected.split('/').pop() || '');

  // Root-folder prompt
  if (!rootFolder) {
    return (
      <div className="photo-slave-panel">
        <div className="photo-view-header">
          <span className="photo-view-header-path">Slave File Explorer</span>
        </div>
        <div className="photo-root-prompt">
          <label>Select root folder for the Slave:</label>
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

  return (
    <div className="photo-slave-panel">
      <div className="photo-view-header">
        <span className="photo-view-header-path">{rootFolder}</span>
        <span style={{ flex: 1 }} />
        <button className="photo-header-btn" onClick={handleChangeRoot}>Change Root</button>
      </div>
      <div className="photo-body photo-slave-body">
        <div className="photo-explorer" data-yagu-id="panel-file-explorer-slave">
          <div className="photo-explorer-tree">
            {rootEntries === null && <div style={{ padding: 8, fontStyle: 'italic', color: '#888' }}>Loading…</div>}
            {rootEntries && rootEntries.length === 0 && <div style={{ padding: 8, fontStyle: 'italic', color: '#888' }}>(empty)</div>}
            {rootEntries && rootEntries.map(entry => (
              <SlaveTreeNode
                key={entry.name}
                entry={entry}
                parentPath={rootFolder}
                depth={0}
                selectedPaths={selectedPaths}
                onSelect={handleSelect}
                onDragStartPaths={onDragStartPaths}
                registerPath={registerPath}
              />
            ))}
          </div>
        </div>
        {/* FIX501.50.4.9: view-only image preview */}
        <ImageEditor imagePath={showImage ? singleSelected : null} readOnly />
      </div>
    </div>
  );
}
