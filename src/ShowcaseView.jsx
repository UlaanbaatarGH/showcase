import { useEffect, useMemo, useState, useRef } from 'react';
import SetupPanel from './SetupPanel.jsx';
import ShowcaseViewSetupPanel from './ShowcaseViewSetupPanel.jsx';
import ShowcaseImageCanvas from './viewer/ShowcaseImageCanvas.jsx';
import ShowcaseImgListEditor from './viewer/ShowcaseImgListEditor.jsx';
import GsheetImportDialog from './gsheet/GsheetImportDialog.jsx';
import ImportImagesDialog from './images/ImportImagesDialog.jsx';
import GroupingPanel from './grouping/GroupingPanel.jsx';
import { parseSegment, bucketsWithValues, bucketFor, NO_VALUE_KEY } from './grouping/segments.js';
import { normalizeGroups } from './grouping/groups.js';
import { useAuth } from './AuthContext.jsx';
import { getShowcase, getFolderImages } from './data/backend.js';
import { computePropertyValue } from './properties/formulas.js';

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

function getColumnValue(folder, col, propertiesById, propertiesByLabel) {
  if (col.type === 'folder_name') return folder.name ?? '';
  if (col.type === 'img') return folder.has_image ? 'x' : '';
  if (col.type === 'property') {
    const prop = propertiesById?.get(col.property_id);
    if (prop) return computePropertyValue(folder, prop, propertiesByLabel);
    return folder.properties?.[String(col.property_id)] ?? '';
  }
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
  // FIX515.2.2 / FIX515.3.2 <button-edit>: toggle edition mode for the
  // currently open tab. Reset when the user switches tabs or items so
  // unsaved edits don't silently follow the selection.
  const [editionMode, setEditionMode] = useState(false);
  // FIX518.4.6: local buffer of property overrides applied in edit mode.
  // Keyed by property id → string. Saved into the in-memory folder when
  // the user clicks Save (no cloud persistence yet — see
  // backendCloud.setFolderProperty TODO).
  const [detailDraft, setDetailDraft] = useState({});
  // Image edition state now lives inside <panel-showcase-img-list-editor>
  // (FIX521); the viewer itself is read-only (FIX520 after the .2.10 toolbox
  // removal).
  const [images, setImages] = useState([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [error, setError] = useState(null);
  const [sortKeys, setSortKeys] = useState([]);
  const [filters, setFilters] = useState({});
  // FIX503.3.2 <button-columns> opens a standalone <panel-showcase-view-setup>
  // (anyone can tweak columns). FIX500.2 <button-setup> opens the tabbed
  // general Setup (admin territory: property list + file-explorer settings).
  const [showColumns, setShowColumns] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showGrouping, setShowGrouping] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importImagesOpen, setImportImagesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeBucketKey, setActiveBucketKey] = useState(null);
  const [listWidth, setListWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sc-list-width'));
    return Number.isFinite(saved) && saved > 200 ? saved : 640;
  });
  const menuRef = useRef(null);
  const mainRef = useRef(null);
  const selectedRowRef = useRef(null);

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
    // Exit edition when moving to another item — pending edits don't persist
    // across items since there's no cloud write path yet.
    setEditionMode(false);
    setDetailDraft({});
    getFolderImages(selectedFolderId)
      .then((imgs) => {
        setImages(imgs);
        const mainIdx = imgs.findIndex((i) => i.is_main);
        setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      })
      .catch((e) => setError(e.message || String(e)));
  }, [selectedFolderId]);

  const properties = data?.properties ?? [];
  // Lookup maps for formula evaluation — rebuilt whenever the property list
  // changes. Used by getColumnValue, the grouping bucket logic, and the
  // Item Details panel.
  const propertiesById = useMemo(
    () => new Map(properties.map((p) => [p.id, p])),
    [properties],
  );
  const propertiesByLabel = useMemo(
    () => new Map(properties.map((p) => [p.label, p])),
    [properties],
  );
  const viewSetup = data?.view_setup ?? {};
  const showcaseCfg = viewSetup.showcase ?? {};
  const configuredColumns = showcaseCfg.columns ?? [];
  const folderColumnName = showcaseCfg.folder_column_name || '#';
  const romanYearConverter = !!showcaseCfg.roman_year_converter;
  // FIX373 (updated): groups carry their own id + name. normalizeGroups
  // also upgrades legacy entries that only had property_id.
  const groups = useMemo(
    () => normalizeGroups(showcaseCfg.groups, properties),
    [showcaseCfg.groups, properties],
  );

  // FIX374.1.1 [ex-FIX372.6.1.1]: apply default group on load / whenever view_setup changes,
  // but only if the current selection is no longer valid.
  useEffect(() => {
    if (!groups.length) {
      if (activeGroupId != null) setActiveGroupId(null);
      if (activeBucketKey != null) setActiveBucketKey(null);
      return;
    }
    const stillValid = groups.some((g) => g.id === activeGroupId);
    if (!stillValid) {
      const dflt = groups.find((g) => g.default);
      setActiveGroupId(dflt ? dflt.id : null);
      setActiveBucketKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;
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
  // groups read from the property definition — which may itself be a
  // derived property with a formula, hence the computePropertyValue call.
  const valueForGroup = (folder) => {
    if (!activeGroup) return undefined;
    if (activeGroup.property_id === 'img') {
      return folder.has_image ? 'With image' : 'No image';
    }
    const prop = propertiesById.get(activeGroup.property_id);
    if (prop) return computePropertyValue(folder, prop, propertiesByLabel);
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
    // FIX374.2.11 [ex-FIX372.6.2.11]: apply the active grouping bucket filter.
    if (activeGroup && activeBucketKey && activeParsed) {
      rows = rows.filter((f) => {
        const v = valueForGroup(f);
        if (activeBucketKey === NO_VALUE_KEY) {
          // FIX374.2.3 [ex-FIX372.6.2.3]: folders with no bucketable value sit in this pile.
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
          return String(getColumnValue(f, col, propertiesById, propertiesByLabel))
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
          const cmp = compareValues(
            getColumnValue(a, col, propertiesById, propertiesByLabel),
            getColumnValue(b, col, propertiesById, propertiesByLabel),
          );
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    return rows;
  }, [liveFolders, filters, sortKeys, configuredColumns, activeGroup, activeBucketKey, activeParsed, propertiesById, propertiesByLabel]);

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
    setShowColumns(false);
  };

  const handleSaveGrouping = (result) => {
    setData((prev) => ({
      ...prev,
      properties: result.properties ?? prev.properties,
      view_setup: result.view_setup ?? prev.view_setup,
    }));
    setShowGrouping(false);
  };

  // FIX510.3.2 / FIX510.3.3: keyboard navigation.
  //   ↑/↓ — previous/next item in the Showcase list.
  //   ←/→ — previous/next image in the Image viewer.
  // Skipped when a modal is open, when focus is in an editable field (so
  // filter / dialog inputs still behave natively), and mid-crop (the user
  // is selecting corners and shouldn't lose the image under them).
  useEffect(() => {
    const onKey = (e) => {
      if (showSetup || showColumns || showGrouping || importOpen || importImagesOpen) return;
      // FIX521: the Image List editor owns its own arrow-key handling while
      // in edition mode (table row selection, not global item/image nav).
      if (editionMode) return;
      const ae = document.activeElement;
      const tag = ae?.tagName;
      const editable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae?.isContentEditable;
      if (editable) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!displayedFolders.length) return;
        e.preventDefault();
        const idx = displayedFolders.findIndex((f) => f.id === selectedFolderId);
        const next = e.key === 'ArrowDown'
          ? Math.min(displayedFolders.length - 1, idx < 0 ? 0 : idx + 1)
          : Math.max(0, idx < 0 ? 0 : idx - 1);
        setSelectedFolderId(displayedFolders[next].id);
      } else if (e.key === 'ArrowLeft') {
        if (!images.length) return;
        e.preventDefault();
        setCurrentImageIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        if (!images.length) return;
        e.preventDefault();
        setCurrentImageIdx((i) => Math.min(images.length - 1, i + 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    showSetup, showColumns, showGrouping, importOpen, importImagesOpen,
    editionMode, displayedFolders, selectedFolderId, images.length,
  ]);

  // Keep the selected row in view when ↑/↓ walks past the panel edge.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedFolderId]);

  if (error) return <div className="sc-error">Error: {error}</div>;
  if (!data) return <div className="sc-loading">Loading…</div>;

  const currentImage = images[currentImageIdx];

  // FIX374.1: dropdown of all defined Groupings. Labelled by the
  // Grouping Name (FIX373.2.1.1); falls back to the property label
  // for legacy entries that were migrated from the pre-FIX373-update
  // shape and never got a user-entered name.
  const groupSelector =
    groups.length > 0 ? (
      <div className="sc-group-selector">
        <label>
          Group by:&nbsp;
          <select
            value={activeGroupId ?? ''}
            onChange={(e) => {
              setActiveGroupId(e.target.value || null);
              setActiveBucketKey(null);
            }}
          >
            <option value="">(none)</option>
            {groups.map((g) => {
              const fallback =
                g.property_id === 'img'
                  ? 'Img'
                  : properties.find((pp) => pp.id === g.property_id)?.label
                    ?? `Property ${g.property_id}`;
              const label = (g.name && g.name.trim()) || fallback;
              return (
                <option key={g.id} value={g.id}>
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
    const prop = propertiesById.get(col.property_id);
    if (!prop) return <td key={key} style={cellStyle}>—</td>;
    const raw = computePropertyValue(folder, prop, propertiesByLabel);
    const display =
      raw === '' || raw == null
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
      {/* FIX503 / FIX503.0 <panel-showcase-header>: Showcase header panel.
          FIX503.2.10.1 left: <button-home>, <label-project-name>.
          FIX503.2.10.2 right: <button-columns>, <button-item-grouping>,
          <menu-import>, <button-setup>. */}
      <div className="sc-topbar" data-yagu-id="panel-showcase-header">
        {/* FIX503.2.1 + FIX503.2.1.0 + FIX503.2.1.1 + FIX503.3.1
            <button-home>: icon button, navigates to the home page. */}
        <button
          type="button"
          className="sc-home-btn"
          data-yagu-id="button-home"
          onClick={() => { window.location.hash = '#home'; }}
          aria-label="Home"
          title="Home"
        >
          ⌂
        </button>
        {/* FIX503.2.2 + FIX503.2.2.0 <label-project-name>. */}
        <h1 className="sc-project-title" data-yagu-id="label-project-name">
          {data.project?.name ?? 'Showcase'}
        </h1>
        {/* FIX503.2.3 + FIX503.2.3.0 + FIX503.3.2 <button-columns>: opens
            the standalone <panel-showcase-view-setup> popup. Not listed
            under FIX503.5.1, so visible to anonymous visitors too: setting
            columns is a viewer affordance, not admin work. */}
        <button
          type="button"
          className="sc-menu-trigger"
          data-yagu-id="button-columns"
          onClick={() => setShowColumns(true)}
        >
          Columns
        </button>
        {/* FIX503.2.4 + FIX503.2.4.0 + FIX503.3.3 + FIX503.5.1 (.4.1.2)
            <button-item-grouping>: opens <panel-item-grouping-setup> in a
            layer popup, signed-in only. */}
        {profile && (
          <button
            type="button"
            className="sc-menu-trigger"
            data-yagu-id="button-item-grouping"
            onClick={() => setShowGrouping(true)}
          >
            Grouping
          </button>
        )}
        {/* FIX503.2.5 + FIX503.5.1.1 / FIX369 / FIX369.0 <menu-import>:
            Import menu, visible only when signed in (FIX369.1). */}
        {profile && (
          <div className="sc-menu" data-yagu-id="menu-import" ref={menuRef}>
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
                {/* FIX371.2.2 / FIX371.2.2.1: 'Images' placed first. */}
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setImportImagesOpen(true); }}
                  >
                    Images
                  </button>
                </li>
                {/* FIX3703.1: 'Image Properties' menu option. */}
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
        {/* FIX503.2.6 + FIX503.2.6.0 + FIX503.2.6.1 + FIX503.5.1 (.4.1.3)
            <button-setup>: Setup icon button, signed-in only. Opens the
            tabbed general panel (admin: property list + file-explorer
            settings, plus the Showcase tab as a convenience). */}
        {profile && (
          <button
            type="button"
            className="sc-setup-btn"
            data-yagu-id="button-setup"
            onClick={() => setShowSetup(true)}
            aria-label="Open setup"
            title="Setup"
          >
            ⚙
          </button>
        )}
      </div>
      <div
        className="sc-main"
        ref={mainRef}
        style={{
          // FIX374.2.5 [ex-FIX372.6.2.5]: the Item Grouping panel always fits its listed
          // values — CSS grid's max-content resizes automatically as the
          // bucket list changes (new group picked, default group applied).
          gridTemplateColumns: activeGroup
            ? `max-content ${listWidth}px 6px 1fr`
            : `${listWidth}px 6px 1fr`,
        }}
      >
        {/* FIX374.2.0 [ex-FIX372.6.2.0]: the group dropdown is at the top-left of the side
            panel when one is shown, otherwise at the top-left of the item
            table. Rendered once via groupSelector and placed in the right
            parent below. */}
        {activeGroup && (() => {
          // FIX374.2.9 [ex-FIX372.6.2.9]: when the active group uses a segment (integer or
          // text range), each pill gets a tint along a gradient so consecutive
          // segments are visually distinguished. Exact-value groups keep the
          // flat pill background. The 'No value' and 'All' buckets are never
          // tinted.
          const isSegmentMode =
            activeParsed &&
            (activeParsed.type === 'integer' || activeParsed.type === 'text');
          // FIX374.2.10 [ex-FIX372.6.2.10]: 'All ({n-of-items})' pill at the top of the list
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
                  ref={f.id === selectedFolderId ? selectedRowRef : null}
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
          {/* FIX515.2.1: tab strip switches between Images and Details.
              FIX515.2.2 + FIX515.2.2.0 + FIX515.3.2 + FIX515.4.3
              <button-edit>: right-aligned on the tab row, signed-in only,
              toggles edition of the current tab. */}
          <div className="sc-viewer-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewerTab === 'images'}
              className={viewerTab === 'images' ? 'active' : ''}
              onClick={() => {
                setViewerTab('images');
                setEditionMode(false);
              }}
            >
              Images
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewerTab === 'details'}
              className={viewerTab === 'details' ? 'active' : ''}
              onClick={() => {
                setViewerTab('details');
                setEditionMode(false);
              }}
            >
              Details
            </button>
            {profile && !editionMode && (
              <button
                type="button"
                className="sc-viewer-edit-btn"
                data-yagu-id="button-edit"
                onClick={() => setEditionMode(true)}
                title="Edit"
              >
                Edit
              </button>
            )}
          </div>
          {viewerTab === 'images' ? (
            // FIX515.3.2.1: when the user clicks <button-edit> on the Images
            // tab, swap the read-only viewer for <panel-showcase-img-list-editor>.
            editionMode ? (
              <ShowcaseImgListEditor
                images={images}
                selectedIdx={currentImageIdx}
                setSelectedIdx={setCurrentImageIdx}
                setImages={setImages}
                onExitEdit={() => setEditionMode(false)}
              />
            ) : (() => {
              // FIX520.2: Showcase Image viewer (read-only). New layout:
              //   Sections panel (left, optional) | Image + nav (right).
              // FIX520.5.2: the sections panel is rendered only when the
              // item has at least one image with a section defined.
              const sections = [];
              const seen = new Set();
              for (const im of images) {
                const s = (im.section ?? '').trim();
                if (!s || seen.has(s)) continue;
                seen.add(s);
                sections.push(s);
              }
              const activeSection = (currentImage?.section ?? '').trim() || null;
              const jumpToSection = (s) => {
                const idx = images.findIndex(
                  (im) => (im.section ?? '').trim() === s,
                );
                if (idx >= 0) setCurrentImageIdx(idx);
              };
              return (
                <div className="sc-viewer-body">
                  {/* FIX520.2.5 <panel-img-sections>. FIX520.5.2: only
                      visible when at least one image has a section. */}
                  {sections.length > 0 && (
                    <div
                      className="sc-viewer-sections"
                      data-yagu-id="panel-img-sections"
                    >
                      <ul>
                        {sections.map((s) => (
                          <li key={s}>
                            <button
                              type="button"
                              className={s === activeSection ? 'active' : ''}
                              onClick={() => jumpToSection(s)}
                              title={`Jump to first image in "${s}"`}
                            >
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="sc-viewer-main">
                    {currentImage ? (
                      <>
                        {/* FIX520.2 (updated): prev/next + i/n now sit at
                            the top of the image column; the image fills
                            the space below. FIX520.2.2 / .2.3 / .2.4. */}
                        <div className="sc-viewer-nav">
                          <button
                            type="button"
                            onClick={() => setCurrentImageIdx((i) => Math.max(0, i - 1))}
                            disabled={currentImageIdx === 0}
                            aria-label="Previous image"
                          >
                            ‹
                          </button>
                          <span
                            className="sc-viewer-pos"
                            data-yagu-id="label-image-index"
                          >
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
                        <div className="sc-viewer-img-wrap">
                          <ShowcaseImageCanvas
                            url={currentImage.url}
                            rotation={currentImage.rotation ?? 0}
                            crop={currentImage.crop ?? null}
                            className="sc-viewer-img"
                          />
                          {currentImage.caption && (
                            <div className="sc-viewer-caption">{currentImage.caption}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="sc-viewer-empty">No images in this item.</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            // FIX518: Item Details panel — FIX518.2.1 view-mode is a
            // read-only property list; FIX518.2.2 edition-mode swaps values
            // to inputs (except derived properties — FIX518.4.6) and adds a
            // Cancel/Save footer.
            <div className={`sc-details${editionMode ? ' editing' : ''}`}>
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
                // trimmed). Only applies to stored properties — derived ones
                // (FIX506.5.3.2) always render as their computed value.
                const isBooleanProperty = (p) => {
                  if (p.formula) return false;
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
                const storedValue = (p) => {
                  const key = String(p.id);
                  if (Object.prototype.hasOwnProperty.call(detailDraft, key)) {
                    return detailDraft[key];
                  }
                  const raw = (selectedFolder.properties || {})[key];
                  return raw == null ? '' : String(raw);
                };
                const setDraft = (p, v) => {
                  setDetailDraft((d) => ({ ...d, [String(p.id)]: v }));
                };
                const renderValue = (p) => {
                  // FIX518.4.6: derived properties are always auto-recalculated
                  // and never editable.
                  if (editionMode && !p.formula) {
                    if (isBooleanProperty(p)) {
                      const checked = String(storedValue(p)).trim().toLowerCase() === 'x';
                      return (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setDraft(p, e.target.checked ? 'x' : '')}
                        />
                      );
                    }
                    return (
                      <input
                        type="text"
                        value={storedValue(p)}
                        onChange={(e) => setDraft(p, e.target.value)}
                      />
                    );
                  }
                  const raw = computePropertyValue(selectedFolder, p, propertiesByLabel);
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
                const saveLocal = () => {
                  // No cloud backend for per-folder writes yet. Merge the
                  // draft into the in-memory folder so the UI reflects the
                  // change until a reload — wire to a real endpoint once
                  // backendCloud.setFolderProperty lands.
                  setData((prev) => ({
                    ...prev,
                    folders: prev.folders.map((f) =>
                      f.id === selectedFolderId
                        ? { ...f, properties: { ...(f.properties || {}), ...detailDraft } }
                        : f,
                    ),
                  }));
                  setDetailDraft({});
                  setEditionMode(false);
                };
                return (
                  <>
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
                    {editionMode && (
                      <footer className="sc-viewer-edit-footer">
                        <button
                          type="button"
                          onClick={() => { setDetailDraft({}); setEditionMode(false); }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={saveLocal}
                          title="Saved locally only — backend write endpoint pending"
                        >
                          Save
                        </button>
                      </footer>
                    )}
                  </>
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
      {showColumns && (
        <ShowcaseViewSetupPanel
          properties={properties}
          viewSetup={viewSetup}
          onCancel={() => setShowColumns(false)}
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
