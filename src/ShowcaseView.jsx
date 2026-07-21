import { useEffect, useMemo, useState, useRef } from 'react';
import AdminMenu from './AdminMenu.jsx';
import SetupPanel from './SetupPanel.jsx';
import ShowcaseViewSetupPanel from './ShowcaseViewSetupPanel.jsx';
import ShowcaseImageCanvas from './viewer/ShowcaseImageCanvas.jsx';
import ShowcaseImgListEditor from './viewer/ShowcaseImgListEditor.jsx';
import GsheetImportDialog from './gsheet/GsheetImportDialog.jsx';
import ImportImagesDialog from './images/ImportImagesDialog.jsx';
import GroupingPanel from './grouping/GroupingPanel.jsx';
import ContactPanel from './ContactPanel.jsx';
import {
  IconHome,
  IconAbout,
  IconContact,
  IconSignOut,
  RichText,
} from './Icons.jsx';
import { parseSegment, bucketsWithValues, bucketsFor, NO_VALUE_KEY } from './grouping/segments.js';
import { normalizeGroups } from './grouping/groups.js';
import { useAuth } from './AuthContext.jsx';
import { getShowcase, getFolderImages, trackVisit, setFolderZoomFactor } from './data/backend.js';
import { REFERENCE_VIEWPORT } from './zoom.js';
import { computePropertyValue, parseTrailingValues, valueSetEdge } from './properties/formulas.js';
import { buildItemShortLabel } from './properties/itemShortLabel.js';

// Live viewport-size listener; pairs with FIX503.5.4 (long vs short
// project title pick). Returns `true` when the media query matches
// and re-renders on resize.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

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

// FIX500.2.3.2.1.2.2.4 <Image size>: human-readable total bytes of an item's
// images. Empty string when the item has no images (or zero bytes).
function formatImageSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
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
  // FIX500.2.3.2.1.2.2.4 <Image size>
  if (col.type === 'img_size') return formatImageSize(folder.image_bytes);
  // FIX500.2.3.2.1.2.2.5 <Img zoom factor>: stored item Zoom Factor.
  if (col.type === 'img_zoom') return folder.zoom_factor == null ? '' : folder.zoom_factor.toFixed(2);
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

export default function ShowcaseView({ slug, initialItemId, onNavigateHome }) {
  const { profile, signOut } = useAuth();
  const [data, setData] = useState(null);
  // FIX503.5.1: <menu-import>, <button-item-grouping>, <button-setup>,
  // <menu-admin> are visible only to project Admins/Managers. The
  // backend computes per-project membership and returns the flag on
  // /api/showcase.
  const isAdminOrManager = !!data?.project?.is_admin_or_manager;
  // FIX510.2.1.11: Ctrl-click adds rows to the selection. The order
  // matters because FIX510.5.3 says the *first* selected row drives
  // what the right-hand Item Panel renders.
  // Single-select callers keep working via `selectedFolderId`, which
  // is derived as the head of this list.
  const [selectedFolderIds, setSelectedFolderIds] = useState([]);
  const selectedFolderId = selectedFolderIds[0] ?? null;
  const selectOnly = (id) =>
    setSelectedFolderIds(id == null ? [] : [id]);
  const toggleSelected = (id) => {
    setSelectedFolderIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };
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
  const [contactOpen, setContactOpen] = useState(false);
  // FIX503.3.5 <button-project-about>: simple Ok-only popup showing
  // <project-introduction>.
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeBucketKey, setActiveBucketKey] = useState(null);
  // FIX503.5.4: pick the smartphone vs PC variant of <project-title>.
  // 600px matches the existing breakpoint used to hide
  // <label-project-name> on mobile.
  const isSmallScreen = useMediaQuery('(max-width: 600px)');
  const [listWidth, setListWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sc-list-width'));
    return Number.isFinite(saved) && saved > 200 ? saved : 640;
  });
  // FIX520.3.2: clicking the viewer image opens it in a full-screen
  // overlay; ESC (or clicking the backdrop) exits.
  const [fullScreen, setFullScreen] = useState(false);
  // FIX520.3.3: zoom slider for the in-page viewer — 1 = fit (default),
  // >1 enlarges the image past the container so scrollbars appear.
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const menuRef = useRef(null);
  const mainRef = useRef(null);
  const selectedRowRef = useRef(null);
  // Swipe-to-navigate on the viewer image (FIX520 mobile UX). Refs so we
  // don't re-render on every touchmove, and so the click handler can
  // detect "this was actually a swipe, don't open fullscreen".
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const wasSwipeRef = useRef(false);
  // FIX520.3.3: drag-to-pan while zoomed. viewerScrollRef is the scrolling
  // element itself (scrollLeft/scrollTop are moved directly on drag);
  // draggedRef tells the click handler a pan just happened so it doesn't
  // also open fullscreen.
  const viewerScrollRef = useRef(null);
  const panStateRef = useRef(null);
  const draggedRef = useRef(false);
  const onImageTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    wasSwipeRef.current = false;
  };
  const onImageTouchEnd = (e) => {
    const sx = touchStartXRef.current;
    const sy = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (sx == null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    // Treat as a swipe only when motion is mostly horizontal and over a
    // sensible threshold; otherwise let it fall through as a click
    // (fullscreen) or vertical scroll.
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    wasSwipeRef.current = true;
    setCurrentImageIdx((i) =>
      dx > 0 ? Math.max(0, i - 1) : Math.min(images.length - 1, i + 1),
    );
  };
  const onImageClick = () => {
    // FIX520.3.2: click opens fullscreen, but a horizontal swipe must
    // not also fire fullscreen (the touch sequence ends with a click).
    if (wasSwipeRef.current) {
      wasSwipeRef.current = false;
      return;
    }
    // FIX520.3.3: a drag-to-pan gesture also ends with a click — don't
    // let it also open fullscreen.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setFullScreen(true);
  };

  // FIX520.3.3: zoom slider — once zoomed, dragging on the image pans it
  // (hand-shape cursor), mirroring the scrollbars that appear alongside.
  const onZoomPointerDown = (e) => {
    if (zoomLevel <= 1) return;
    const wrap = viewerScrollRef.current;
    if (!wrap) return;
    e.preventDefault();
    draggedRef.current = false;
    panStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
    };
    setIsPanning(true);
  };
  useEffect(() => {
    if (!isPanning) return undefined;
    const move = (e) => {
      const wrap = viewerScrollRef.current;
      const p = panStateRef.current;
      if (!wrap || !p) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true;
      wrap.scrollLeft = p.scrollLeft - dx;
      wrap.scrollTop = p.scrollTop - dy;
    };
    const up = () => {
      setIsPanning(false);
      panStateRef.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isPanning]);

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

  // FIX508.2.3: auto-selection now lives in a separate effect below that
  // fires against the *displayed* list (post grouping, bucket and column
  // filters), so the "first item" matches what the user actually sees.
  // FIX401.2: every fetch is scoped to the URL's project slug so the
  // showcase only sees one project's items, properties, images,
  // grouping and column definitions.
  const reloadShowcase = () =>
    getShowcase(slug)
      .then((d) => setData(d))
      .catch((e) => setError(e.message || String(e)));

  // FIX371.6: after an image import, reload the view (FIX371.6.5) and store
  // each affected item's max image ZF <item-img-zoom-factor> (FIX371.6.4 /
  // FIX521.5.8.1). itemMaxZf maps item name (folder #) -> max ZF among the
  // images uploaded in that run. Since adding images can only raise an item's
  // max ZF, the new value is max(previously stored, just-imported). Persisting
  // each image's own ZF (also required by FIX521.5.8.1) needs a per-image
  // backend field/endpoint that does not exist yet — only the item ZF is stored.
  const handleImportDone = async (itemMaxZf) => {
    let d;
    try {
      d = await getShowcase(slug);
    } catch (e) {
      setError(e.message || String(e));
      return;
    }
    const pending = [];
    const folders = (d.folders || []).map((f) => {
      const measured = itemMaxZf?.[f.name];
      if (measured == null) return f;
      const merged = Math.max(f.zoom_factor ?? 0, measured);
      if (merged === (f.zoom_factor ?? 0)) return f;
      pending.push([f.id, merged]);
      return { ...f, zoom_factor: merged };
    });
    setData({ ...d, folders });
    // FIX371.6.6: the 'Img zoom factor' derived column reads folder.zoom_factor,
    // so updating it above refreshes the property; persist to the backend too.
    for (const [id, zf] of pending) setFolderZoomFactor(id, zf).catch(() => {});
  };

  useEffect(() => {
    setData(null);
    selectOnly(null);
    getShowcase(slug)
      .then(setData)
      .catch((e) => setError(e.message || String(e)));
    // FIX503.5.1: re-fetch on sign-in/sign-out too — the response
    // carries the per-user is_admin_or_manager flag that gates the
    // header's admin affordances.
  }, [slug, profile?.id]);

  // FIX352.3.10.10: re-fetch when admin saves project details (name,
  // managers, intros, slugs etc.) so the open ShowcaseView reflects
  // them without a manual reload. Skip when the event is for a
  // different project.
  useEffect(() => {
    const onUpdated = (e) => {
      const updatedId = e?.detail?.projectId;
      const currentId = data?.project?.id;
      if (updatedId != null && currentId != null && updatedId !== currentId) {
        return;
      }
      reloadShowcase();
    };
    window.addEventListener('project:updated', onUpdated);
    return () => window.removeEventListener('project:updated', onUpdated);
    // reloadShowcase reads `slug` from the closure; rebind whenever
    // slug or the open project's id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, data?.project?.id]);

  // FIX410.1.1.1.1.1: log a consultation of <panel-project-home>.
  // FIX412.2.1.1.1: tag the visit with the resolved project id so the
  // History tab can render its name. Fire once per project — the
  // backend dedups within 30s anyway so a re-fire on slug change is
  // harmless.
  const trackedProjectIdRef = useRef(null);
  useEffect(() => {
    const pid = data?.project?.id;
    if (pid == null) return;
    if (trackedProjectIdRef.current === pid) return;
    trackedProjectIdRef.current = pid;
    trackVisit('project', { project_id: pid });
  }, [data?.project?.id]);

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
        // FIX510.3.4: on item selection, show the Main image first;
        // when no image is flagged main, show the first image of the
        // list. The Main flag is set per row in the Image List editor
        // (FIX521.2.1.1.5 / <item-main-img>, FIX521.5.6).
        const mainIdx = imgs.findIndex((i) => i.is_main);
        setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      })
      .catch((e) => setError(e.message || String(e)));
  }, [selectedFolderId]);

  // FIX520.3.3: zoom is per-image — reset to fit whenever the displayed
  // image changes (folder switch or prev/next navigation).
  useEffect(() => {
    setZoomLevel(1);
  }, [currentImageIdx, selectedFolderId]);

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
  // FIX500.2.3.5.2 / FIX500.2.3.2.1.3.5: anonymous users persist their
  // Showcase Columns tweaks in localStorage; logged-in users hit the DB.
  // The override (when present) wins over the DB config for rendering,
  // but the DB config is preserved as the source of truth — the Reset
  // button clears the override (FIX500.2.3.2.1.3.4).
  const isAnonymous = !profile;
  const projectId = data?.project?.id ?? null;
  const localStorageKey = projectId != null ? `sc-columns-${projectId}` : null;
  const [localShowcaseOverride, setLocalShowcaseOverride] = useState(null);
  useEffect(() => {
    if (!isAnonymous || !localStorageKey) {
      setLocalShowcaseOverride(null);
      return;
    }
    try {
      const raw = localStorage.getItem(localStorageKey);
      setLocalShowcaseOverride(raw ? JSON.parse(raw) : null);
    } catch {
      setLocalShowcaseOverride(null);
    }
  }, [isAnonymous, localStorageKey]);
  const dbShowcaseCfg = data?.view_setup?.showcase ?? {};
  const effectiveShowcaseCfg = useMemo(() => {
    if (!localShowcaseOverride) return dbShowcaseCfg;
    return { ...dbShowcaseCfg, ...localShowcaseOverride };
  }, [dbShowcaseCfg, localShowcaseOverride]);
  const viewSetup = useMemo(() => {
    const base = data?.view_setup ?? {};
    if (!localShowcaseOverride) return base;
    return { ...base, showcase: effectiveShowcaseCfg };
  }, [data, effectiveShowcaseCfg, localShowcaseOverride]);
  const showcaseCfg = effectiveShowcaseCfg;
  // FIX506.2.2 / FIX500.2.3.2.1.2.2 (updated): the 'Main image icon'
  // column was removed. Filter any leftover entries from previously
  // saved view_setup so existing projects don't render orphan columns.
  const configuredColumns = (() => {
    const cols = (showcaseCfg.columns ?? []).filter(
      (c) => c.type !== 'main_image_icon',
    );
    // FIX510.5.4: when no column is defined, fall back to the # column.
    // _hash forces the header to '#' regardless of folder_column_name.
    return cols.length > 0 ? cols : [{ type: 'folder_name', _hash: true }];
  })();
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
  // FIX508.2.1 / <show-items-with-no-img>: when off, items without any
  // image are hidden from the Showcase list (FIX510.5.1) and grouping
  // (FIX374.2.15). Default true (FIX508.2.1.1).
  const showItemsWithNoImg = viewSetup.show_items_with_no_img !== false;
  // FIX506.2.4 / <setup-date-property> + FIX508.2.2 / <show-items-with-no-date>:
  // when the toggle is off AND a date property is configured, items
  // whose date value is blank/missing are hidden from the Showcase
  // list (FIX510.5.2) and grouping (FIX374.2.16). Default toggle is
  // on (FIX508.2.2.1) — filter only kicks in when the user explicitly
  // unchecks it.
  const datePropertyId = viewSetup.file_explorer?.date_property_id ?? null;
  const showItemsWithNoDate = viewSetup.show_items_with_no_date !== false;
  const liveFolders = useMemo(() => {
    let all = data?.folders ?? [];
    if (!showItemsWithNoImg) {
      all = all.filter((f) => f.has_image);
    }
    if (!showItemsWithNoDate && datePropertyId != null) {
      const dKey = String(datePropertyId);
      all = all.filter((f) => {
        const v = (f.properties || {})[dKey];
        return v != null && String(v).trim() !== '';
      });
    }
    if (deletedPropertyId == null) return all;
    const key = String(deletedPropertyId);
    return all.filter((f) => {
      const v = (f.properties || {})[key];
      return v == null || String(v).trim() === '';
    });
  }, [data, deletedPropertyId, showItemsWithNoImg, showItemsWithNoDate, datePropertyId]);

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

  // FIX506.5.5 / FIX374.2.2: only interpret a value as a set/range (so one
  // item can fall in several Group values) when the grouping property is
  // flagged accepted-value-set. The 'img' derived group never is.
  const activeGroupAcceptsSet =
    !!activeGroup &&
    activeGroup.property_id !== 'img' &&
    !!propertiesById.get(activeGroup.property_id)?.accepted_value_set;

  const bucketList = useMemo(() => {
    if (!activeGroup || !activeParsed) return [];
    const values = liveFolders.map(valueForGroup);
    return bucketsWithValues(values, activeParsed, activeGroupAcceptsSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeParsed, liveFolders, activeGroupAcceptsSet]);

  const displayedFolders = useMemo(() => {
    if (!data) return [];
    let rows = liveFolders;
    // FIX374.2.11 [ex-FIX372.6.2.11]: apply the active grouping bucket filter.
    if (activeGroup && activeBucketKey && activeParsed) {
      rows = rows.filter((f) => {
        const buckets = bucketsFor(valueForGroup(f), activeParsed, activeGroupAcceptsSet);
        if (activeBucketKey === NO_VALUE_KEY) {
          // FIX374.2.3 [ex-FIX372.6.2.3]: folders with no bucketable value sit in this pile.
          return buckets.length === 0;
        }
        // FIX374.2.2: a set/range item matches any of the buckets it spans.
        return buckets.some((b) => b.key === activeBucketKey);
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
    // FIX500.2.3.5.1 / <input-row-order>: columns with a positive
    // row_order define a default sort chain — lowest number sorts first.
    // Gaps don't matter; blank means "skip this column for sorting".
    // User-clicked sortKeys take priority and the row_order chain acts as
    // the tiebreaker, with folder.sort_order as the final tiebreaker.
    // FIX510.2.1.4 also points here.
    const orderedCols = configuredColumns
      .filter((c) => Number.isFinite(c.row_order) && c.row_order > 0)
      .slice()
      .sort((a, b) => a.row_order - b.row_order);
    // FIX506.2.1.1.4 / FIX510.2.1.5: precompute the trailing-value Set
    // per property so we don't re-parse on every comparison.
    const trailingByPropId = new Map();
    for (const p of properties ?? []) {
      if (p.trailing_values) trailingByPropId.set(p.id, parseTrailingValues(p.trailing_values));
    }
    // FIX510.2.1.5: compare two folders on a single column, respecting:
    //  - trailing values: always sorted last regardless of direction
    //  - accepted value sets: pick lo (asc) or hi (desc) edge
    // Returns the final ordering value — caller must NOT flip it.
    const compareOnColumn = (a, b, col, dir) => {
      const prop = col.type === 'property' ? propertiesById.get(col.property_id) : null;
      const va = getColumnValue(a, col, propertiesById, propertiesByLabel);
      const vb = getColumnValue(b, col, propertiesById, propertiesByLabel);
      if (prop) {
        const trailing = trailingByPropId.get(prop.id);
        if (trailing && trailing.size) {
          const aT = trailing.has(String(va).trim());
          const bT = trailing.has(String(vb).trim());
          if (aT !== bT) return aT ? 1 : -1;
        }
      }
      let aVal = va;
      let bVal = vb;
      if (prop?.accepted_value_set) {
        const side = dir === 'desc' ? 'hi' : 'lo';
        aVal = valueSetEdge(va, side);
        bVal = valueSetEdge(vb, side);
      }
      const cmp = compareValues(aVal, bVal);
      return dir === 'desc' ? -cmp : cmp;
    };
    if (sortKeys.length > 0 || orderedCols.length > 0) {
      const colByKey = new Map(configuredColumns.map((c) => [columnKey(c), c]));
      rows = [...rows].sort((a, b) => {
        for (const { key, dir } of sortKeys) {
          const col = colByKey.get(key);
          if (!col) continue;
          const cmp = compareOnColumn(a, b, col, dir);
          if (cmp !== 0) return cmp;
        }
        for (const col of orderedCols) {
          const cmp = compareOnColumn(a, b, col, 'asc');
          if (cmp !== 0) return cmp;
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    return rows;
  }, [liveFolders, filters, sortKeys, configuredColumns, activeGroup, activeBucketKey, activeParsed, propertiesById, propertiesByLabel]);

  // FIX508.2.3 / <setup-select-first-item>: when the option is on, keep
  // the first *displayed* item selected. Runs against displayedFolders
  // (after grouping, bucket and column filters) so the spec's "1st
  // listed item" matches what the user actually sees. Skipped entirely
  // when the option is off — the selection then stays empty, or wherever
  // the user has explicitly clicked.
  useEffect(() => {
    if (!data?.view_setup?.select_first_item) return;
    if (displayedFolders.length === 0) return;
    const stillVisible = displayedFolders.some((f) => f.id === selectedFolderId);
    if (stillVisible) return;
    selectOnly(displayedFolders[0].id);
  }, [data, displayedFolders, selectedFolderId]);

  // FIX404: direct item access via <app-url>/{id}. When the project is public
  // (FIX404.1.1), open the item whose id (folder name) matches the URL — no
  // group selected, item on the right (FIX404.1.2). Runs after the
  // select-first-item effect so this selection wins, and re-applies on each
  // (re)fetch — e.g. the auth-triggered reload (FIX503.5.1) replaces `data`,
  // and we must re-select rather than fall back to the default — until the
  // user picks a row themselves (userPickedRef).
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (!initialItemId || !data || userPickedRef.current) return;
    if (!data.project?.is_public) return; // FIX404.1.1
    const target = (data.folders || []).find((f) => f.name === initialItemId);
    if (!target) return;
    if (selectedFolderId === target.id && activeGroupId == null) return;
    setActiveGroupId(null); // FIX404.1.2: no group selected
    selectOnly(target.id); // FIX404.1.2: item open on the right
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, initialItemId]);

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
  // FIX520.3.2: ESC exits full-screen image view. Runs before the main
  // keyboard handler below so it's active even when the viewer is in
  // edition mode.
  useEffect(() => {
    if (!fullScreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFullScreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  // FIX520.3.2.1: also wire the system "back" navigation (smartphone
  // back gesture / browser back button) to leave fullscreen, instead of
  // letting it pop the page off the project entirely. Push a history
  // entry on open so the next "back" lands on our popstate handler;
  // when fullscreen closes for any other reason (Back button in the
  // overlay, ESC, or backdrop click), pop our entry so history stays
  // consistent.
  useEffect(() => {
    if (!fullScreen) return undefined;
    window.history.pushState({ scFullScreen: true }, '');
    const onPopState = () => setFullScreen(false);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.history.state && window.history.state.scFullScreen) {
        window.history.back();
      }
    };
  }, [fullScreen]);

  useEffect(() => {
    const onKey = (e) => {
      if (showSetup || showColumns || showGrouping || importOpen || importImagesOpen) return;
      // FIX520.3.2.2: in fullscreen, ←/→ still navigate images (Prev/Next),
      // but ↑/↓ are ignored (no item table to walk through).
      if (fullScreen) {
        if (e.key === 'ArrowLeft') {
          if (!images.length) return;
          e.preventDefault();
          setCurrentImageIdx((i) => Math.max(0, i - 1));
        } else if (e.key === 'ArrowRight') {
          if (!images.length) return;
          e.preventDefault();
          setCurrentImageIdx((i) => Math.min(images.length - 1, i + 1));
        }
        return;
      }
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
        // Keyboard nav stays single-select — Ctrl-arrow isn't a
        // multi-select gesture in this UI.
        userPickedRef.current = true; // FIX404: stop re-applying the URL item
        selectOnly(displayedFolders[next].id);
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
  // FIX374.2.1.1: no 'Group by:' label outside the dropdown — when
  // nothing is selected the dropdown itself shows a ghost 'Group by'
  // value (placeholder-like, dimmed).
  const groupSelector =
    groups.length > 0 ? (
      <div className="sc-group-selector">
        <select
          className={activeGroupId == null ? 'is-placeholder' : ''}
          value={activeGroupId ?? ''}
          onChange={(e) => {
            setActiveGroupId(e.target.value || null);
            setActiveBucketKey(null);
          }}
        >
          <option value="">Group by</option>
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
      </div>
    ) : null;

  const renderHeaderCell = (col) => {
    const key = columnKey(col);
    const label = columnHeaderLabel(col);
    return (
      <th
        key={key}
        style={widthCss(col.width) ? { width: widthCss(col.width) } : undefined}
        onClick={(e) => handleHeaderClick(key, e.ctrlKey || e.metaKey)}
        title={
          col.type === 'img_zoom'
            ? `Max zoom factor of all the item images based on ${REFERENCE_VIEWPORT.w}×${REFERENCE_VIEWPORT.h}` // FIX521.3.5.5
            : 'Click to sort. Ctrl-click to add a secondary sort key.'
        }
      >
        {label}
        <span className="sc-sort-arrow"> {sortIndicator(key)}</span>
      </th>
    );
  };

  // FIX510.2.1.1.2 / <property-short-name>: Showcase column headers use the
  // property's short name when defined; fall back to the full name otherwise.
  const columnHeaderLabel = (col) => {
    // FIX510.5.4: _hash marks the fallback # column — always '#', never the renamed label.
    if (col.type === 'folder_name') return col._hash ? '#' : folderColumnName;
    if (col.type === 'img') return 'Img';
    if (col.type === 'img_size') return 'Img size'; // FIX500.2.3.2.1.2.2.4
    if (col.type === 'img_zoom') return 'Img zoom factor'; // FIX500.2.3.2.1.2.2.5
    const prop = properties.find((p) => p.id === col.property_id);
    if (!prop) return '(missing)';
    return (prop.short_label && prop.short_label.trim()) || prop.label;
  };

  const renderFilterCell = (col) => {
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
    // FIX500.2.3.2.1.2.2.4 <Image size>
    if (col.type === 'img_size') {
      return (
        <td key={key} className="sc-td-img-size" style={cellStyle}>
          {formatImageSize(folder.image_bytes)}
        </td>
      );
    }
    // FIX500.2.3.2.1.2.2.5 <Img zoom factor>: stored item Zoom Factor.
    if (col.type === 'img_zoom') {
      return (
        <td key={key} className="sc-td-img-size" style={cellStyle}>
          {folder.zoom_factor == null ? '' : folder.zoom_factor.toFixed(2)}
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
    // FIX510.2.1.6: a property value with newlines renders on multiple
    // lines. Override the table's default `white-space: nowrap` (and
    // any col.wrap setting) with pre-line so the newlines survive.
    const cellStyleForDisplay =
      typeof display === 'string' && display.includes('\n')
        ? { ...cellStyle, whiteSpace: 'pre-line' }
        : cellStyle;
    return (
      <td key={key} style={cellStyleForDisplay}>
        {display}
      </td>
    );
  };

  return (
    <div className="sc-layout" data-yagu-id="panel-project-home">
      {/* FIX503 / FIX503.0 <panel-showcase-header>: Showcase header panel.
          FIX503.2.20.1 [ex-503.2.10.1] left: <button-home>,
            <label-project-name>, <button-project-about>.
          All other elements are right-aligned (FIX503.2.20). */}
      <div className="sc-topbar" data-yagu-id="panel-showcase-header">
        {/* FIX503.2.1 + FIX503.2.1.0 + FIX503.2.1.1 + FIX503.3.1
            <button-home>: icon button, navigates to the home page. */}
        <button
          type="button"
          className="sc-icon-btn"
          data-yagu-id="button-home"
          onClick={() => onNavigateHome?.()}
          aria-label="Home"
          title="Home"
        >
          <IconHome size={22} />
        </button>
        {/* FIX503.2.2 + FIX503.2.2.0 <label-project-name>. */}
        <h1 className="sc-project-title" data-yagu-id="label-project-name">
          {data.project?.name ?? 'Showcase'}
        </h1>
        {/* FIX503.2.12 [ex-503.2.11(dup)] + FIX503.3.5 + FIX503.5.3 +
            FIX503.2.20.1 <button-project-about>: info '?' icon,
            left-aligned next to the project name. Visible only when
            the project has a non-empty <project-introduction>;
            clicking opens a layer popup with the introduction text
            and an Ok button. */}
        {(data.project?.introduction || '').trim() && (
          <button
            type="button"
            className="sc-icon-btn"
            data-yagu-id="button-project-about"
            onClick={() => setAboutOpen(true)}
            aria-label="About this project"
            title="About"
          >
            <IconAbout size={22} />
          </button>
        )}
        {/* FIX503.2.13 + FIX503.2.13.0 + FIX503.2.20.1 + FIX503.5.4
            <label-project-title>: decorative label rendered in the
            left cluster after the About button. Long text on PC
            viewports, short text on smartphone (matched against
            min/max-width: 600px). When a project only has one of
            the two, that one is shown on both — keeps existing
            single-title projects working. */}
        {(() => {
          const longTxt = (data.project?.title_long_text || '').trim();
          const shortTxt = (data.project?.title_short_text || '').trim();
          const picked = isSmallScreen
            ? (shortTxt || longTxt)
            : (longTxt || shortTxt);
          if (!picked) return null;
          return (
            <span
              className="sc-project-title-deco"
              data-yagu-id="label-project-title"
              style={{
                fontSize: data.project.title_size
                  ? `${data.project.title_size}px`
                  : undefined,
                color: data.project.title_colour || undefined,
                fontWeight: data.project.title_is_bold ? 700 : 400,
              }}
            >
              {/* FIX352.3.4.4: '{icon-contact}' placeholders are
                  substituted by the inline envelope icon. */}
              <RichText text={picked} />
            </span>
          );
        })()}
        {/* FIX503.2.20: spacer pushes the rest of the header to the
            right edge. */}
        <span className="sc-topbar-spacer" />
        {/* FIX503.2.3 + FIX503.2.3.0 + FIX503.3.2 + FIX503.5.1.4
            <button-columns>: opens the standalone
            <panel-showcase-view-setup> popup. Now gated to admin /
            project-manager (FIX503.5.1.4 dup). */}
        {isAdminOrManager && (
          <button
            type="button"
            className="sc-menu-trigger"
            data-yagu-id="button-columns"
            onClick={() => setShowColumns(true)}
          >
            Columns
          </button>
        )}
        {/* FIX503.2.4 + FIX503.2.4.0 + FIX503.3.3 + FIX503.5.1 (.4.1.2)
            <button-item-grouping>: opens <panel-item-grouping-setup> in a
            layer popup, admin- or project-manager-only. */}
        {isAdminOrManager && (
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
            Import menu, admin- or project-manager-only (FIX503.5.1). */}
        {isAdminOrManager && (
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
        {/* FIX503.2.7 + FIX503.5.1 (.4.1.4) <menu-admin>: admin- or
            project-manager-only, alongside the other admin affordances.
            Reuses the same component instantiated on the App home page
            (FIX410.4.1 / FIX410.4.2). */}
        {isAdminOrManager && <AdminMenu projectId={data.project?.id ?? null} />}
        {/* FIX503.2.6 + FIX503.2.6.0 + FIX503.2.6.1 + FIX503.5.1 (.4.1.3)
            <button-setup>: Setup icon button, admin- or project-manager-only.
            Opens the tabbed general panel (property list + file-explorer
            settings, plus the Showcase tab as a convenience). */}
        {isAdminOrManager && (
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
        {/* FIX503.2.11 + FIX503.3.4 <button-contact-admin>: opens
            <panel-contact-admin>. Visible to everyone (anonymous
            visitors included). Now an icon button (envelope). */}
        <button
          type="button"
          className="sc-icon-btn"
          data-yagu-id="button-contact-admin"
          onClick={() => setContactOpen(true)}
          aria-label="Contact"
          title="Contact"
        >
          <IconContact size={22} />
        </button>
        {/* FIX503.2.9 {user}: the signed-in user's name, between
            Contact and Sign out per the FIX503.2 layout. Only visible
            when signed in. */}
        {profile && (
          <span className="sc-user-label">{profile.login_name}</span>
        )}
        {/* FIX503.2 layout (last item) + FIX503.2.8 [ex-503.2.6] +
            FIX503.2.8.1 (the spec's typo'd FIX400.2.8.1) +
            FIX400.4.10 <button-sign-out>: icon button, visible only
            when the caller is signed in (FIX503.2.8.2). */}
        {profile && (
          <button
            type="button"
            className="sc-icon-btn"
            data-yagu-id="button-sign-out"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <IconSignOut size={22} />
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
                  // FIX374.2.4: 'No value' pill rendered in italic so
                  // it reads as a meta-bucket, distinct from real values.
                  const cls = [
                    selected ? 'selected' : '',
                    isNoValue ? 'novalue' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <li
                      key={b.key}
                      className={cls}
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
        {/* FIX502.2.2 <panel-showcase-list>: the list region of the
            Showcase view. */}
        <section className="sc-list-panel" data-yagu-id="panel-showcase-list">
          {groups.length > 0 && !activeGroup && groupSelector}
          <table className="sc-table">
            <thead>
              <tr>{configuredColumns.map(renderHeaderCell)}</tr>
              <tr className="sc-filter-row">
                {configuredColumns.map(renderFilterCell)}
              </tr>
            </thead>
            <tbody>
              {displayedFolders.map((f) => {
                const isSelected = selectedFolderIds.includes(f.id);
                const isPrimary = f.id === selectedFolderId;
                return (
                  <tr
                    key={f.id}
                    ref={isPrimary ? selectedRowRef : null}
                    /* FIX510.5.3: the *first* selected row carries an
                       extra 'primary' class so the existing styling
                       (highlight + Item-Panel-target) keeps working. */
                    className={
                      [
                        isSelected ? 'selected' : '',
                        isPrimary ? 'selected-primary' : '',
                      ].filter(Boolean).join(' ')
                    }
                    onClick={(e) => {
                      // FIX510.2.1.11: Ctrl/Cmd-click toggles the row
                      // in the multi-selection. Plain click resets to
                      // a single-row selection.
                      userPickedRef.current = true; // FIX404: stop re-applying the URL item
                      if (e.ctrlKey || e.metaKey) toggleSelected(f.id);
                      else selectOnly(f.id);
                    }}
                  >
                    {configuredColumns.map((col) => renderBodyCell(f, col))}
                  </tr>
                );
              })}
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
        {/* FIX502.2.3 <panel-showcase-img-viewer>: the image-viewer
            region (Images + Details tabs share this column). */}
        <section className="sc-viewer" data-yagu-id="panel-showcase-img-viewer">
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
            {/* FIX515.4.3 keeps the Images-tab Edit visible to any
                logged-in user; FIX518.4.7 narrows the Details-tab
                Edit to admin-only. */}
            {!editionMode && (viewerTab === 'details'
              ? profile?.profile === 'admin'
              : !!profile) && (
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
                onItemBytesChange={(bytes) =>
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          folders: prev.folders.map((f) =>
                            f.id === selectedFolderId ? { ...f, image_bytes: bytes } : f,
                          ),
                        }
                      : prev,
                  )
                }
                onItemZoomChange={(zf) => {
                  if (selectedFolderId == null) return;
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          folders: prev.folders.map((f) =>
                            f.id === selectedFolderId ? { ...f, zoom_factor: zf } : f,
                          ),
                        }
                      : prev,
                  );
                  // FIX521.5.8.1: persist the recomputed item Zoom Factor.
                  setFolderZoomFactor(selectedFolderId, zf).catch(() => {});
                }}
              />
            ) : (() => {
              // FIX520.2: Showcase Image viewer (read-only). New layout:
              //   Sections panel (left, optional) | Image + nav (right).
              // FIX520.5.2: the sections panel is rendered only when the
              // item has at least one image with a section defined.
              // FIX522.5.1 (ex-520.5.3): a section name appears once per
              // *run* — if S1 reappears after a different S2, it's
              // listed twice (each entry navigates to the start of its
              // own run, not a global "first occurrence").
              // FIX522.5.2 (ex-520.5.4): when a run spans several
              // consecutive images the count is appended as " (n)";
              // n=1 stays unadorned.
              // FIX522.5.3: a single '/' in a section name introduces a
              // hierarchy level (root/sub). '//' escapes to a literal
              // '/'. Consecutive runs sharing the same root collapse
              // under a single header (FIX522.5.3.2).
              // FIX522.5.3.1: the root header is clickable only when an
              // image actually has the bare root as its section name.
              const splitSection = (s) => {
                const out = [];
                let cur = '';
                for (let i = 0; i < s.length; i++) {
                  if (s[i] === '/') {
                    if (s[i + 1] === '/') { cur += '/'; i += 1; }
                    else { out.push(cur.trim()); cur = ''; }
                  } else { cur += s[i]; }
                }
                out.push(cur.trim());
                return out;
              };
              const sectionRuns = [];
              let lastSection = null;
              for (let i = 0; i < images.length; i++) {
                const s = (images[i].section ?? '').trim();
                if (!s) continue;
                if (s !== lastSection) {
                  sectionRuns.push({
                    section: s,
                    parts: splitSection(s),
                    startIdx: i,
                    count: 1,
                  });
                  lastSection = s;
                } else {
                  sectionRuns[sectionRuns.length - 1].count += 1;
                }
              }
              // FIX522.5.3.2: collapse consecutive runs sharing the
              // same root (parts[0]) into a single rendered group.
              const sectionGroups = [];
              for (const run of sectionRuns) {
                const root = run.parts[0];
                const sub = run.parts.length > 1
                  ? run.parts.slice(1).join('/')
                  : null;
                const last = sectionGroups[sectionGroups.length - 1];
                if (last && last.root === root) {
                  last.items.push({ sub, run });
                } else {
                  sectionGroups.push({ root, items: [{ sub, run }] });
                }
              }
              // The active run is the latest run whose startIdx <=
              // currentImageIdx — keeps the right entry highlighted
              // even on images with no section between two named runs.
              let activeRunIdx = -1;
              for (let i = 0; i < sectionRuns.length; i++) {
                if (sectionRuns[i].startIdx <= currentImageIdx) activeRunIdx = i;
                else break;
              }
              const activeRun = sectionRuns[activeRunIdx] || null;
              const runLabel = (r) =>
                r.count > 1 ? `${r.section} (${r.count})` : r.section;
              const subLabel = (it) =>
                it.run.count > 1 ? `${it.sub} (${it.run.count})` : it.sub;
              // FIX520.2.1 vs FIX520.2.2: when the sections panel is
              // visible, the nav pill is rendered at its bottom (left
              // column). Otherwise the pill lives in the image's
              // bottom strip alongside the caption (right column).
              const navPill = currentImage ? (
                <div className="sc-viewer-nav">
                  <button
                    type="button"
                    data-yagu-id="button-prev"
                    onClick={() => setCurrentImageIdx((i) => Math.max(0, i - 1))}
                    disabled={currentImageIdx === 0}
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                  {/* FIX520.2.4 / FIX520.2.4.0 <label-image-index>. */}
                  <span
                    className="sc-viewer-pos"
                    data-yagu-id="label-image-index"
                  >
                    {currentImageIdx + 1} / {images.length}
                  </span>
                  <button
                    type="button"
                    data-yagu-id="button-next"
                    onClick={() =>
                      setCurrentImageIdx((i) => Math.min(images.length - 1, i + 1))
                    }
                    disabled={currentImageIdx >= images.length - 1}
                    aria-label="Next image"
                  >
                    ›
                  </button>
                </div>
              ) : null;
              return (
                <div className="sc-viewer-body">
                  {/* FIX522 / FIX522.0 <panel-img-sections>.
                      FIX520.5.2: only visible when at least one image
                      has a section. FIX522.5.3: a single '/' in a
                      section name renders as a nested child under a
                      shared root header. */}
                  {sectionRuns.length > 0 && (
                    <div
                      className="sc-viewer-sections"
                      data-yagu-id="panel-img-sections"
                    >
                      <ul>
                        {sectionGroups.map((g, gi) => {
                          const bare = g.items.find((it) => it.sub === null);
                          const children = g.items.filter((it) => it.sub !== null);
                          // Flat case — no '/' anywhere in this group
                          // (just a plain run, possibly repeated). Render
                          // as a single clickable entry, no header/child
                          // structure.
                          if (children.length === 0 && bare) {
                            return (
                              <li key={gi}>
                                <button
                                  type="button"
                                  className={bare.run === activeRun ? 'active' : ''}
                                  onClick={() => setCurrentImageIdx(bare.run.startIdx)}
                                  title={`Jump to image ${bare.run.startIdx + 1} ("${bare.run.section}")`}
                                >
                                  {runLabel(bare.run)}
                                </button>
                              </li>
                            );
                          }
                          // FIX522.5.3.1: header is clickable only when a
                          // bare-root run exists in this group.
                          return (
                            <li key={gi} className="sc-section-group">
                              {bare ? (
                                <button
                                  type="button"
                                  className={`sc-section-header${bare.run === activeRun ? ' active' : ''}`}
                                  onClick={() => setCurrentImageIdx(bare.run.startIdx)}
                                  title={`Jump to image ${bare.run.startIdx + 1} ("${bare.run.section}")`}
                                >
                                  {runLabel(bare.run)}
                                </button>
                              ) : (
                                <div className="sc-section-header sc-section-header-static">
                                  {g.root}
                                </div>
                              )}
                              <ul className="sc-section-children">
                                {children.map((it, ci) => (
                                  <li key={ci}>
                                    <button
                                      type="button"
                                      className={it.run === activeRun ? 'active' : ''}
                                      onClick={() => setCurrentImageIdx(it.run.startIdx)}
                                      title={`Jump to image ${it.run.startIdx + 1} ("${it.run.section}")`}
                                    >
                                      {subLabel(it)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          );
                        })}
                      </ul>
                      {/* FIX520.2.1: nav pill anchored to the bottom of
                          the sections column when one is shown. */}
                      {navPill}
                    </div>
                  )}
                  <div className="sc-viewer-main">
                    {currentImage ? (
                      <>
                        {/* FIX520.2 (updated): image fills the column;
                            caption (left, FIX520.2.6) and nav pill
                            (right when caption present, centred when
                            not — FIX520.2.10) share the bottom row. */}
                        <div className="sc-viewer-img-wrap">
                          {/* FIX520.3.3: zoom slider — displays the image
                              bigger; past 1x the scroll region below grows
                              scrollbars and switches to a hand cursor for
                              drag-to-pan. */}
                          <div
                            className="sc-viewer-zoom"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="sc-viewer-zoom-label">Zoom</span>
                            <input
                              type="range"
                              min={1}
                              max={3}
                              step={0.1}
                              value={zoomLevel}
                              onChange={(e) => setZoomLevel(Number(e.target.value))}
                              aria-label="Zoom image"
                              title="Zoom"
                            />
                          </div>
                          <div
                            ref={viewerScrollRef}
                            className={`sc-viewer-img-scroll sc-viewer-img-clickable${
                              zoomLevel > 1 ? ' zoomed' : ''
                            }${isPanning ? ' panning' : ''}`}
                            onClick={onImageClick}
                            onTouchStart={onImageTouchStart}
                            onTouchEnd={onImageTouchEnd}
                            onMouseDown={onZoomPointerDown}
                            title={
                              zoomLevel > 1
                                ? 'Drag to pan'
                                : 'Click to view full screen — swipe left/right to navigate'
                            }
                          >
                            <ShowcaseImageCanvas
                              url={currentImage.url}
                              rotation={currentImage.rotation ?? 0}
                              crop={currentImage.crop ?? null}
                              className="sc-viewer-img"
                              zoom={zoomLevel}
                            />
                          </div>
                        </div>
                        <div
                          className={`sc-viewer-bottom${currentImage.caption ? ' has-caption' : ''}`}
                        >
                          {currentImage.caption && (
                            <div
                              className="sc-viewer-caption"
                              data-yagu-id="label-img-caption"
                            >
                              {currentImage.caption}
                            </div>
                          )}
                          {/* FIX520.2.2: when there's no sections panel,
                              the nav pill sits in the image's bottom
                              strip. Otherwise it lives in the sections
                              column above. */}
                          {sectionRuns.length === 0 && navPill}
                        </div>
                      </>
                    ) : (
                      <div className="sc-viewer-empty">
                        {selectedFolderId == null
                          ? 'No item selected.'
                          : 'No images in this item.'}
                      </div>
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
                // FIX518.4.2: order follows the sort order set in
                // <tab-properties-setup>.
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
                    const draft = storedValue(p);
                    // FIX518.4.8: a multi-line value stays multi-line
                    // when edited too, otherwise the single-line input
                    // would silently lose its newlines on save.
                    if (typeof draft === 'string' && draft.includes('\n')) {
                      const rows = Math.min(8, draft.split('\n').length + 1);
                      return (
                        <textarea
                          value={draft}
                          rows={rows}
                          onChange={(e) => setDraft(p, e.target.value)}
                        />
                      );
                    }
                    return (
                      <input
                        type="text"
                        value={draft}
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
                  // FIX518.4.8: preserve newlines on display so values
                  // imported as multi-line text render across multiple
                  // lines (CSS white-space: pre-line on the wrapper).
                  if (typeof raw === 'string' && raw.includes('\n')) {
                    return <span className="sc-details-multiline">{raw}</span>;
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
          projectId={data?.project?.id ?? null}
          properties={properties}
          viewSetup={viewSetup}
          onCancel={() => setShowSetup(false)}
          onSave={handleSaveSetup}
        />
      )}
      {showColumns && (
        <ShowcaseViewSetupPanel
          projectId={data?.project?.id ?? null}
          properties={properties}
          viewSetup={viewSetup}
          isAnonymous={isAnonymous}
          onCancel={() => setShowColumns(false)}
          onSave={handleSaveSetup}
          onLocalSave={(showcaseCfgLocal) => {
            // FIX500.2.3.2.1.3.5 — anonymous Save persists locally.
            if (localStorageKey) {
              try {
                localStorage.setItem(localStorageKey, JSON.stringify(showcaseCfgLocal));
              } catch { /* quota / disabled storage — ignore */ }
            }
            setLocalShowcaseOverride(showcaseCfgLocal);
            setShowColumns(false);
          }}
          onLocalReset={() => {
            // FIX500.2.3.2.1.3.4 — anonymous Reset drops the local
            // override and reverts to the DB config.
            if (localStorageKey) {
              try { localStorage.removeItem(localStorageKey); } catch { /* */ }
            }
            setLocalShowcaseOverride(null);
            setShowColumns(false);
          }}
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
          projectId={data?.project?.id ?? null}
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
          onDone={handleImportDone}
        />
      )}
      {/* FIX503.3.4 + FIX420 <panel-contact-admin>: anonymous
          contact form opened from <button-contact-admin>. The
          message is tagged with the current project so
          <panel-message-list> can filter by project (FIX421). */}
      {contactOpen && (() => {
        // FIX420.2.2 + FIX420.4.2.4: build the {id, label} list for the
        // currently-selected items in display order. Empty when nothing
        // is selected — the contact form just hides the section.
        const labelParts = viewSetup.item_short_label;
        const idsSet = new Set(selectedFolderIds);
        const itemsForContact = (displayedFolders || [])
          .filter((f) => idsSet.has(f.id))
          .map((f) => ({
            id: f.id,
            label: buildItemShortLabel(
              f, labelParts, properties, propertiesByLabel,
            ) || f.name || `Item ${f.id}`,
          }));
        return (
          <ContactPanel
            onClose={() => setContactOpen(false)}
            projectId={data.project?.id ?? null}
            selectedItems={itemsForContact}
            // FIX420.4.2.5: pre-fill the reply-addr with the signed-in
            // visitor's email when one is on file.
            defaultEmail={profile?.email || ''}
          />
        );
      })()}
      {/* FIX503.3.5 'About' popup: read-only display of the project
          introduction with a single Ok button. */}
      {aboutOpen && (
        <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
          <div
            className="modal sc-about-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>About</h2>
            <div
              className="sc-about-text"
              data-yagu-id="project-introduction"
            >
              {/* FIX352.3.4.4 */}
              <RichText text={data.project?.introduction} />
            </div>
            <div className="sc-about-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setAboutOpen(false)}
                autoFocus
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX520.3.2 + FIX523 <panel-showcase-img-viewer-fullscreen>:
          full-screen image overlay. FIX523.2: same layout as the
          in-page viewer with no sections panel — image fills the
          column, then a bottom strip carries the caption (centred)
          and the nav pill (bottom-right). FIX523.3.1 ESC + FIX521.3.2
          system back close the overlay (no in-overlay Back button —
          rely on the navigator). FIX521.3.4 swipe handlers wired on
          the image wrap. */}
      {fullScreen && currentImage && (
        <div
          className="sc-fullscreen"
          data-yagu-id="panel-showcase-img-viewer-fullscreen"
          onClick={() => setFullScreen(false)}
        >
          <div
            className="sc-fullscreen-img-wrap"
            onTouchStart={onImageTouchStart}
            onTouchEnd={onImageTouchEnd}
            onClick={(e) => {
              if (wasSwipeRef.current) {
                wasSwipeRef.current = false;
                e.stopPropagation();
              }
            }}
          >
            <ShowcaseImageCanvas
              url={currentImage.url}
              rotation={currentImage.rotation ?? 0}
              crop={currentImage.crop ?? null}
              className="sc-fullscreen-img"
            />
          </div>
          {/* FIX523.2: bottom strip mirrors the in-page no-sections
              layout via the shared .sc-viewer-bottom. Click here is
              swallowed so the backdrop dismiss only fires on a real
              outside tap. */}
          <div
            className={`sc-viewer-bottom${currentImage.caption ? ' has-caption' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {currentImage.caption && (
              <div
                className="sc-viewer-caption"
                data-yagu-id="label-img-caption"
              >
                {currentImage.caption}
              </div>
            )}
            {/* FIX521.3.3 / FIX520.3.2.2: prev / i-n / next pill,
                identical to the in-page nav. */}
            <div className="sc-viewer-nav">
              <button
                type="button"
                data-yagu-id="button-prev"
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
                data-yagu-id="button-next"
                onClick={() =>
                  setCurrentImageIdx((i) => Math.min(images.length - 1, i + 1))
                }
                disabled={currentImageIdx >= images.length - 1}
                aria-label="Next image"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
