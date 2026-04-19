import { useEffect, useMemo, useState, useRef } from 'react';
import SetupPanel from './SetupPanel.jsx';
import GsheetImportDialog from './gsheet/GsheetImportDialog.jsx';
import GroupingPanel from './grouping/GroupingPanel.jsx';
import { parseSegment, bucketsWithValues, bucketFor } from './grouping/segments.js';
import { useAuth } from './AuthContext.jsx';
import { getShowcase, getFolderImages } from './data/backend.js';

function romanToInt(s) {
  const m = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = m[s[i]];
    const next = m[s[i + 1]];
    if (!cur) return null;
    total += next && cur < next ? -cur : cur;
  }
  return total;
}

function formatYearValue(value, propertyLabel, enabled) {
  if (!enabled || value == null || value === '') return value;
  if ((propertyLabel || '').toLowerCase() !== 'year') return value;
  const trimmed = String(value).trim();
  if (!/^[MDCLXVI]+$/i.test(trimmed)) return value;
  const year = romanToInt(trimmed.toUpperCase());
  if (!year || year < 1 || year > 3999) return value;
  return `${value} (${year})`;
}

function columnKey(col) {
  if (col.type === 'property') return `prop_${col.property_id}`;
  return col.type;
}

function getColumnValue(folder, col) {
  if (col.type === 'folder_name') return folder.name ?? '';
  if (col.type === 'property')
    return folder.properties?.[String(col.property_id)] ?? '';
  return '';
}

function compareValues(a, b) {
  if (a === '' && b === '') return 0;
  if (a === '') return -1;
  if (b === '') return 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (
    Number.isFinite(aNum) &&
    Number.isFinite(bNum) &&
    String(aNum) === String(a).trim() &&
    String(bNum) === String(b).trim()
  ) {
    return aNum - bNum;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export default function ShowcaseView() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [images, setImages] = useState([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [sortKeys, setSortKeys] = useState([]);
  const [filters, setFilters] = useState({});
  const [showSetup, setShowSetup] = useState(false);
  const [showGrouping, setShowGrouping] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroupPropId, setActiveGroupPropId] = useState(null);
  const [activeBucketKey, setActiveBucketKey] = useState(null);
  const menuRef = useRef(null);

  const reloadShowcase = () =>
    getShowcase()
      .then((d) => {
        setData(d);
        if (d.folders?.length && selectedFolderId == null) {
          setSelectedFolderId(d.folders[0].id);
        }
      })
      .catch((e) => setError(e.message || String(e)));

  useEffect(() => {
    getShowcase()
      .then((d) => {
        setData(d);
        if (d.folders?.length) setSelectedFolderId(d.folders[0].id);
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (selectedFolderId == null) return;
    setImages([]);
    getFolderImages(selectedFolderId)
      .then((imgs) => {
        setImages(imgs);
        const mainIdx = imgs.findIndex((i) => i.is_main);
        setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      })
      .catch((e) => setError(e.message || String(e)));
  }, [selectedFolderId]);

  const properties = data?.properties ?? [];
  const viewSetup = data?.view_setup ?? {};
  const showcaseCfg = viewSetup.showcase ?? {};
  const configuredColumns = showcaseCfg.columns ?? [];
  const folderColumnName = showcaseCfg.folder_column_name || 'Item name';
  const romanYearConverter = !!showcaseCfg.roman_year_converter;
  const groups = showcaseCfg.groups ?? [];

  // FIX372.6.1.1: apply default group on load / whenever view_setup changes,
  // but only if the current selection is no longer valid.
  useEffect(() => {
    if (!groups.length) {
      if (activeGroupPropId != null) setActiveGroupPropId(null);
      if (activeBucketKey != null) setActiveBucketKey(null);
      return;
    }
    const stillValid = groups.some((g) => g.property_id === activeGroupPropId);
    if (!stillValid) {
      const dflt = groups.find((g) => g.default);
      setActiveGroupPropId(dflt ? dflt.property_id : null);
      setActiveBucketKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeGroup = groups.find((g) => g.property_id === activeGroupPropId) || null;
  const activeParsed = activeGroup ? parseSegment(activeGroup.segment) : null;

  const bucketList = useMemo(() => {
    if (!activeGroup || !activeParsed) return [];
    const values = (data?.folders ?? []).map(
      (f) => f.properties?.[String(activeGroup.property_id)],
    );
    return bucketsWithValues(values, activeParsed);
  }, [activeGroup, activeParsed, data]);

  const displayedFolders = useMemo(() => {
    if (!data) return [];
    let rows = data.folders;
    // FIX372.6.2.11: apply the active grouping bucket filter.
    if (activeGroup && activeBucketKey && activeParsed) {
      rows = rows.filter((f) => {
        const v = f.properties?.[String(activeGroup.property_id)];
        const b = bucketFor(v, activeParsed);
        return b != null && b.key === activeBucketKey;
      });
    }
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim());
    if (activeFilters.length > 0) {
      const colByKey = new Map(configuredColumns.map((c) => [columnKey(c), c]));
      rows = rows.filter((f) =>
        activeFilters.every(([key, v]) => {
          const col = colByKey.get(key);
          if (!col) return true;
          return String(getColumnValue(f, col))
            .toLowerCase()
            .includes(v.trim().toLowerCase());
        }),
      );
    }
    if (sortKeys.length > 0) {
      const colByKey = new Map(configuredColumns.map((c) => [columnKey(c), c]));
      rows = [...rows].sort((a, b) => {
        for (const { key, dir } of sortKeys) {
          const col = colByKey.get(key);
          if (!col) continue;
          const cmp = compareValues(getColumnValue(a, col), getColumnValue(b, col));
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    return rows;
  }, [data, filters, sortKeys, configuredColumns, activeGroup, activeBucketKey, activeParsed]);

  const handleHeaderClick = (key, ctrl) => {
    setSortKeys((keys) => {
      const idx = keys.findIndex((k) => k.key === key);
      if (ctrl) {
        if (idx >= 0) {
          const u = [...keys];
          u[idx] = { key, dir: keys[idx].dir === 'asc' ? 'desc' : 'asc' };
          return u;
        }
        return [...keys, { key, dir: 'asc' }];
      }
      if (idx === 0 && keys.length === 1) {
        if (keys[0].dir === 'asc') return [{ key, dir: 'desc' }];
        return [];
      }
      return [{ key, dir: 'asc' }];
    });
  };
  const sortIndicator = (key) => {
    const idx = sortKeys.findIndex((k) => k.key === key);
    if (idx < 0) return '';
    const arrow = sortKeys[idx].dir === 'asc' ? '▲' : '▼';
    return sortKeys.length > 1 ? `${arrow}${idx + 1}` : arrow;
  };
  const setFilter = (key, v) => setFilters((prev) => ({ ...prev, [key]: v }));

  const handleSaveSetup = (result) => {
    setData((prev) => ({
      ...prev,
      properties: result.properties ?? prev.properties,
      view_setup: result.view_setup ?? prev.view_setup,
    }));
    setSortKeys([]);
    setFilters({});
    setShowSetup(false);
  };

  const handleSaveGrouping = (result) => {
    setData((prev) => ({
      ...prev,
      properties: result.properties ?? prev.properties,
      view_setup: result.view_setup ?? prev.view_setup,
    }));
    setShowGrouping(false);
  };

  if (error) return <div className="sc-error">Error: {error}</div>;
  if (!data) return <div className="sc-loading">Loading…</div>;

  const currentImage = images[currentImageIdx];

  const renderHeaderCell = (col) => {
    if (col.type === 'main_image_icon') {
      return (
        <th
          key="main_image_icon"
          className="sc-th-thumb"
          style={col.width ? { width: col.width } : undefined}
          aria-label="Main image"
        />
      );
    }
    const key = columnKey(col);
    const label =
      col.type === 'folder_name'
        ? folderColumnName
        : properties.find((p) => p.id === col.property_id)?.label ?? '(missing)';
    return (
      <th
        key={key}
        style={col.width ? { width: col.width } : undefined}
        onClick={(e) => handleHeaderClick(key, e.ctrlKey || e.metaKey)}
        title="Click to sort. Ctrl-click to add a secondary sort key."
      >
        {label}
        <span className="sc-sort-arrow"> {sortIndicator(key)}</span>
      </th>
    );
  };

  const renderFilterCell = (col) => {
    if (col.type === 'main_image_icon') {
      return <th key="main_image_icon" className="sc-th-thumb" aria-hidden="true" />;
    }
    const key = columnKey(col);
    const label =
      col.type === 'folder_name'
        ? folderColumnName
        : properties.find((p) => p.id === col.property_id)?.label ?? '(missing)';
    return (
      <th key={key}>
        <input
          type="text"
          className="sc-filter-input"
          value={filters[key] ?? ''}
          onChange={(e) => setFilter(key, e.target.value)}
          placeholder="filter…"
          aria-label={`Filter ${label}`}
        />
      </th>
    );
  };

  const renderBodyCell = (folder, col) => {
    if (col.type === 'main_image_icon') {
      return (
        <td
          key="main_image_icon"
          className="sc-td-thumb"
          style={col.width ? { width: col.width } : undefined}
        >
          {folder.main_image_url ? (
            <img
              src={folder.main_image_url}
              alt=""
              style={
                folder.main_rotation
                  ? { transform: `rotate(${folder.main_rotation}deg)` }
                  : undefined
              }
            />
          ) : (
            <div className="sc-td-thumb-empty" />
          )}
        </td>
      );
    }
    const key = columnKey(col);
    const cellStyle = {};
    if (col.width) cellStyle.width = col.width;
    if (col.wrap) cellStyle.whiteSpace = 'normal';
    if (col.type === 'folder_name') {
      return (
        <td key={key} className="sc-td-name" style={cellStyle}>
          {folder.name}
        </td>
      );
    }
    // property
    const prop = properties.find((p) => p.id === col.property_id);
    if (!prop) return <td key={key} style={cellStyle}>—</td>;
    const raw = folder.properties?.[String(prop.id)];
    const display =
      raw == null || raw === ''
        ? '—'
        : formatYearValue(raw, prop.label, romanYearConverter);
    return (
      <td key={key} style={cellStyle}>
        {display}
      </td>
    );
  };

  return (
    <div className="sc-layout">
      <div className="sc-topbar">
        <h1 className="sc-project-title">{data.project?.name ?? 'Showcase'}</h1>
        {profile && (
          <div className="sc-menu" ref={menuRef}>
            <button
              type="button"
              className="sc-menu-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              Import ▾
            </button>
            {menuOpen && (
              <ul className="sc-menu-items" role="menu">
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setImportOpen(true); }}
                  >
                    Google sheet
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
        {profile && (
          <button
            type="button"
            className="sc-menu-trigger"
            onClick={() => setShowGrouping(true)}
          >
            Grouping
          </button>
        )}
        <button
          type="button"
          className="sc-setup-btn"
          onClick={() => setShowSetup(true)}
          aria-label="Open setup"
          title="Setup"
        >
          ⚙
        </button>
      </div>
      <div
        className="sc-main"
        style={
          activeGroup
            ? { gridTemplateColumns: '180px minmax(400px, 1fr) 1fr' }
            : undefined
        }
      >
        {/* FIX372.6.2: side panel appears only when a group is selected. */}
        {activeGroup && (
          <section className="sc-groups-panel">
            <ul className="sc-buckets">
              {bucketList.map((b) => (
                <li
                  key={b.key}
                  className={b.key === activeBucketKey ? 'selected' : ''}
                  onClick={() =>
                    setActiveBucketKey(b.key === activeBucketKey ? null : b.key)
                  }
                >
                  {b.label} <span className="sc-bucket-count">({b.count})</span>
                </li>
              ))}
              {bucketList.length === 0 && (
                <li className="sc-buckets-empty">(no matching values)</li>
              )}
            </ul>
          </section>
        )}
        <section className="sc-list-panel">
          {/* FIX372.6.1: group selector at the top-left of the item table. */}
          {groups.length > 0 && (
            <div className="sc-group-selector">
              <label>
                Group by:&nbsp;
                <select
                  value={activeGroupPropId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setActiveGroupPropId(v === '' ? null : Number(v));
                    setActiveBucketKey(null);
                  }}
                >
                  <option value="">(none)</option>
                  {groups.map((g) => {
                    const p = properties.find((pp) => pp.id === g.property_id);
                    return (
                      <option key={g.property_id} value={g.property_id}>
                        {p ? p.label : `Property ${g.property_id}`}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
          )}
          <table className="sc-table">
            <thead>
              <tr>{configuredColumns.map(renderHeaderCell)}</tr>
              <tr className="sc-filter-row">
                {configuredColumns.map(renderFilterCell)}
              </tr>
            </thead>
            <tbody>
              {displayedFolders.map((f) => (
                <tr
                  key={f.id}
                  className={f.id === selectedFolderId ? 'selected' : ''}
                  onClick={() => setSelectedFolderId(f.id)}
                >
                  {configuredColumns.map((col) => renderBodyCell(f, col))}
                </tr>
              ))}
              {displayedFolders.length === 0 && (
                <tr>
                  <td colSpan={configuredColumns.length || 1} className="sc-empty">
                    No items match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="sc-viewer">
          {currentImage ? (
            <>
              <img
                src={currentImage.url}
                alt={currentImage.caption ?? ''}
                className="sc-viewer-img"
                style={
                  currentImage.rotation
                    ? { transform: `rotate(${currentImage.rotation}deg)` }
                    : undefined
                }
              />
              {currentImage.caption && (
                <div className="sc-viewer-caption">{currentImage.caption}</div>
              )}
              <div className="sc-viewer-nav">
                <button
                  type="button"
                  onClick={() => setCurrentImageIdx((i) => Math.max(0, i - 1))}
                  disabled={currentImageIdx === 0}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <span className="sc-viewer-pos">
                  {currentImageIdx + 1} / {images.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIdx((i) => Math.min(images.length - 1, i + 1))
                  }
                  disabled={currentImageIdx >= images.length - 1}
                  aria-label="Next image"
                >
                  ›
                </button>
              </div>
            </>
          ) : (
            <div className="sc-viewer-empty">No images in this item.</div>
          )}
        </section>
      </div>
      {showSetup && (
        <SetupPanel
          properties={properties}
          viewSetup={viewSetup}
          onCancel={() => setShowSetup(false)}
          onSave={handleSaveSetup}
        />
      )}
      {importOpen && data.project && (
        <GsheetImportDialog
          project={{
            id: data.project.id,
            name: data.project.name,
            properties,
            folders: data.folders,
          }}
          onClose={() => setImportOpen(false)}
          onDone={reloadShowcase}
        />
      )}
      {showGrouping && (
        <GroupingPanel
          properties={properties}
          viewSetup={viewSetup}
          onCancel={() => setShowGrouping(false)}
          onSave={handleSaveGrouping}
        />
      )}
    </div>
  );
}
