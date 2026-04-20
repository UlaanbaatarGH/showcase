import { useEffect, useMemo, useState, useRef } from 'react';
import SetupPanel from './SetupPanel.jsx';
import GsheetImportDialog from './gsheet/GsheetImportDialog.jsx';
import ImportImagesDialog from './images/ImportImagesDialog.jsx';
import GroupingPanel from './grouping/GroupingPanel.jsx';
import { parseSegment, bucketsWithValues, bucketFor, NO_VALUE_KEY } from './grouping/segments.js';
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

// FIX500.2.3.2.1.2.1.1 / .1.1: width sample is free text; column width = the
// text's character count, expressed in `ch` units. FIX500.2.3.2.1.2.1.1.1:
// when the text is *just* a number n, treat it as n characters (i.e. 'n zeros').
function widthCss(width) {
  if (width == null) return undefined;
  const t = String(width).trim();
  if (!t) return undefined;
  const n = /^\d+$/.test(t) ? Number(t) : t.length;
  return `${n}ch`;
}

function getColumnValue(folder, col) {
  if (col.type === 'folder_name') return folder.name ?? '';
  if (col.type === 'img') return folder.has_image ? 'x' : '';
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
  // FIX515: Item Details panel — two tabs sharing the right column.
  // FIX515.4.1: tab persists when the selected item changes (state lives
  // here, not reset by selection). FIX515.4.2: 'Images' is the default.
  const [viewerTab, setViewerTab] = useState('images');
  const [images, setImages] = useState([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [sortKeys, setSortKeys] = useState([]);
  const [filters, setFilters] = useState({});
  const [showSetup, setShowSetup] = useState(false);
  const [showGrouping, setShowGrouping] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importImagesOpen, setImportImagesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroupPropId, setActiveGroupPropId] = useState(null);
  const [activeBucketKey, setActiveBucketKey] = useState(null);
  const [listWidth, setListWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sc-list-width'));
    return Number.isFinite(saved) && saved > 200 ? saved : 640;
  });
  const menuRef = useRef(null);
  const mainRef = useRef(null);

  // Draggable vertical splitter between the item table and the image viewer.
  const onSplitterDown = (e) => {
    e.preventDefault();
    const mainRect = mainRef.current?.getBoundingClientRect();
    const groupsOffset = activeGroup && mainRect ? 220 : 0;
    const startX = e.clientX;
    const startW = listWidth;
    const minList = 240;
    const minViewer = 240;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const maxList = (mainRect?.width ?? 1200) - groupsOffset - minViewer - 6;
      const next = Math.max(minList, Math.min(maxList, startW + dx));
      setListWidth(next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      // Persist between sessions.
      try { localStorage.setItem('sc-list-width', String(listWidth)); }
      catch { /* ignore */ }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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
  const folderColumnName = showcaseCfg.folder_column_name || '#';
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

  // FIX510.3 / <setup-property-tagged-deleted>: items whose value for the
  // configured deletion property is non-blank are hidden from the Showcase
  // view — they don't participate in sorting, filtering or grouping.
  const deletedPropertyId = viewSetup.file_explorer?.deleted_property_id ?? null;
  const liveFolders = useMemo(() => {
    const all = data?.folders ?? [];
    if (deletedPropertyId == null) return all;
    const key = String(deletedPropertyId);
    return all.filter((f) => {
      const v = (f.properties || {})[key];
      return v == null || String(v).trim() === '';
    });
  }, [data, deletedPropertyId]);

  // FIX510.2.1.5.2 / <derived-property-img>: the special 'img' derived
  // property groups items by whether they have any attached image. Other
  // groups read from folder.properties JSONB keyed by the numeric property id.
  const valueForGroup = (folder) => {
    if (!activeGroup) return undefined;
    if (activeGroup.property_id === 'img') {
      return folder.has_image ? 'With image' : 'No image';
    }
    return folder.properties?.[String(activeGroup.property_id)];
  };

  const bucketList = useMemo(() => {
    if (!activeGroup || !activeParsed) return [];
    const values = liveFolders.map(valueForGroup);
    return bucketsWithValues(values, activeParsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeParsed, liveFolders]);

  const displayedFolders = useMemo(() => {
    if (!data) return [];
    let rows = liveFolders;
    // FIX372.6.2.11: apply the active grouping bucket filter.
    if (activeGroup && activeBucketKey && activeParsed) {
      rows = rows.filter((f) => {
        const v = valueForGroup(f);
        if (activeBucketKey === NO_VALUE_KEY) {
          // FIX372.6.2.3: folders with no bucketable value sit in this pile.
          return bucketFor(v, activeParsed) == null;
        }
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
  }, [liveFolders, filters, sortKeys, configuredColumns, activeGroup, activeBucketKey, activeParsed]);

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

  const groupSelector =
    groups.length > 0 ? (
      <div className="sc-group-selector">
        <label>
          Group by:&nbsp;
          <select
            value={activeGroupPropId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next =
                v === '' ? null : v === 'img' ? 'img' : Number(v);
              setActiveGroupPropId(next);
              setActiveBucketKey(null);
            }}
          >
            <option value="">(none)</option>
            {groups.map((g) => {
              const label =
                g.property_id === 'img'
                  ? 'Img'
                  : properties.find((pp) => pp.id === g.property_id)?.label
                    ?? `Property ${g.property_id}`;
              return (
                <option key={String(g.property_id)} value={g.property_id}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>
      </div>
    ) : null;

  const renderHeaderCell = (col) => {
    if (col.type === 'main_image_icon') {
      return (
        <th
          key="main_image_icon"
          className="sc-th-thumb"
          style={widthCss(col.width) ? { width: widthCss(col.width) } : undefined}
          aria-label="Main image"
        />
      );
    }
    const key = columnKey(col);
    const label = columnHeaderLabel(col);
    return (
      <th
        key={key}
        style={widthCss(col.width) ? { width: widthCss(col.width) } : undefined}
        onClick={(e) => handleHeaderClick(key, e.ctrlKey || e.metaKey)}
        title="Click to sort. Ctrl-click to add a secondary sort key."
      >
        {label}
        <span className="sc-sort-arrow"> {sortIndicator(key)}</span>
      </th>
    );
  };

  // FIX510.2.1.1.2 / <property-short-name>: Showcase column headers use the
  // property's short name when defined; fall back to the full name otherwise.
  const columnHeaderLabel = (col) => {
    if (col.type === 'folder_name') return folderColumnName;
    if (col.type === 'img') return 'Img';
    const prop = properties.find((p) => p.id === col.property_id);
    if (!prop) return '(missing)';
    return (prop.short_label && prop.short_label.trim()) || prop.label;
  };

  const renderFilterCell = (col) => {
    if (col.type === 'main_image_icon') {
      return <th key="main_image_icon" className="sc-th-thumb" aria-hidden="true" />;
    }
    const key = columnKey(col);
    const label = columnHeaderLabel(col);
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
          style={widthCss(col.width) ? { width: widthCss(col.width) } : undefined}
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
    const w = widthCss(col.width);
    if (w) cellStyle.width = w;
    if (col.wrap) cellStyle.whiteSpace = 'normal';
    if (col.type === 'folder_name') {
      return (
        <td key={key} className="sc-td-name" style={cellStyle}>
          {folder.name}
        </td>
      );
    }
    if (col.type === 'img') {
      return (
        <td key={key} className="sc-td-img" style={cellStyle}>
          {folder.main_image_url ? 'x' : ''}
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
                    onClick={() => { setMenuOpen(false); setImportImagesOpen(true); }}
                  >
                    Images
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setImportOpen(true); }}
                  >
                    Image Properties
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
        ref={mainRef}
        style={{
          // FIX372.6.2.5: the Item Grouping panel always fits its listed
          // values — CSS grid's max-content resizes automatically as the
          // bucket list changes (new group picked, default group applied).
          gridTemplateColumns: activeGroup
            ? `max-content ${listWidth}px 6px 1fr`
            : `${listWidth}px 6px 1fr`,
        }}
      >
        {/* FIX372.6.2.0: the group dropdown is at the top-left of the side
            panel when one is shown, otherwise at the top-left of the item
            table. Rendered once via groupSelector and placed in the right
            parent below. */}
        {activeGroup && (() => {
          // FIX372.6.2.9: when the active group uses a segment (integer or
          // text range), each pill gets a tint along a gradient so consecutive
          // segments are visually distinguished. Exact-value groups keep the
          // flat pill background. The 'No value' and 'All' buckets are never
          // tinted.
          const isSegmentMode =
            activeParsed &&
            (activeParsed.type === 'integer' || activeParsed.type === 'text');
          // FIX372.6.2.10: 'All ({n-of-items})' pill at the top of the list
          // clears the bucket filter so every item in the current group is
          // displayed. Total = sum of all bucket counts (incl. 'No value').
          const ALL_KEY = '__all__';
          const totalCount = bucketList.reduce((s, b) => s + b.count, 0);
          const displayBuckets =
            bucketList.length === 0
              ? []
              : [{ key: ALL_KEY, label: 'All', count: totalCount }, ...bucketList];
          const segCount = bucketList.filter((b) => b.key !== NO_VALUE_KEY).length;
          let segIdx = 0;
          return (
            <section className="sc-groups-panel">
              {groupSelector}
              <ul className={`sc-buckets${isSegmentMode ? ' segment-mode' : ''}`}>
                {displayBuckets.map((b) => {
                  const isAll = b.key === ALL_KEY;
                  const isNoValue = b.key === NO_VALUE_KEY;
                  let style;
                  if (isSegmentMode && !isNoValue && !isAll) {
                    const t = segCount > 1 ? segIdx / (segCount - 1) : 0;
                    segIdx += 1;
                    // HSL hue sweep from navy-blue to teal, fixed saturation
                    // and dark lightness matching --color-bg-lighter (#0f3460).
                    style = { background: `hsl(${214 - t * 40}, 65%, 22%)` };
                  }
                  const selected = isAll
                    ? activeBucketKey == null
                    : b.key === activeBucketKey;
                  return (
                    <li
                      key={b.key}
                      className={selected ? 'selected' : ''}
                      style={style}
                      onClick={() => {
                        if (isAll) setActiveBucketKey(null);
                        else setActiveBucketKey(b.key === activeBucketKey ? null : b.key);
                      }}
                    >
                      {b.label} <span className="sc-bucket-count">({b.count})</span>
                    </li>
                  );
                })}
                {bucketList.length === 0 && (
                  <li className="sc-buckets-empty">(no matching values)</li>
                )}
              </ul>
            </section>
          );
        })()}
        <section className="sc-list-panel">
          {groups.length > 0 && !activeGroup && groupSelector}
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
        <div
          className="sc-splitter"
          onMouseDown={onSplitterDown}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
        />
        <section className="sc-viewer">
          {/* FIX515.2.1: tab strip switches between Images and Details. */}
          <div className="sc-viewer-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewerTab === 'images'}
              className={viewerTab === 'images' ? 'active' : ''}
              onClick={() => setViewerTab('images')}
            >
              Images
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewerTab === 'details'}
              className={viewerTab === 'details' ? 'active' : ''}
              onClick={() => setViewerTab('details')}
            >
              Details
            </button>
          </div>
          {viewerTab === 'images' ? (
            <div className="sc-viewer-body">
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
            </div>
          ) : (
            // FIX518: Item Details panel — read-only list of all properties
            // for the selected item, in the order configured in the File
            // Explorer setup. Derived properties (e.g. Img) appear after the
            // regular ones.
            <div className="sc-details">
              {(() => {
                const selectedFolder = (data?.folders || []).find(
                  (f) => f.id === selectedFolderId,
                );
                if (!selectedFolder) {
                  return <div className="sc-viewer-empty">No item selected.</div>;
                }
                // FIX518.4.4: hide the property used as the deleted-marker.
                // FIX518.4.2: order follows the File-Explorer setup sort order.
                const ordered = [...properties]
                  .filter((p) => p.id !== deletedPropertyId)
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                // FIX518.4.5: a property is rendered as a checkbox when every
                // non-blank value across all items is 'x' (case-insensitive,
                // trimmed). Computed once per render from data.folders.
                const isBooleanProperty = (p) => {
                  const key = String(p.id);
                  let sawAny = false;
                  for (const f of data.folders) {
                    const v = (f.properties || {})[key];
                    if (v == null) continue;
                    const s = String(v).trim();
                    if (s === '') continue;
                    sawAny = true;
                    if (s.toLowerCase() !== 'x') return false;
                  }
                  return sawAny;
                };
                const renderValue = (p) => {
                  const raw = selectedFolder.properties?.[String(p.id)] ?? '';
                  if (isBooleanProperty(p)) {
                    const checked = String(raw).trim().toLowerCase() === 'x';
                    return (
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                      />
                    );
                  }
                  return raw;
                };
                // FIX518.4.3 / <item-id-new-name>: the '#' row uses the custom
                // label from view_setup.showcase.folder_column_name if set.
                const idLabel = folderColumnName;
                return (
                  <table className="sc-details-list">
                    <tbody>
                      <tr>
                        <th>{idLabel}</th>
                        <td>{selectedFolder.name ?? ''}</td>
                      </tr>
                      {ordered.map((p) => (
                        <tr key={`prop_${p.id}`}>
                          <th>{p.label}</th>
                          <td>{renderValue(p)}</td>
                        </tr>
                      ))}
                      {/* FIX518.4.1: derived properties listed after the
                          regular ones. <derived-property-img> doesn't relate
                          to a specific property, so it goes at the end. */}
                      <tr>
                        <th>Img</th>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!selectedFolder.has_image}
                            readOnly
                            tabIndex={-1}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
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
            deleted_property_id: deletedPropertyId,
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
      {importImagesOpen && data.project && (
        <ImportImagesDialog
          project={{ id: data.project.id, name: data.project.name }}
          onClose={() => setImportImagesOpen(false)}
          onDone={reloadShowcase}
        />
      )}
    </div>
  );
}
