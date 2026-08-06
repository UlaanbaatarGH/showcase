import { useEffect, useMemo, useState, useRef, useReducer } from 'react';
import AdminMenu from './AdminMenu.jsx';
import SetupPanel from './SetupPanel.jsx';
import ShowcaseViewSetupPanel from './ShowcaseViewSetupPanel.jsx';
import ShowcaseImageCanvas from './viewer/ShowcaseImageCanvas.jsx';
import ShowcaseImgListEditor from './viewer/ShowcaseImgListEditor.jsx';
import { publishItemImages, isLocalRow } from './viewer/publishItemImages.js';
import GsheetImportDialog from './gsheet/GsheetImportDialog.jsx';
import ImportImagesDialog from './images/ImportImagesDialog.jsx';
import GroupingPanel from './grouping/GroupingPanel.jsx';
import ContactPanel from './ContactPanel.jsx';
import {
  IconHome,
  IconAbout,
  IconContact,
  IconSignOut,
  IconCamera,
  RichText,
} from './Icons.jsx';
import { parseSegment, bucketsWithValues, bucketsFor, NO_VALUE_KEY } from './grouping/segments.js';
import { normalizeGroups } from './grouping/groups.js';
import { useAuth } from './AuthContext.jsx';
import {
  getShowcase, getFolderImages, trackVisit, setFolderZoomFactor,
  acquireEditLock, heartbeatEditLock, releaseEditLock, listProjects,
  createFolder, renameFolder, deleteFolder, isLocalModeActive, createLocalProject,
} from './data/backend.js';
import { navigate, projectSlug } from './router.js';
import { REFERENCE_VIEWPORT } from './zoom.js';
import { computePropertyValue, parseTrailingValues, valueSetEdge } from './properties/formulas.js';
import { buildItemShortLabel } from './properties/itemShortLabel.js';
import { isAcceptedImage } from './images/importImages.js';
import { getStagingRoot, getLegacyStagingRoot, migrateLegacyProjectFolder, stagingItemDir, syncStagingFolder, readManifestEntries, sanitizeSegment, createItemStagingFolder, renameItemFolder, clearRenameTag, resolveItemFolderDir, markItemFolderDeleted, clearDeletedTag, rmPath, listStagingItems, readStagedItemImages, imageAttrsFromManifest } from './viewer/itemStaging.js';

// FIX653 <cmd-capture-cam-img>: same local Agent server the (now-relocated)
// Photo Module and ShowcaseImgListEditor's FIX620 auto-insert already talk
// to — no shared module for this literal, matching the existing per-file
// redeclaration convention.
const AGENT_URL = 'http://localhost:3001';
const CAMERA_CAPTURE_LAST_FOLDER_KEY = 'sc-camera-capture-last-folder';

// FIX670 Changes & Publication: a captured photo used to live only as an
// in-memory URL.createObjectURL blob until Publish — gone on reload/crash/
// closing the app, even though its item Ref had already been created on the
// server, leaving a permanently empty orphan item. Copying the file into a
// stable staging root under the project itself (tech/data/staging, resolved
// by the Agent from its own __dirname — see /agent/status, keyed by project
// name per FIX670.1), independent of whichever folder is currently being
// watched, lets a project reload rebuild the staged rows from disk instead —
// see itemStaging.js (shared with ShowcaseImgListEditor.jsx and
// publishItemImages.js; this used to be FIX653's own capture-only copy of
// the same mechanism, now formalized and generalized by FIX670).

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
  // Mirror of selectedFolderId for the FIX653 reconciliation effect below —
  // its async fetch chain would otherwise close over whatever selectedFolderId
  // was at effect-start (often still null, since the auto-select-first-item
  // effect's own selectOnly() call hasn't landed in a render yet), and compare
  // against that stale value once the fetches finally resolve. Same pattern
  // as ShowcaseImgListEditor.jsx's selIdxsRef.
  const selectedFolderIdRef = useRef(null);
  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId;
  }, [selectedFolderId]);
  const selectOnly = (id) =>
    setSelectedFolderIds(id == null ? [] : [id]);
  const toggleSelected = (id) => {
    setSelectedFolderIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };
  // FIX510.2.1.11: Shift-click pivot — the last plain/Ctrl-clicked row.
  const itemSelectAnchorRef = useRef(null);
  const selectRange = (rows, fromId, toId) => {
    const lo = rows.findIndex((f) => f.id === fromId);
    const hi = rows.findIndex((f) => f.id === toId);
    if (lo === -1 || hi === -1) { selectOnly(toId); return; }
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
    setSelectedFolderIds(rows.slice(a, b + 1).map((f) => f.id));
  };
  // FIX515: Item Details panel — two tabs sharing the right column.
  // FIX515.4.1: tab persists when the selected item changes (state lives
  // here, not reset by selection). FIX515.4.2: 'Images' is the default.
  const [viewerTab, setViewerTab] = useState('images');
  // FIX515.2.2 / FIX515.3.2 <button-edit>: toggle edition mode for the
  // currently open tab. Reset when the user switches tabs or items so
  // unsaved edits don't silently follow the selection.
  const [editionMode, setEditionMode] = useState(false);
  // FIX654 <local-setup-menu>: local-app Setup menu On/Off options,
  // persisted as browser prefs (like sc-list-width below).
  const [stayInEdition, setStayInEdition] = useState(
    () => localStorage.getItem('sc-stay-in-edition') === '1',
  );
  const [hideSections, setHideSections] = useState(
    () => localStorage.getItem('sc-hide-sections') === '1',
  );
  const [setupMenuOpen, setSetupMenuOpen] = useState(false);
  const setupMenuRef = useRef(null);
  const toggleStayInEdition = () => {
    setStayInEdition((v) => {
      const next = !v;
      localStorage.setItem('sc-stay-in-edition', next ? '1' : '0');
      return next;
    });
  };
  const toggleHideSections = () => {
    setHideSections((v) => {
      const next = !v;
      localStorage.setItem('sc-hide-sections', next ? '1' : '0');
      return next;
    });
  };
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
  const isLocalApp = import.meta.env.DEV;

  // FIX610.4.5[ex-610.3.20]: per-project edit lock over <panel-showcase-img-list-editor>
  // (the Images tab in edition mode), coordinating the website and the
  // local app so only one side can have it open at a time. One session
  // token per browser tab; a heartbeat keeps the lease alive while the
  // editor is open, so a crashed/closed tab is treated as released once
  // heartbeats stop (server-side TTL) without needing an explicit release.
  const editLockSessionRef = useRef(
    (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  );
  const editLockHolder = isLocalApp ? 'local' : 'website';
  const editLockHeldRef = useRef(false);
  // FIX610.4.5.1[ex-610.3.20.1] and FIX610.4.5.2[ex-610.3.20.2]: a failed acquire (locked by the other side, or the
  // local app has unpublished changes) is a normal, expected outcome, not
  // an app-breaking error — show it as a dismissable popup and drop back
  // out of edition mode, instead of replacing the whole view (setError).
  const [editLockError, setEditLockError] = useState(null);
  useEffect(() => {
    const projectId = data?.project?.id;
    const editingImages = editionMode && viewerTab === 'images';
    if (!editingImages || projectId == null) return undefined;
    let cancelled = false;
    const token = editLockSessionRef.current;
    acquireEditLock(projectId, { holder: editLockHolder, session_token: token })
      .then(() => { if (!cancelled) editLockHeldRef.current = true; })
      .catch((e) => {
        if (cancelled) return;
        setEditLockError(e.message || 'This project is being edited elsewhere.');
        setEditionMode(false);
      });
    const heartbeat = setInterval(() => {
      heartbeatEditLock(projectId, { session_token: token }).catch(() => {});
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      if (editLockHeldRef.current) {
        releaseEditLock(projectId, { session_token: token }).catch(() => {});
        editLockHeldRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionMode, viewerTab, data?.project?.id]);
  // Best-effort release if the tab closes outright (no React unmount fires).
  useEffect(() => {
    const onUnload = () => {
      const projectId = data?.project?.id;
      if (!editLockHeldRef.current || projectId == null || !navigator.sendBeacon) return;
      try {
        navigator.sendBeacon(
          `/api/projects/${projectId}/edit-lock/release`,
          new Blob([JSON.stringify({ session_token: editLockSessionRef.current })], { type: 'application/json' }),
        );
      } catch { /* best effort */ }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [data?.project?.id]);

  // FIX652 [ex-FIX375]: staged (non-blank status) image changes need to survive
  // switching items within the local app so <cmd-publish-all-changes>/
  // <cmd-publish-selection> have something cross-item to act on —
  // session-only (browser memory), same as every other FIX610 staging; lost
  // on reload like the rest of it.
  // Keyed by folder id. Cleared when the project changes.
  const imagesByFolderRef = useRef({});
  useEffect(() => {
    imagesByFolderRef.current = {};
  }, [data?.project?.id]);
  // Mutating imagesByFolderRef alone doesn't trigger a re-render — the
  // reconciliation-on-load effect below updates it for every staged item on
  // disk, but only the *selected* one also gets a setImages call. Without
  // this, needsPublish's red styling for every other reconciled item stays
  // stale (rendered from before the ref was populated) until some unrelated
  // state change happens to re-render the list — e.g. clicking one of them.
  const [, bumpImagesByFolderTick] = useReducer((c) => c + 1, 0);

  // FIX670.1 / FIX670.10-FIX670.14: on opening a project, rebuild any
  // staged-but-unpublished local edits (add/remove/unremove/move) from the
  // staging root on disk — covers reopening the app after a reload, a
  // crash, or a multi-day gap, when the in-memory state from the edit
  // session is long gone but the item folder + its list.txt manifest are
  // still sitting there. FIX653's camera-capture flow is just one producer
  // of this same on-disk state, not a separate mechanism (generalized by
  // FIX670 to cover manual Add/Drop/Remove/Unremove/Move too).
  useEffect(() => {
    const pid = data?.project?.id;
    const projectName = data?.project?.name;
    const folders = data?.folders;
    if (!isLocalApp || pid == null || projectName == null || !folders) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const root = await getStagingRoot();
        // FIX670.1 migration: fold any leftover pre-FIX670 capture-staging
        // data for this project (real unpublished camera captures, keyed by
        // the old numeric-id scheme) into the new tree — the app is the one
        // place that already knows this project's id *and* name together,
        // so this is where the migration belongs, not a manual one-off.
        try {
          const legacyRoot = await getLegacyStagingRoot();
          await migrateLegacyProjectFolder({ projectId: pid, projectName, root, legacyRoot });
        } catch {
          // Best-effort — a failed migration just leaves the legacy folder
          // in place to retry next time this project is opened.
        }
        // Bug fix: this used to list the project's staging dir raw and match
        // folders.find((f) => f.name === entry.name) — entry.name is the
        // on-disk folder name, which carries a postfix ( (chged)/(deleted)/
        // (ex-{oldRef})) for anything but a brand-new item, so it never
        // equals a plain server ref and reconciliation silently no-opped for
        // every postfixed folder (a plain 'chged' item's staged image edits
        // vanished from the list on reload). listStagingItems already parses
        // the ref out of the folder name (used elsewhere in this same file)
        // — reuse it here instead of re-deriving from a raw dir listing.
        const staged = await listStagingItems(root, projectName);
        if (staged.length === 0) return; // nothing staged for this project
        let anyReconciled = false;
        for (const item of staged) {
          if (cancelled) return;
          // FIX670.10.8: a 'renamed' item's parsed ref is the new,
          // still-unpublished ref — data.folders keeps showing the old
          // (server) ref until Publish, so match on that instead.
          const folder = folders.find((f) => f.name === (item.flag === 'renamed' ? item.oldRef : item.ref));
          // FIX670: only skip if this item's cache already carries staged
          // state (already reconciled, or edited this session) — an empty
          // array is a legitimate cache entry the sibling per-item
          // images-fetch effect may have raced in first, and must not be
          // mistaken for "already reconciled".
          if (!folder) continue;
          const already = imagesByFolderRef.current[folder.id];
          if (already && already.some((im) => im.added || im.chged || im.moved || im.deleted || isLocalRow(im))) continue;
          const itemDir = item.dir;
          // FIX670.10: list.txt is the manifest of every public + local
          // image in display order — an item folder only exists on disk
          // while something is pending (FIX670.20), so an empty/missing
          // manifest here means nothing left to reconstruct.
          const manifest = await readManifestEntries(itemDir);
          if (manifest.length === 0 || cancelled) continue;
          const publicBaseline = await getFolderImages(folder.id).catch(() => null);
          if (publicBaseline == null || cancelled) continue;
          const byFilename = new Map(publicBaseline.map((im) => [im.filename, im]));
          const usedFilenames = new Set();
          // FIX670.1.2.2.2: `moved` is a pure comparison between the
          // manifest's immutable origPosition (frozen the moment this
          // folder was created, never recomputed) and this public image's
          // current rank among public images as walked in manifest order —
          // no live fetch of the true public order needed to detect it, so
          // this survives an offline restart.
          let publicRank = 0;
          const rows = [];
          for (const { filename, origPosition, chged, moved: wasMoved, deleted, attrs } of manifest) {
            if (cancelled) return;
            const pub = byFilename.get(filename);
            if (pub) {
              usedFilenames.add(filename);
              publicRank += 1;
              const sort_order = publicRank - 1;
              const origSortOrder = (origPosition ?? publicRank) - 1;
              const moved = sort_order !== origSortOrder;
              if (chged) {
                // FIX611.1: a public image locally re-saved (crop/rotate) —
                // serve the staged, already-baked bytes instead of the
                // stale public URL. rotation/crop reset to identity: the
                // transform is baked into these pixels already, pub's live
                // DB values (never touched by the local-app save) would
                // otherwise get re-applied on top by the viewer.
                const filePath = `${itemDir}/${filename}`;
                const imgRes = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(filePath)}`);
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  rows.push({
                    ...pub, sort_order, origSortOrder, added: false, chged: true, moved, deleted: !!deleted,
                    rotation: 0, crop: null,
                    // FIX670.1.2.2.4: the staged caption/section/is_main —
                    // pub's are the stale server values, unaffected by a
                    // local-only edit.
                    ...imageAttrsFromManifest(attrs),
                    url: URL.createObjectURL(blob), localFile: blob, stagedPath: filePath,
                  });
                  continue;
                }
                // Staged file missing — fall through to the plain-public
                // row below (best-effort, matches this loop's posture
                // elsewhere for a failed disk read).
              }
              rows.push({ ...pub, sort_order, origSortOrder, added: false, chged: false, moved, deleted: !!deleted });
              continue;
            }
            const filePath = `${itemDir}/${filename}`;
            const imgRes = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(filePath)}`);
            if (!imgRes.ok) continue;
            const blob = await imgRes.blob();
            rows.push({
              id: `local-${Date.now()}-${camLocalIdRef.current++}`,
              image_id: null,
              url: URL.createObjectURL(blob),
              filename,
              ...imageAttrsFromManifest(attrs), // FIX670.1.2.2.4
              sort_order: 0,
              rotation: 0,
              crop: null,
              added: true, chged: false, moved: false, deleted: false,
              localFile: blob,
              stagedPath: filePath,
            });
          }
          // Defensive fallback — FIX670.10 keeps list.txt comprehensive, so
          // this shouldn't normally fire: a public row the manifest didn't
          // mention is appended unmarked, preserving its baseline order.
          for (const pub of publicBaseline) {
            if (!usedFilenames.has(pub.filename)) rows.push({ ...pub, added: false, chged: false, moved: false, deleted: false });
          }
          if (rows.length === 0 || cancelled) continue;
          imagesByFolderRef.current[folder.id] = rows;
          anyReconciled = true;
          if (folder.id === selectedFolderIdRef.current) setImages(rows);
        }
        // Every OTHER reconciled item's red styling only lives in the ref
        // above until something re-renders — force it once, rather than
        // leaving it stuck black until the user happens to click one.
        if (anyReconciled && !cancelled) bumpImagesByFolderTick();
      } catch {
        // Agent unreachable — reconciliation just skips this time; the
        // staged files on disk aren't touched, so nothing is lost.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.project?.id, isLocalApp]);

  // FIX658.2.1.1 / FIX657.4 / FIX655.4: pendingRemoval/originalRef/pendingNew
  // are client-only annotations (or, for a new item, the whole local-item-*
  // entry itself) on top of a real, server-sourced folder list — none of it
  // ever persisted anywhere, so an item flagged (deleted)/(ex-...)/(new) via
  // <cmd-delete-item>/<cmd-change-item-ref>/<cmd-add-item> in an earlier
  // session looked completely normal again — or, for a new item, was simply
  // missing from the list — on the next load, even though its staging
  // folder was still tagged on disk. Restores all three (and the display
  // they drive, renderBodyCell below — same flags backendLocal.js's
  // buildLocalFolders derives for off-line mode, so an item looks identical
  // either way) from the matching <file-flag-...> the moment the project's
  // staged items are known, same disk-is-truth posture as FIX652.2.3's
  // readStagedItemImages (which also rebuilds a new item's own image list
  // here, for the same reason).
  //
  // Depends on data?.folders (not just the project id) so it self-heals any
  // time folders gets replaced wholesale after the flags were already
  // applied — e.g. StrictMode's dev-only double-invoke of the initial
  // getShowcase effect, or any later reloadShowcase() call — instead of
  // only ever running once per project load and losing the race. Idempotent
  // (skips the setData call once every folder already carries its flag, and
  // re-checks for an existing entry against the latest state right before
  // adding one), so this doesn't loop or double-add.
  useEffect(() => {
    const pid = data?.project?.id;
    const projectName = data?.project?.name;
    const folders = data?.folders;
    if (!isLocalApp || pid == null || projectName == null || !folders) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const root = await getStagingRoot();
        const staged = await listStagingItems(root, projectName);
        const removedRefs = new Set(staged.filter((i) => i.flag === 'deleted').map((i) => i.ref));
        const renamedRefs = new Map(
          staged.filter((i) => i.flag === 'renamed').map((i) => [i.ref, i.oldRef]),
        );
        const newItems = staged.filter((i) => i.flag === 'new');
        if (removedRefs.size === 0 && renamedRefs.size === 0 && newItems.length === 0) return;
        if (cancelled) return;

        const knownNames = new Set(folders.map((f) => f.name));
        const missingNew = newItems.filter((i) => !knownNames.has(i.ref));
        const newFolders = [];
        for (const item of missingNew) {
          const imgs = await readStagedItemImages(item.dir).catch(() => []);
          if (cancelled) return;
          const localId = `local-item-${item.ref}`;
          imagesByFolderRef.current[localId] = imgs;
          newFolders.push({
            id: localId, name: item.ref,
            is_main: false, sort_order: 0, zoom_factor: null, pendingNew: true,
          });
        }

        setData((prev) => {
          if (!prev) return prev;
          let changed = false;
          const nextFolders = prev.folders.map((f) => {
            if (typeof f.id === 'string') return f;
            if (removedRefs.has(f.name) && !f.pendingRemoval) {
              changed = true;
              return { ...f, pendingRemoval: true };
            }
            if (renamedRefs.has(f.name) && f.originalRef == null) {
              changed = true;
              return { ...f, originalRef: renamedRefs.get(f.name) };
            }
            return f;
          });
          if (newFolders.length > 0) {
            const alreadyKnown = new Set(nextFolders.map((f) => f.name));
            const toAdd = newFolders.filter((f) => !alreadyKnown.has(f.name));
            if (toAdd.length > 0) {
              changed = true;
              nextFolders.push(...toAdd);
            }
          }
          return changed ? { ...prev, folders: nextFolders } : prev;
        });
      } catch {
        // Agent unreachable — retried next time folders changes; the
        // staging folder's own tag is untouched, so nothing is lost.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.project?.id, isLocalApp, data?.folders]);

  // Wraps setImages so every update to the current folder's images is also
  // mirrored into the cross-item cache, without ShowcaseImgListEditor (or
  // anything else calling this) needing to know the cache exists.
  const setImagesForCurrentFolder = (updater) => {
    setImages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (selectedFolderId != null) imagesByFolderRef.current[selectedFolderId] = next;
      return next;
    });
  };

  // FIX652 [ex-FIX375] <cmd-publish-all-changes> / FIX660 <cmd-publish-selection>:
  // publish every item's staged changes project-wide (FIX652) or restricted
  // to the current selection's item refs (FIX660.3), local-app only.
  // FIX652.2: driven by the on-disk <folder-staged-item> flags, not just
  // imagesByFolderRef — a plain (unflagged) item still just publishes its
  // staged image changes (FIX652.2.4), but <file-flag-removed-item>/
  // <file-flag-chged-item-ref>/<file-flag-new-item> items now get their own
  // real action too (FIX652.2.1/.2/.3). null | 'recap' | 'running'.
  const [crossPublishStage, setCrossPublishStage] = useState(null);
  const [crossPublishPlan, setCrossPublishPlan] = useState(null);
  const [crossPublishProgress, setCrossPublishProgress] = useState(null);
  // `scopeRefs`: null publishes every staged item project-wide (FIX652);
  // a Set of item refs restricts the plan to those items only (FIX660.3).
  const handleOpenCrossPublish = async (scopeRefs = null) => {
    // FIX680: Publish needs the network (upload + DB write) that local mode
    // means we don't have, and FIX680.2 keeps local mode sticky for the
    // rest of the session — no point letting this run.
    if (isLocalModeActive()) return;
    const root = await getStagingRoot();
    const allStaged = await listStagingItems(root, data?.project?.name);
    const staged = scopeRefs ? allStaged.filter((item) => scopeRefs.has(item.ref)) : allStaged;
    const plan = [];
    const scopeIdxsOf = (imgs) => imgs.map((_, idx) => idx).filter((idx) => imgs[idx].added || imgs[idx].chged || imgs[idx].moved || imgs[idx].deleted);
    const countsOf = (imgs, scopeIdxs) => ({
      addCount: scopeIdxs.filter((i) => imgs[i].added).length,
      removeCount: scopeIdxs.filter((i) => imgs[i].deleted).length,
      moveCount: scopeIdxs.filter((i) => imgs[i].moved).length,
      changeCount: scopeIdxs.filter((i) => imgs[i].chged).length,
    });
    for (const item of staged) {
      if (item.flag === 'deleted') {
        // FIX670.20 <process-staged-items-publication>: matches a real item
        // FIX658 already flagged pendingRemoval.
        const folder = (data?.folders || []).find((f) => f.name === item.ref && f.pendingRemoval);
        if (!folder) continue;
        plan.push({ kind: 'deleted', ref: item.ref, dir: item.dir, folderId: folder.id });
        continue;
      }
      if (item.flag === 'new') {
        // FIX670.20: never given a real DB row yet — rebuilt straight from
        // disk (manifest + files), not imagesByFolderRef/data.folders, so
        // it publishes correctly even after a reload wiped this session's
        // in-memory state.
        const imgs = await readStagedItemImages(item.dir);
        const scopeIdxs = imgs.map((_, idx) => idx);
        plan.push({
          kind: 'new', ref: item.ref, dir: item.dir, images: imgs, scopeIdxs,
          addCount: scopeIdxs.length, removeCount: 0, moveCount: 0, changeCount: 0,
        });
        continue;
      }
      if (item.flag === 'renamed') {
        // FIX670.20: a real item mid-rename (FIX657) — data.folders already
        // carries the new ref optimistically.
        const folder = (data?.folders || []).find((f) => f.name === item.ref && typeof f.id !== 'string');
        if (!folder) continue;
        const imgs = imagesByFolderRef.current[folder.id] || [];
        const scopeIdxs = scopeIdxsOf(imgs);
        plan.push({
          kind: 'renamed', ref: item.ref, oldRef: item.oldRef, dir: item.dir, folderId: folder.id, scopeIdxs,
          ...countsOf(imgs, scopeIdxs),
        });
        continue;
      }
      // FIX670.20: 'chged' (or a bare legacy folder) — a real item with
      // plain staged image changes, no item-level flag.
      const folder = (data?.folders || []).find((f) => f.name === item.ref && typeof f.id !== 'string');
      if (!folder) continue;
      const imgs = imagesByFolderRef.current[folder.id] || [];
      const scopeIdxs = scopeIdxsOf(imgs);
      if (scopeIdxs.length === 0) continue; // nothing actually pending
      plan.push({ kind: 'plain', ref: item.ref, dir: item.dir, folderId: folder.id, scopeIdxs, ...countsOf(imgs, scopeIdxs) });
    }
    // Show the recap regardless — an empty plan just shows an all-zero line
    // with Confirm disabled, rather than a blocking error.
    setCrossPublishPlan(plan);
    setCrossPublishStage('recap');
  };
  // FIX660 <cmd-publish-selection>: same recap/confirm pipeline as
  // <cmd-publish-all-changes> (FIX660.3), scoped to the current selection's
  // item refs.
  const handleOpenPublishSelection = () => {
    const refs = new Set(
      (data?.folders || [])
        .filter((f) => selectedFolderIds.includes(f.id))
        .map((f) => f.name),
    );
    handleOpenCrossPublish(refs);
  };
  // Shared by the 'new'/'renamed'/'plain' branches below: publishes the
  // in-scope images for a (now-real) folder id, updates the in-memory
  // caches, and resyncs/removes the on-disk staging folder afterward
  // (FIX670.30) — the same cleanup every publish path already relies on.
  const publishAndSync = async (folderId, itemName, images, scopeIdxs, onProgress) => {
    const finalImages = await publishItemImages({
      projectId: data.project.id,
      itemName,
      folderId,
      images,
      scopeIdxs,
      onProgress,
    });
    imagesByFolderRef.current[folderId] = finalImages;
    if (folderId === selectedFolderId) setImages(finalImages);
    try {
      const root = await getStagingRoot();
      await syncStagingFolder({
        root,
        projectName: data.project?.name,
        itemName,
        images: finalImages,
        setImages: (updater) => {
          const prev = imagesByFolderRef.current[folderId] || [];
          const next = typeof updater === 'function' ? updater(prev) : updater;
          imagesByFolderRef.current[folderId] = next;
          if (folderId === selectedFolderId) setImages(next);
        },
      });
    } catch {
      // Best-effort — matches FIX670's posture everywhere else.
    }
    return finalImages;
  };
  const confirmCrossPublish = async () => {
    if (!crossPublishPlan?.length) return;
    setCrossPublishStage('running');
    // Every plan entry counts for at least 1 progress unit, even a pure
    // delete/rename with no image changes of its own.
    const totalUnits = crossPublishPlan.reduce((s, p) => s + Math.max(p.scopeIdxs?.length || 0, 1), 0);
    let doneUnits = 0;
    setCrossPublishProgress({ done: 0, total: totalUnits });
    setError(null);
    try {
      for (const p of crossPublishPlan) {
        if (p.kind === 'deleted') {
          // FIX670.20: delete on both the public site and locally.
          await deleteFolder(p.folderId);
          await rmPath(p.dir).catch(() => {});
          setData((prev) => (prev ? { ...prev, folders: prev.folders.filter((f) => f.id !== p.folderId) } : prev));
          delete imagesByFolderRef.current[p.folderId];
          setSelectedFolderIds((prev) => prev.filter((id) => id !== p.folderId));
          doneUnits += 1;
          setCrossPublishProgress({ done: doneUnits, total: totalUnits });
          continue;
        }
        if (p.kind === 'new') {
          // FIX670.20: add it on the website, then publish everything
          // staged for it (all-new, so the whole image list is in scope) —
          // p.images came straight from disk, not imagesByFolderRef.
          const { id: newFolderId } = await createFolder({ project_id: data.project.id, name: p.ref });
          await publishAndSync(
            newFolderId, p.ref, p.images, p.scopeIdxs,
            (d) => setCrossPublishProgress({ done: doneUnits + d, total: totalUnits }),
          );
          doneUnits += Math.max(p.scopeIdxs.length, 1);
          // A local-item-{ref} entry only exists in data.folders when this
          // session is the one that created it (createLocalItem) — after a
          // reload there is none, so add a fresh row instead of swapping one.
          const localId = `local-item-${p.ref}`;
          delete imagesByFolderRef.current[localId];
          setData((prev) => {
            if (!prev) return prev;
            const hasLocalEntry = prev.folders.some((f) => f.id === localId);
            const folders = hasLocalEntry
              // FIX655.4: clear pendingNew — it's published now, no longer '+'.
              ? prev.folders.map((f) => (f.id === localId ? { ...f, id: newFolderId, pendingNew: false } : f))
              : [...prev.folders, { id: newFolderId, name: p.ref, is_main: false, sort_order: 0, zoom_factor: null }];
            return { ...prev, folders };
          });
          setSelectedFolderIds((prev) => prev.map((id) => (id === localId ? newFolderId : id)));
          continue;
        }
        if (p.kind === 'renamed') {
          // FIX670.20: apply the ref swap on the public site, then publish
          // whatever image changes were also staged for it.
          await renameFolder(p.folderId, p.ref);
          if (p.scopeIdxs.length > 0) {
            await publishAndSync(
              p.folderId, p.ref, imagesByFolderRef.current[p.folderId] || [], p.scopeIdxs,
              (d) => setCrossPublishProgress({ done: doneUnits + d, total: totalUnits }),
            );
          } else {
            await rmPath(p.dir).catch(() => {});
          }
          // FIX657.4/.5: the rename is live now — clear the pending flag
          // (and its '!' display) so it doesn't linger on a published item.
          setData((prev) => (prev ? {
            ...prev,
            folders: prev.folders.map((f) => (f.id === p.folderId ? { ...f, originalRef: null } : f)),
          } : prev));
          doneUnits += Math.max(p.scopeIdxs.length, 1);
          setCrossPublishProgress({ done: doneUnits, total: totalUnits });
          continue;
        }
        // FIX670.20: 'chged'/plain — publish the staged image changes.
        await publishAndSync(
          p.folderId, p.ref, imagesByFolderRef.current[p.folderId], p.scopeIdxs,
          (d) => setCrossPublishProgress({ done: doneUnits + d, total: totalUnits }),
        );
        doneUnits += Math.max(p.scopeIdxs.length, 1);
      }
      setCrossPublishStage(null);
      setCrossPublishPlan(null);
    } catch (e) {
      setError(e.message || String(e));
      setCrossPublishStage(null);
    } finally {
      setCrossPublishProgress(null);
    }
  };

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
  // FIX656 'Other…' group: local-app-only Commands menu items that aren't in
  // the always-visible top-level set (Add item/Delete item/Publish all) live
  // in a nested flyout submenu, toggled by this. Reset false on every
  // open/close of the parent menu so it never persists open to the next
  // time the whole menu opens.
  const [otherCommandsOpen, setOtherCommandsOpen] = useState(false);
  // FIX650.1.2.1 / FIX651 <menu-projects>: local-app-only project switcher,
  // replaces the website's <button-home> + project list.
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  // FIX653.2 <cmd-create-new-project>: name-only prompt, same shape as
  // HomeView.jsx's own create-local-project popup (FIX680.1.2) but reachable
  // from inside an already-open project too, not just the cold-start
  // HomeView case.
  const [createProjectPopup, setCreateProjectPopup] = useState(null); // null | { name, error, busy }
  // FIX653 / FIX620.4.2.2 <cmd-capture-cam-img>: "Create item mode" — unlike
  // FIX620's per-item "Update item mode" (ShowcaseImgListEditor.jsx, edits an
  // already-open item), a captured photo here has no item to attach to yet,
  // so each one immediately becomes a brand-new item (next Ref, blank
  // properties) via the same auto-create-on-unknown-item-name behavior
  // /api/images/confirm already has for FIX371's hard-disk import — no
  // staging, no manual Publish step.
  const [cameraCaptureActive, setCameraCaptureActive] = useState(false);
  const [cameraCapturePopup, setCameraCapturePopup] = useState(null); // null | {folder, error, checking}
  const [cameraCaptureDir, setCameraCaptureDir] = useState('');
  const camSeenNamesRef = useRef(null);
  const camPollingRef = useRef(false);
  const nextRefRef = useRef(1);
  // FIX620.4.2.2 bugfix: which project nextRefRef was last correctly seeded
  // for. See handleStartCameraCapture — without this, stopping and quickly
  // restarting Camera capture reseeds the counter from `data?.folders`,
  // which reloadShowcase() (fire-and-forget after every capture) may not
  // have refreshed yet, handing out an already-used Ref and creating a
  // duplicate item once published.
  const nextRefSeededProjectRef = useRef(null);
  const camLocalIdRef = useRef(0);
  // FIX680.1.2 <add-local-item>: local-mode-only "Add a new item" — the
  // first addition this session prompts for a ref (offlineAddItemPopup),
  // every later one just increments offlineNextRefRef. Purely client-side:
  // no createFolder call, no disk write until the item's first image is
  // added (which already flows through FIX670's syncStagingFolder).
  const offlineNextRefRef = useRef(null);
  const [offlineAddItemPopup, setOfflineAddItemPopup] = useState(null); // null | { value, error }
  // FIX657 <cmd-change-item-ref>
  const [changeItemRefPopup, setChangeItemRefPopup] = useState(null); // null | { value, error }
  // FIX658 <cmd-delete-item>: no per-item input, just a Confirm/Cancel gate —
  // true/false is enough state.
  const [deleteItemPopup, setDeleteItemPopup] = useState(false);
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
  // FIX523.3.5: zoom slider for the full-screen viewer — independent of
  // the in-page one (separate panel, own state), same fit/scroll/pan
  // mechanics.
  const [fsZoomLevel, setFsZoomLevel] = useState(1);
  const [fsIsPanning, setFsIsPanning] = useState(false);
  const menuRef = useRef(null);
  const projectsMenuRef = useRef(null);
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
  // FIX523.3.5: same drag-to-pan mechanics, independent full-screen copy.
  const fsViewerScrollRef = useRef(null);
  const fsPanStateRef = useRef(null);
  const fsDraggedRef = useRef(false);
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
  // FIX520.3.3 (enhancement, not in the literal spec text — requested
  // directly in session): mouse wheel also drives the zoom slider.
  const onZoomWheel = (e) => {
    e.preventDefault();
    setZoomLevel((z) => Math.min(3, Math.max(1, Math.round((z - e.deltaY * 0.001) * 10) / 10)));
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

  // FIX523.3.5: zoom slider — independent full-screen copy of the
  // FIX520.3.3 drag-to-pan mechanics. fsDraggedRef also suppresses the
  // backdrop's click-to-close so a pan gesture doesn't exit fullscreen.
  const onFsZoomPointerDown = (e) => {
    if (fsZoomLevel <= 1) return;
    const wrap = fsViewerScrollRef.current;
    if (!wrap) return;
    e.preventDefault();
    fsDraggedRef.current = false;
    fsPanStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
    };
    setFsIsPanning(true);
  };
  // FIX523.3.5 (enhancement, not in the literal spec text — requested
  // directly in session): mouse wheel also drives the zoom slider.
  const onFsZoomWheel = (e) => {
    e.preventDefault();
    setFsZoomLevel((z) => Math.min(3, Math.max(1, Math.round((z - e.deltaY * 0.001) * 10) / 10)));
  };
  useEffect(() => {
    if (!fsIsPanning) return undefined;
    const move = (e) => {
      const wrap = fsViewerScrollRef.current;
      const p = fsPanStateRef.current;
      if (!wrap || !p) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fsDraggedRef.current = true;
      wrap.scrollLeft = p.scrollLeft - dx;
      wrap.scrollTop = p.scrollTop - dy;
    };
    const up = () => {
      setFsIsPanning(false);
      fsPanStateRef.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [fsIsPanning]);

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
    if (!projectsMenuOpen) return;
    const onDown = (e) => {
      if (projectsMenuRef.current && !projectsMenuRef.current.contains(e.target)) {
        setProjectsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [projectsMenuOpen]);

  // FIX653.2 <cmd-create-new-project>: mirrors HomeView.jsx's
  // confirmCreateLocal — creates the staging folder only (no DB row), then
  // navigates to it exactly like picking any other project from this same
  // menu.
  const confirmCreateProject = async () => {
    const name = (createProjectPopup?.name || '').trim();
    if (!name) {
      setCreateProjectPopup((p) => ({ ...p, error: 'Enter a name' }));
      return;
    }
    setCreateProjectPopup((p) => ({ ...p, busy: true, error: null }));
    try {
      const p = await createLocalProject(name);
      setCreateProjectPopup(null);
      setProjectsMenuOpen(false);
      navigate(`/${p.official_slug || projectSlug(p.name)}`);
    } catch (e) {
      setCreateProjectPopup((p) => ({ ...p, busy: false, error: e.message || String(e) }));
    }
  };

  // FIX654 <local-setup-menu>: outside-click close, same pattern as
  // <menu-projects>/<menu-import> above.
  useEffect(() => {
    if (!setupMenuOpen) return;
    const onDown = (e) => {
      if (setupMenuRef.current && !setupMenuRef.current.contains(e.target)) setSetupMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [setupMenuOpen]);

  // FIX651: local app lists every project, unfiltered — there's no
  // sign-in/visibility gate to apply once login is dropped.
  useEffect(() => {
    if (!isLocalApp) return;
    listProjects().then(setAllProjects).catch(() => setAllProjects([]));
  }, []);

  // FIX655.2 / FIX670.10.1: create the item's staging folder right away,
  // marked ' (new)', together with its (empty) manifest — per FIX655.2's
  // own wording, the <file-staged-item-img-list> is part of what
  // <cmd-add-item> creates, not something that only shows up once an
  // image is staged.
  const ensureStagingFolder = async (itemName) => {
    try {
      const root = await getStagingRoot();
      await createItemStagingFolder(root, data?.project?.name, itemName);
    } catch {
      // Best-effort.
    }
  };
  // FIX655.3: pushes a brand-new client-side-only item ({ id:
  // `local-item-{ref}` }, mirroring images' own `local-` id convention)
  // into data.folders and selects it. A just-added item earns its real DB
  // id only at Publish (FIX652.2.3) — never at add time, on-line or off —
  // so both handleAddItemClick branches below go through this.
  const createLocalItem = (itemName) => {
    const newFolder = {
      id: `local-item-${itemName}`, name: itemName,
      is_main: false, sort_order: 0, zoom_factor: null,
      // FIX655.4: drives the '+' display — explicit rather than inferred
      // from the id being a string, since in off-line mode *every* folder
      // (new, removed, or plain) has a synthetic string id (see
      // backendLocal.js's buildLocalFolders); the flag is what actually
      // means "genuinely new" in both modes alike.
      pendingNew: true,
    };
    // FIX655.3: seed the image cache with an (empty) row now — no DB row
    // exists for this id yet (FIX652.2.3), so leaving it uncached would let
    // the selection effect below fall through to getFolderImages(id), which
    // needs a real numeric folder id and 422s on a local-item-* string.
    imagesByFolderRef.current[newFolder.id] = [];
    setData((prev) => (prev ? { ...prev, folders: [...(prev.folders || []), newFolder] } : prev));
    selectOnly(newFolder.id);
    ensureStagingFolder(itemName);
  };
  // FIX655 <cmd-add-item> / FIX655.1: on-line assigns the next ref (existing
  // upper number + 1, same computation handleStartCameraCapture already
  // uses) straight away, since live data.folders is already at hand. Off-line
  // has no "last ref" from the website, so the first click this session
  // prompts for one instead (offlineNextRefRef/offlineAddItemPopup below),
  // and later clicks +1 from there.
  const handleAddItemClick = () => {
    if (!isLocalApp) return;
    if (isLocalModeActive()) {
      if (offlineNextRefRef.current == null) {
        setOfflineAddItemPopup({ value: '', error: null }); // FIX655.1: first addition prompts for a ref
        return;
      }
      const itemName = String(offlineNextRefRef.current).padStart(3, '0'); // FIX655.1: later ones auto +1
      offlineNextRefRef.current += 1;
      createLocalItem(itemName);
      return;
    }
    const existingRefs = (data?.folders || [])
      .map((f) => Number(f.name))
      .filter((n) => Number.isFinite(n));
    const itemName = String((existingRefs.length ? Math.max(...existingRefs) : 0) + 1).padStart(3, '0');
    createLocalItem(itemName);
  };
  const confirmAddLocalItemRef = () => {
    const raw = (offlineAddItemPopup?.value || '').trim();
    if (!/^\d+$/.test(raw)) {
      setOfflineAddItemPopup((p) => ({ ...p, error: 'Enter a numeric ref' }));
      return;
    }
    const n = Number(raw);
    const itemName = String(n).padStart(3, '0');
    if ((data?.folders || []).some((f) => f.name === itemName)) {
      setOfflineAddItemPopup((p) => ({ ...p, error: `Ref ${itemName} is already in use` }));
      return;
    }
    offlineNextRefRef.current = n + 1;
    setOfflineAddItemPopup(null);
    createLocalItem(itemName);
  };

  // FIX657 <cmd-change-item-ref>: first selected item gets the input ref, next
  // ones +1 (FIX657.3.1). Renames both local-only and real DB items — a
  // real item's id stays the same (only its displayed name changes); the
  // DB row itself is updated later, at Publish (FIX652.2.2), once the
  // on-disk <file-flag-chged-item-ref> tag confirms the rename stuck.
  const confirmChangeItemRef = async () => {
    const raw = (changeItemRefPopup?.value || '').trim();
    if (!/^\d+$/.test(raw)) {
      setChangeItemRefPopup((p) => ({ ...p, error: 'Enter a numeric ref' }));
      return;
    }
    const start = Number(raw);
    const ids = selectedFolderIds;
    const renames = ids.map((id, i) => {
      const folder = (data?.folders || []).find((f) => f.id === id);
      return {
        id,
        oldName: folder?.name,
        // FIX657.5: the ref this item had before *any* rename this
        // session — set once on the first rename, carried through further
        // ones (mirrors <file-flag-chged-item-ref>'s own ' (ex-...)' tag,
        // which likewise never overwrites itself on a second rename).
        originalRef: folder?.originalRef ?? folder?.name,
        newName: String(start + i).padStart(3, '0'),
      };
    });
    const untouchedNames = new Set((data?.folders || []).filter((f) => !ids.includes(f.id)).map((f) => f.name));
    const collision = renames.find((r) => untouchedNames.has(r.newName));
    if (collision) {
      setChangeItemRefPopup((p) => ({ ...p, error: `Ref ${collision.newName} is already in use` }));
      return;
    }
    setChangeItemRefPopup(null);
    const root = await getStagingRoot();
    for (const r of renames) {
      if (typeof r.id !== 'string') {
        // Real DB item: id is stable, only the displayed ref changes now.
        // FIX657.5: renaming back to the original ref clears the pending
        // rename entirely instead of re-tagging it with itself.
        const reverted = r.newName === r.originalRef;
        if (reverted) {
          await clearRenameTag(root, data?.project?.name, r.oldName).catch(() => {});
        } else {
          await renameItemFolder(root, data?.project?.name, r.oldName, r.newName).catch(() => {});
        }
        setData((prev) => (prev ? {
          ...prev,
          folders: prev.folders.map((f) => (f.id === r.id
            ? { ...f, name: r.newName, originalRef: reverted ? null : r.originalRef }
            : f)),
        } : prev));
        continue;
      }
      await renameItemFolder(root, data?.project?.name, r.oldName, r.newName).catch(() => {});
      const newId = `local-item-${r.newName}`;
      setData((prev) => (prev ? {
        ...prev,
        folders: prev.folders.map((f) => (f.id === r.id ? { ...f, id: newId, name: r.newName } : f)),
      } : prev));
      if (imagesByFolderRef.current[r.id]) {
        imagesByFolderRef.current[newId] = imagesByFolderRef.current[r.id];
        delete imagesByFolderRef.current[r.id];
      }
      setSelectedFolderIds((prev) => prev.map((x) => (x === r.id ? newId : x)));
    }
  };

  // FIX670.10.9 <cmd-delete-item>: local items (string 'local-item-*' ids)
  // are deleted outright — no DB row exists, so both the list entry and its
  // staging folder are dropped now. Public (real DB) items have no
  // delete-folder API, so they're left in the list flagged pendingRemoval
  // for the crossed-out/non-published display and their staging folder is
  // tagged ' (deleted)' for Publish to pick up.
  const confirmDeleteItems = async () => {
    setDeleteItemPopup(false);
    const ids = selectedFolderIds;
    const root = await getStagingRoot();
    const removedIds = [];
    for (const id of ids) {
      const folder = (data?.folders || []).find((f) => f.id === id);
      if (!folder) continue;
      if (typeof id === 'string') {
        const dir = await resolveItemFolderDir(root, data?.project?.name, folder.name).catch(() => null);
        if (dir) await rmPath(dir).catch(() => {});
        removedIds.push(id);
        delete imagesByFolderRef.current[id];
      } else {
        await markItemFolderDeleted(root, data?.project?.name, folder.name).catch(() => {});
      }
    }
    setData((prev) => (prev ? {
      ...prev,
      folders: prev.folders
        .filter((f) => !removedIds.includes(f.id))
        .map((f) => (ids.includes(f.id) ? { ...f, pendingRemoval: true } : f)),
    } : prev));
    setSelectedFolderIds((prev) => prev.filter((id) => !removedIds.includes(id)));
  };

  // FIX661 <cmd-undelete-item> / FIX670.10.10: unmarks the selected items
  // currently staged to-be-deleted, in place — no confirmation popup (FIX661
  // defines none, same posture as FIX659 Reset item). Per the FIX670.10.10
  // Google-sheet rule: only a real DB item flagged pendingRemoval has
  // anything to undelete — a Local item can't reach that state (Delete
  // removes it outright, FIX670.10.9.1) and a plain Public item was never
  // deleted to begin with.
  // FIX658.2 (the requirements file's own numbering for this Undelete-item
  // block's Enabling entry, colliding with Delete item's unrelated FIX658.2
  // above — see the button's disabled condition below, which is this
  // requirement): "Visible only in the local app. Enabled only when the
  // items selection has at least 1 item at status to-be-deleted."
  const handleUndeleteItems = async () => {
    const root = await getStagingRoot();
    const ids = selectedFolderIds.filter((id) => {
      const folder = (data?.folders || []).find((f) => f.id === id);
      return folder?.pendingRemoval;
    });
    if (ids.length === 0) return;
    for (const id of ids) {
      const folder = (data?.folders || []).find((f) => f.id === id);
      await clearDeletedTag(root, data?.project?.name, folder.name).catch(() => {});
    }
    setData((prev) => (prev ? {
      ...prev,
      folders: prev.folders.map((f) => (ids.includes(f.id) ? { ...f, pendingRemoval: false } : f)),
    } : prev));
  };

  // FIX659.2 / FIX660.2: an item counts as "staged" for enabling purposes
  // the same way needsPublish's red styling does (render function below),
  // minus the isLocalApp gate since these checks only ever run inside the
  // local app already.
  const isItemStaged = (folder) => !!folder && (
    folder.pendingRemoval
    || folder.pendingNew
    || folder.originalRef != null
    || isLocalModeActive()
    || (imagesByFolderRef.current[folder.id] || []).some((im) => im.added || im.chged || im.moved || im.deleted)
  );

  // FIX659.2 (updated): Reset item's own enabling scope — a real (non-local)
  // item that's currently staged. Narrower than isItemStaged alone, which
  // also counts a pendingNew Local item — Reset has no defined effect on
  // one of those (FIX670.10.11.1: N/A), so it shouldn't make the command
  // enabled either.
  const isUnpublishedPublicItem = (folder) => !!folder && typeof folder.id !== 'string' && isItemStaged(folder);

  // FIX659 <cmd-reset-item> / FIX670.10.11: cancels every locally staged
  // change for the selected items, in place — FIX659 defines no recap step
  // (unlike Delete/Publish), so this applies immediately on click.
  // FIX670.10.11.1: a Local item (string 'local-item-*' id, no public
  // baseline) has no defined Reset effect per the Google-sheet test-matrix
  // rule (FIX670.10 <process-item-staging-management>) — left untouched.
  // FIX670.10.11.2: an Unpublished public item is set back to its published
  // state — staged folder deleted, ref/pendingRemoval cleared, and every
  // image row reset to the live public baseline (re-fetched fresh, since no
  // local edit is ever actually PATCHed to the server before Publish).
  const handleResetItems = async () => {
    const root = await getStagingRoot();
    for (const id of selectedFolderIds) {
      if (typeof id === 'string') continue; // FIX670.10.11.1: Local item — N/A
      const folder = (data?.folders || []).find((f) => f.id === id);
      if (!folder || !isItemStaged(folder)) continue;
      const dir = await resolveItemFolderDir(root, data?.project?.name, folder.name).catch(() => null);
      if (dir) await rmPath(dir).catch(() => {});
      const fresh = await getFolderImages(folder.id).catch(() => null);
      if (fresh) {
        const blanked = fresh.map((im) => ({ ...im, added: false, chged: false, moved: false, deleted: false }));
        imagesByFolderRef.current[folder.id] = blanked;
        if (folder.id === selectedFolderId) setImages(blanked);
      }
      const originalRef = folder.originalRef ?? folder.name;
      setData((prev) => (prev ? {
        ...prev,
        folders: prev.folders.map((f) => (f.id === folder.id
          ? { ...f, name: originalRef, originalRef: null, pendingRemoval: false }
          : f)),
      } : prev));
    }
  };

  // FIX653 <cmd-capture-cam-img>: same shape as FIX620's per-item toggle
  // (ShowcaseImgListEditor.jsx handleToggleAutoInsert/handleStartListening) —
  // push while off opens the folder popup, push while on stops immediately.
  const handleToggleCameraCapture = () => {
    if (cameraCaptureActive) {
      setCameraCaptureActive(false); // FIX653.2 off
      return;
    }
    const lastFolder = localStorage.getItem(CAMERA_CAPTURE_LAST_FOLDER_KEY) || '';
    setCameraCapturePopup({ folder: lastFolder, error: null, checking: false });
  };
  const handleStartCameraCapture = async () => {
    const folder = (cameraCapturePopup?.folder || '').trim();
    if (!folder) {
      setCameraCapturePopup((p) => ({ ...p, error: 'Enter a folder path' }));
      return;
    }
    setCameraCapturePopup((p) => ({ ...p, checking: true, error: null }));
    try {
      const res = await fetch(`${AGENT_URL}/agent/dir/list?path=${encodeURIComponent(folder)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCameraCapturePopup((p) => ({ ...p, checking: false, error: body.error || 'Folder not found or not accessible' }));
        return;
      }
      localStorage.setItem(CAMERA_CAPTURE_LAST_FOLDER_KEY, folder);
      camSeenNamesRef.current = null; // seeded on the first poll tick below
      // FIX620.4.2.2: seed the next-Ref counter from the current items —
      // kept in-memory (not re-derived from `data` per file) so a burst of
      // several photos in one tick gets distinct sequential Refs even
      // though `data.folders` won't have refreshed mid-loop.
      const capProjectId = data?.project?.id ?? null;
      const existingRefs = (data?.folders || [])
        .map((f) => Number(f.name))
        .filter((n) => Number.isFinite(n));
      const computedNext = (existingRefs.length ? Math.max(...existingRefs) : 0) + 1;
      if (nextRefSeededProjectRef.current !== capProjectId) {
        // First capture in this project (or after switching projects) —
        // data?.folders is the only source of truth available, use it as-is.
        nextRefRef.current = computedNext;
        nextRefSeededProjectRef.current = capProjectId;
      } else {
        // Restarting within the same project: data?.folders may still be
        // missing an item created moments ago by a previous capture tick —
        // never seed backwards, or the next photo reuses that Ref and
        // creates a duplicate item.
        nextRefRef.current = Math.max(nextRefRef.current, computedNext);
      }
      setCameraCaptureDir(folder);
      setCameraCapturePopup(null);
      setCameraCaptureActive(true);
    } catch {
      setCameraCapturePopup((p) => ({ ...p, checking: false, error: 'Folder not found or not accessible' }));
    }
  };
  // FIX620.4 / FIX620.4.2.2: sync process for "Create item mode" — poll the
  // watched folder, and for each newly arrived supported-extension file,
  // allocate the next 3-digit Ref, create the (blank-property) item, and
  // stage the image locally with status 'Added' — same staged-until-Publish
  // posture as every other FIX610 affordance (FIX610.3.1's manual Add,
  // FIX620's per-item Update mode). Nothing is uploaded to R2 until the
  // user actually Publishes (per-item or cross-item, FIX652).
  useEffect(() => {
    // NOTE: `data?.project?.id` used directly rather than the `projectId`
    // const below (line ~854) — that binding isn't declared yet at this
    // point in the component body.
    const capProjectId = data?.project?.id ?? null;
    const capProjectName = data?.project?.name ?? '';
    if (!cameraCaptureActive || !cameraCaptureDir || !capProjectId) return undefined;
    const poll = async () => {
      if (camPollingRef.current) return;
      camPollingRef.current = true;
      try {
        const res = await fetch(`${AGENT_URL}/agent/dir/list?path=${encodeURIComponent(cameraCaptureDir)}`);
        if (!res.ok) return;
        const { entries } = await res.json();
        const names = (entries || [])
          .filter((e) => e.type === 'file' && isAcceptedImage(e.name))
          .map((e) => e.name)
          .sort();
        // First tick after Start: everything already there is the
        // baseline, not a "new" arrival — only names seen from here on count.
        if (camSeenNamesRef.current === null) {
          camSeenNamesRef.current = new Set(names);
          return;
        }
        const fresh = names.filter((n) => !camSeenNamesRef.current.has(n));
        if (fresh.length === 0) return;
        for (const name of fresh) {
          camSeenNamesRef.current.add(name); // mark seen before the await below
          const imgRes = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(`${cameraCaptureDir}/${name}`)}`);
          if (!imgRes.ok) continue;
          const blob = await imgRes.blob();
          const itemName = String(nextRefRef.current).padStart(3, '0');
          nextRefRef.current += 1;
          try {
            // FIX620.4.2.2: bare item creation (blank properties) — no
            // image involved yet, unlike /api/images/confirm's auto-create.
            const { id: newFolderId } = await createFolder({ project_id: capProjectId, name: itemName });
            // FIX670.1 / FIX670.10: copy the source file into the stable
            // staging root so it survives a reload/crash/multi-day gap
            // before Publish — best-effort; if it fails, behavior falls back
            // to the old memory-only staging (still works this session).
            let root = null;
            let stagedPath = null;
            try {
              root = await getStagingRoot();
              const dir = stagingItemDir(root, capProjectName, itemName, ' (new)');
              await fetch(`${AGENT_URL}/agent/dir/mkdir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dir }),
              });
              stagedPath = `${dir}/${name}`;
              await fetch(`${AGENT_URL}/agent/dir/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ src: `${cameraCaptureDir}/${name}`, dst: stagedPath }),
              });
            } catch {
              stagedPath = null;
            }
            // Same staged-row shape as ShowcaseImgListEditor.jsx's
            // makeLocalRow — publishItemImages() (called at actual Publish
            // time, not here) knows how to upload/confirm rows in this shape
            // and compute zoom_factor itself.
            const localRow = {
              id: `local-${Date.now()}-${camLocalIdRef.current++}`,
              image_id: null,
              url: URL.createObjectURL(blob),
              filename: name,
              caption: '',
              section: '',
              is_main: false,
              sort_order: 0,
              rotation: 0,
              crop: null,
              added: true, chged: false, moved: false, deleted: false,
              localFile: blob,
              stagedPath, // FIX670.30: durable copy on disk, cleaned up at Publish
            };
            imagesByFolderRef.current[newFolderId] = [localRow];
            // FIX670.10: mirror the new item into list.txt — stagedPath is
            // already set above when the copy succeeded, so syncStagingFolder
            // only writes the manifest here, it doesn't re-copy the file.
            if (stagedPath && root) {
              syncStagingFolder({
                root,
                projectName: capProjectName,
                itemName,
                images: [localRow],
                setImages: (updater) => {
                  const prev = imagesByFolderRef.current[newFolderId] || [];
                  const next = typeof updater === 'function' ? updater(prev) : updater;
                  imagesByFolderRef.current[newFolderId] = next;
                  if (newFolderId === selectedFolderIdRef.current) setImages(next);
                },
              }).catch(() => {});
            }
          } catch {
            // Agent/backend unreachable for this file — next tick won't
            // retry it (already marked seen), matching FIX620's existing
            // "unreachable this tick" tolerance for the Update-mode poller.
          }
        }
        reloadShowcase();
      } catch {
        // Agent unreachable this tick — try again next tick.
      } finally {
        camPollingRef.current = false;
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCaptureActive, cameraCaptureDir, data?.project?.id]);

  useEffect(() => {
    if (selectedFolderId == null) {
      // No item selected (e.g. a project with no items yet, right after
      // switching projects) — show a blank list instead of leaving the
      // previous project's images on screen.
      setImages([]);
      setCurrentImageIdx(0);
      return;
    }
    // Exit edition when moving to another item — unless FIX654.1
    // <cmd-stay-in-edition> is On and the Images tab is the one being edited.
    if (!(stayInEdition && viewerTab === 'images')) {
      setEditionMode(false);
    }
    setDetailDraft({});
    // FIX652 [ex-FIX375]: reuse this item's cached (possibly still-staged) images if
    // we've already visited it this session, instead of refetching and
    // silently discarding any pending local-app edits.
    const cached = imagesByFolderRef.current[selectedFolderId];
    if (cached) {
      setImages(cached);
      const mainIdx = cached.findIndex((i) => i.is_main);
      setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      return;
    }
    setImages([]);
    // FIX655.3: a pendingNew item (local-item-* id, no DB row — FIX652.2.3)
    // has nothing to fetch. Should already be cached (createLocalItem seeds
    // it empty), but guard here too rather than let getFolderImages 422 on
    // a non-numeric id. Checked via the flag, not id shape: FIX680.1.1 gives
    // *every* item a synthetic string id in full off-line mode, not just
    // brand-new ones (same ambiguity the FIX655.4 '+' suffix already solves
    // this same way) — an existing item's string id still has real
    // <file-staged-item-img-list> images to fetch (FIX680.1.1.2), so only
    // pendingNew should short-circuit here.
    const folder = (data?.folders || []).find((f) => f.id === selectedFolderId);
    if (folder?.pendingNew) return;
    getFolderImages(selectedFolderId)
      .then((imgs) => {
        // FIX610.3.4: baseline sort_order snapshot, so the local app can tell
        // whether a row has actually moved from its last-published position.
        const withBaseline = imgs.map((im) => ({ ...im, origSortOrder: im.sort_order }));
        // FIX653: this fetch races the durable-capture reconciliation effect
        // (both target the same just-selected folder right after a project
        // loads) — read the cache fresh here, at resolution time, rather than
        // blindly overwriting it, so whichever of the two finishes second
        // doesn't erase what the other already staged.
        const stagedLocal = (imagesByFolderRef.current[selectedFolderId] || []).filter(isLocalRow);
        const merged = [...withBaseline, ...stagedLocal];
        imagesByFolderRef.current[selectedFolderId] = merged;
        setImages(merged);
        // FIX510.3.4: on item selection, show the Main image first;
        // when no image is flagged main, show the first image of the
        // list. The Main flag is set per row in the Image List editor
        // (FIX521.2.1.1.5 / <item-main-img>, FIX521.5.6).
        const mainIdx = merged.findIndex((i) => i.is_main);
        setCurrentImageIdx(mainIdx >= 0 ? mainIdx : 0);
      })
      .catch((e) => setError(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  // FIX520.3.3: zoom is per-image — reset to fit whenever the displayed
  // image changes (folder switch or prev/next navigation).
  useEffect(() => {
    setZoomLevel(1);
  }, [currentImageIdx, selectedFolderId]);

  // FIX523.3.5: same per-image reset, independent full-screen zoom —
  // also resets when the overlay is (re)opened.
  useEffect(() => {
    setFsZoomLevel(1);
  }, [currentImageIdx, selectedFolderId, fullScreen]);

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
  const deletedPropertyId = viewSetup.item_filters?.deleted_property_id ?? null;
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
  const datePropertyId = viewSetup.item_filters?.date_property_id ?? null;
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
    // FIX631.2: the local app's list panel is always Ref-ordered — it
    // ignores any user column-sort / row_order config so a Ref change or
    // a newly-added item always reflows to its increasing-Ref position
    // (this useMemo re-runs whenever liveFolders' names change).
    if (isLocalApp) {
      rows = [...rows].sort((a, b) => compareValues(a.name ?? '', b.name ?? ''));
    } else if (sortKeys.length > 0 || orderedCols.length > 0) {
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
  // listed item" matches what the user actually sees. Skipped on the
  // website when the option is off — the selection then stays empty, or
  // wherever the user has explicitly clicked.
  // The local app has no such option to turn off — opening another
  // project must always land on its first Ref so the image list follows
  // the switch, instead of staying on whatever was selected (or blank)
  // in the previous project.
  useEffect(() => {
    if (!isLocalApp && !data?.view_setup?.select_first_item) return;
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
    if (isLocalApp) return; // FIX631.2: local app list is always Ref-ordered, not user-sortable
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
      // FIX630.1: local-app only — an item with any pending (non-blank-
      // status) image, Added, Removed, Moved or Changed (not just Added),
      // requires a Publish, flagged right in the list, no need to open it.
      // Red text rather than a suffix: the Ref column is too narrow for
      // extra words. Gated on isLocalApp per FIX630's own scoping, though
      // imagesByFolderRef is only ever populated with staged rows locally
      // anyway (online edits save immediately, no staging).
      //
      // FIX680.1.1.3: reuses this same red-Ref styling rather than a
      // separate marker — while in off-line/local mode every item in the
      // list is, by construction, not-published (getShowcase's local-mode
      // fallback only ever returns locally-discovered items, never a real
      // published one), so it's unconditionally true for every row there,
      // on top of the ordinary per-item pending-image check.
      // FIX658.2.1.1: a public item staged for deletion reuses this same
      // not-yet-published red styling, plus a strike-through so 'crossed
      // out' reads as its own state rather than just another pending edit.
      // FIX655.2 / FIX655.4 <file-flag-new-item>: a just-added item is
      // eligible for Publish the moment it exists, even with zero images —
      // the per-image status check below can't see that, since there's
      // nothing in imagesByFolderRef yet. Driven by the explicit pendingNew
      // flag, not the id shape — in off-line mode every folder has a
      // synthetic string id regardless of what it actually is (see
      // backendLocal.js's buildLocalFolders), so that alone can't tell a
      // genuinely new item apart from a plain or removed one.
      // FIX657.4 <file-flag-chged-item-ref>: a real item mid-rename
      // (originalRef set by confirmChangeItemRef / restored on load above) is
      // just as not-yet-published as a new or removed item.
      const needsPublish = isLocalApp && (
        folder.pendingRemoval ||
        folder.pendingNew ||
        folder.originalRef != null ||
        isLocalModeActive() ||
        (imagesByFolderRef.current[folder.id] || []).some((im) => im.added || im.chged || im.moved || im.deleted)
      );
      // FIX655.4: added items show '{ref}+'. FIX657.4: renamed items show
      // '{ref}!'. Suffix, not a separate marker — the Ref column is too
      // narrow for extra words (FIX630.1's same reasoning for using red
      // text over a suffix there — this is the one place a single
      // character still fits).
      let suffix = '';
      if (folder.pendingNew) suffix = '+';
      else if (folder.originalRef != null) suffix = '!';
      return (
        <td key={key} className="sc-td-name" style={cellStyle}>
          <span style={needsPublish ? {
            color: '#dc2626',
            textDecoration: folder.pendingRemoval ? 'line-through' : undefined,
          } : undefined}
          >
            {folder.name}{suffix}
          </span>
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
        {/* FIX650.1 / FIX650.1.2.1 / FIX651 <menu-projects>: the local
            app's entire header is this switcher + <menu-import> + the
            FIX654 <local-setup-menu> below — no Home/About/Title/Columns/
            Grouping/website-Admin/website-Setup/sign-out, matching the
            (updated) FIX650.1 mockup's 'Projects Import Setup' row. */}
        {isLocalApp && (
          <div className="sc-menu" data-yagu-id="menu-projects" ref={projectsMenuRef}>
            <button
              type="button"
              className="sc-menu-trigger"
              onClick={() => setProjectsMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={projectsMenuOpen}
            >
              Projects ▾
            </button>
            {projectsMenuOpen && (
              <ul className="sc-menu-items" role="menu">
                {allProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProjectsMenuOpen(false);
                        navigate(`/${p.official_slug || projectSlug(p.name)}`);
                      }}
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
                {/* FIX653.2: 'Create new project' at the end of the list. */}
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    data-yagu-id="cmd-create-new-project"
                    onClick={() => setCreateProjectPopup({ name: '', error: null, busy: false })}
                  >
                    Create new project
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
        {!isLocalApp && (
          <>
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
          </>
        )}
        {/* FIX503.2.5 + FIX503.5.1.1 / FIX369 / FIX369.0 <menu-import>:
            Website: admin- or project-manager-only (FIX503.5.1), FIX369.1's
            three options — Import images, Open properties gsheet, Import
            properties gsheet. Local app: always shown (login/admin-gating
            dropped there), but per FIX656 this is now the 'Commands' menu
            instead — top level <cmd-add-item>, <cmd-delete-item>,
            <cmd-publish-all-changes>, plus an 'Other…' group holding
            <cmd-capture-cam-img>, <cmd-change-item-ref>,
            <cmd-undelete-item>, <cmd-reset-item>, <cmd-publish-selection> —
            same shared container Id as the website's Import menu (FIX369.0
            doesn't define a separate one for FIX656), the three Import
            options stay website-only either way. */}
        {(isLocalApp || isAdminOrManager) && (
          <div className="sc-menu" data-yagu-id="menu-import" ref={menuRef}>
            <button
              type="button"
              className="sc-menu-trigger"
              onClick={() => { setMenuOpen((v) => !v); setOtherCommandsOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {isLocalApp ? 'Commands ▾' : 'Import ▾'}
            </button>
            {menuOpen && (
              <ul className="sc-menu-items" role="menu">
                {!isLocalApp && (
                  <>
                    {/* FIX371.2 <cmd-import-harddisk-img>: label 'Import
                        images' (was 'Images'). Placed first per FIX369.1's
                        list order — FIX371.2.2/.2.2.1's own 'place it
                        first' wording is now removed, superseded by that
                        list. */}
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        data-yagu-id="cmd-import-harddisk-img"
                        onClick={() => { setMenuOpen(false); setImportImagesOpen(true); }}
                      >
                        Import images
                      </button>
                    </li>
                    {/* FIX375 <cmd-open-properties-gsheet>: opens the gsheet
                        stored at <setup-properties-gsheet> (FIX508.2.5) in a
                        new tab. Disabled when that field is blank — nothing
                        to open yet. */}
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        data-yagu-id="cmd-open-properties-gsheet"
                        disabled={!viewSetup.properties_gsheet_url}
                        title={!viewSetup.properties_gsheet_url ? 'Set the Properties Google sheet in Setup > General first' : undefined}
                        onClick={() => { setMenuOpen(false); window.open(viewSetup.properties_gsheet_url, '_blank', 'noopener'); }}
                      >
                        Open properties gsheet
                      </button>
                    </li>
                    {/* FIX370.3 <cmd-import-properties-gsheet>: label
                        'Import properties gsheet' (was 'Image Properties')
                        — opens the Google Sheet import dialog (FIX370). Id
                        renamed from <cmd-import-google-sheet> (FIX370.0,
                        itself spelled without the old spec's stray blank,
                        'cmd-import- google-sheet'). FIX370.3.1's own 'menu
                        option Image Properties' wording is now removed,
                        superseded by FIX369.1's list + this label. */}
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        data-yagu-id="cmd-import-properties-gsheet"
                        onClick={() => { setMenuOpen(false); setImportOpen(true); }}
                      >
                        Import properties gsheet
                      </button>
                    </li>
                  </>
                )}
                {/* FIX655 <cmd-add-item>: local-app only, works both online
                    and off-line (FIX655.1 branches internally). Label 'Add
                    item' (was '+ Item'). */}
                {isLocalApp && (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      data-yagu-id="cmd-add-item"
                      onClick={() => { setMenuOpen(false); handleAddItemClick(); }}
                    >
                      Add item
                    </button>
                  </li>
                )}
                {/* FIX658 <cmd-delete-item>: enabled only when 1+ items
                    selected. */}
                {isLocalApp && (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      data-yagu-id="cmd-delete-item"
                      disabled={selectedFolderIds.length === 0}
                      onClick={() => { setMenuOpen(false); setDeleteItemPopup(true); }}
                    >
                      Delete item
                    </button>
                  </li>
                )}
                {/* FIX656 <cmd-publish-all-changes> / FIX652 [ex-FIX375]:
                    local-app only. */}
                {isLocalApp && (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      data-yagu-id="cmd-publish-all-changes"
                      onClick={() => { setMenuOpen(false); handleOpenCrossPublish(); }}
                      disabled={isLocalModeActive()}
                      title={isLocalModeActive() ? 'Unavailable while offline' : undefined}
                    >
                      Publish all
                    </button>
                  </li>
                )}
                {/* FIX656 'Other…': a true nested flyout submenu (not an
                    inline expand) holding the Commands menu's less-frequent
                    items. Both this <li> and the flyout live inside the
                    same outer menuRef div, so a click anywhere in the
                    flyout is still "inside" the top-level menu for the
                    outside-click-close handler below. */}
                {isLocalApp && (
                  <li className="sc-submenu-parent">
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={otherCommandsOpen}
                      onClick={(e) => { e.stopPropagation(); setOtherCommandsOpen((v) => !v); }}
                    >
                      Other… ▸
                    </button>
                    {otherCommandsOpen && (
                      <ul className="sc-menu-items sc-submenu" role="menu">
                        {/* FIX656 <cmd-capture-cam-img> / FIX653.1 /
                            FIX653.2 (camera icon + text 'Camera capture').
                            Id realigned to <cmd-capture-cam-img> (was
                            <cmd-capture-live-img>, FIX650.1.2.2's now-
                            superseded literal text) to match FIX656's
                            listing and FIX653.0's own Id for this same
                            command. */}
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            data-yagu-id="cmd-capture-cam-img"
                            onClick={() => { setMenuOpen(false); handleToggleCameraCapture(); }}
                          >
                            {cameraCaptureActive ? '✓ ' : ''}
                            <IconCamera size={16} style={{ verticalAlign: '-0.2em', marginRight: '0.35em' }} />
                            Camera capture
                          </button>
                        </li>
                        {/* FIX657 <cmd-change-item-ref>: enabled only when
                            1+ items selected (FIX657.1). FIX657.2: prefill
                            with the current ref of the first selected
                            item. */}
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            data-yagu-id="cmd-change-item-ref"
                            disabled={selectedFolderIds.length === 0}
                            onClick={() => {
                              setMenuOpen(false);
                              const firstRef = (data?.folders || []).find((f) => f.id === selectedFolderIds[0])?.name || '';
                              setChangeItemRefPopup({ value: firstRef, error: null });
                            }}
                          >
                            Change item ref
                          </button>
                        </li>
                        {/* FIX661 <cmd-undelete-item> / FIX670.10.10 /
                            FIX658.2 (this block's own Enabling entry,
                            mis-numbered in the requirements file — see the
                            comment on handleUndeleteItems above): enabled
                            only when the selection has at least 1 item
                            currently staged to-be-deleted — no recap popup,
                            applies immediately, same posture as FIX659
                            Reset item. */}
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            data-yagu-id="cmd-undelete-item"
                            disabled={!selectedFolderIds.some((id) => (data?.folders || []).find((f) => f.id === id)?.pendingRemoval)}
                            onClick={() => { setMenuOpen(false); handleUndeleteItems(); }}
                          >
                            Undelete item
                          </button>
                        </li>
                        {/* FIX659 <cmd-reset-item> / FIX670.10.11: FIX659.2
                            (updated) — visible only in on-line mode, and
                            enabled when the selection has at least 1
                            unpublished public item (was: every selected
                            item must be staged) — no recap popup, applies
                            immediately. */}
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            data-yagu-id="cmd-reset-item"
                            disabled={
                              isLocalModeActive()
                              || !selectedFolderIds.some((id) => isUnpublishedPublicItem((data?.folders || []).find((f) => f.id === id)))
                            }
                            title={isLocalModeActive() ? 'Unavailable while offline' : undefined}
                            onClick={() => { setMenuOpen(false); handleResetItems(); }}
                          >
                            Reset item
                          </button>
                        </li>
                        {/* FIX660 <cmd-publish-selection>: enabled only
                            when 1+ of the selected items is staged
                            (FIX660.2). */}
                        <li>
                          <button
                            type="button"
                            role="menuitem"
                            data-yagu-id="cmd-publish-selection"
                            onClick={() => { setMenuOpen(false); handleOpenPublishSelection(); }}
                            disabled={
                              isLocalModeActive()
                              || !selectedFolderIds.some((id) => isItemStaged((data?.folders || []).find((f) => f.id === id)))
                            }
                            title={isLocalModeActive() ? 'Unavailable while offline' : undefined}
                          >
                            Publish selection
                          </button>
                        </li>
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        {/* FIX650.1 (updated) / FIX654 <local-setup-menu>: local-app-only
            Setup menu, wheel icon trigger (matching the website's existing
            ⚙ <button-setup> convention) — third menu in the mockup's
            'Projects Import Setup' row. Just two On/Off options
            (FIX654.1, FIX654.2); unrelated to the website's admin
            <button-setup> (property/columns SetupPanel). */}
        {isLocalApp && (
          <div className="sc-menu" data-yagu-id="local-setup-menu" ref={setupMenuRef}>
            <button
              type="button"
              className="sc-menu-trigger"
              onClick={() => setSetupMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={setupMenuOpen}
              aria-label="Setup"
              title="Setup"
            >
              ⚙
            </button>
            {setupMenuOpen && (
              <ul className="sc-menu-items" role="menu">
                {/* FIX654.1 <cmd-stay-in-edition> */}
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    data-yagu-id="cmd-stay-in-edition"
                    onClick={() => { setSetupMenuOpen(false); toggleStayInEdition(); }}
                  >
                    {stayInEdition ? '✓ ' : ''}Stay in edition
                  </button>
                </li>
                {/* FIX654.2 <cmd-hide-sections> */}
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    data-yagu-id="cmd-hide-sections"
                    onClick={() => { setSetupMenuOpen(false); toggleHideSections(); }}
                  >
                    {hideSections ? '✓ ' : ''}Hide Section &amp; Caption
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
        {/* FIX653.3: flashing camera icon shown at the top of the app while
            Camera capture is on — flashes red (distinct from FIX620.3.4's
            yellow flash on <button-auto-insert-img>). */}
        {isLocalApp && cameraCaptureActive && (
          <span
            className="sc-flash-red"
            title="Camera capture active"
            aria-label="Camera capture active"
          >
            <IconCamera size={20} />
          </span>
        )}
        {!isLocalApp && (
          <>
            {/* FIX503.2.7 + FIX503.5.1 (.4.1.4) <menu-admin>: admin- or
                project-manager-only, alongside the other admin affordances.
                Reuses the same component instantiated on the App home page
                (FIX410.4.1 / FIX410.4.2). FIX650: dropped entirely for the
                local app — no admin menu there. */}
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
                when signed in. FIX650: local app has no sign-in concept. */}
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
          </>
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
            Showcase view. FIX630.0: the local app adapts this same Id
            rather than defining its own — FIX630.1's red-Ref styling
            (below, in renderBodyCell) is the only local-app-specific
            behavior layered on top. */}
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
                      // FIX510.2.1.11: Ctrl/Cmd-click toggles the row in the
                      // multi-selection; Shift-click selects the contiguous
                      // range from the last-clicked row; plain click resets
                      // to a single-row selection.
                      userPickedRef.current = true; // FIX404: stop re-applying the URL item
                      if (e.shiftKey && itemSelectAnchorRef.current != null) {
                        selectRange(displayedFolders, itemSelectAnchorRef.current, f.id);
                      } else if (e.ctrlKey || e.metaKey) {
                        toggleSelected(f.id);
                        itemSelectAnchorRef.current = f.id;
                      } else {
                        selectOnly(f.id);
                        itemSelectAnchorRef.current = f.id;
                      }
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
                Edit to admin-only. The local app has no login process,
                so <button-edit> stays visible there regardless of profile. */}
            {!editionMode && (viewerTab === 'details'
              ? profile?.profile === 'admin'
              : (isLocalApp || !!profile)) && (
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
                setImages={setImagesForCurrentFolder}
                onExitEdit={() => setEditionMode(false)}
                folderId={selectedFolderId}
                projectId={data.project?.id}
                projectName={data.project?.name}
                itemName={(data?.folders || []).find((f) => f.id === selectedFolderId)?.name}
                hideSections={hideSections}
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
                  // FIX680.1.1: a synthetic local-item id (string) has no
                  // real DB row to persist onto.
                  if (typeof selectedFolderId !== 'string') {
                    setFolderZoomFactor(selectedFolderId, zf).catch(() => {});
                  }
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
                            onWheel={onZoomWheel}
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
            // FIX370.3.2.2.1 / <setup-properties-gsheet> (FIX508.2.5): the
            // import now reads this instead of prompting for a URL.
            properties_gsheet_url: viewSetup.properties_gsheet_url || '',
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
      {/* FIX653 / FIX620.2.2: <cmd-capture-cam-img> popup, shown on toggling
          Camera capture on. Cancel closes without starting; Start validates
          the folder first (via the Local Agent) before arming the poll —
          same pattern as FIX620's per-item auto-insert popup. */}
      {cameraCapturePopup && (
        <div className="setup-overlay" onMouseDown={() => setCameraCapturePopup(null)}>
          <div className="sc-shrink-box sc-auto-insert-popup" onMouseDown={(e) => e.stopPropagation()}>
            <p>Automatic insertion of images dropped in folder:</p>
            <input
              type="text"
              className="sc-auto-insert-folder-input"
              value={cameraCapturePopup.folder}
              onChange={(e) => setCameraCapturePopup((p) => ({ ...p, folder: e.target.value }))}
              disabled={cameraCapturePopup.checking}
            />
            {cameraCapturePopup.error && <div className="sc-viewer-err">{cameraCapturePopup.error}</div>}
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setCameraCapturePopup(null)} disabled={cameraCapturePopup.checking}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleStartCameraCapture} disabled={cameraCapturePopup.checking}>
                Start listening
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX680.1.2 <add-local-item>: ref prompt, first addition only. */}
      {offlineAddItemPopup && (
        <div className="setup-overlay" onMouseDown={() => setOfflineAddItemPopup(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>Enter the new item's ref:</p>
            <input
              type="text"
              data-yagu-id="input-add-local-item-ref"
              value={offlineAddItemPopup.value}
              onChange={(e) => setOfflineAddItemPopup((p) => ({ ...p, value: e.target.value }))}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAddLocalItemRef(); }}
            />
            {offlineAddItemPopup.error && <div className="sc-viewer-err">{offlineAddItemPopup.error}</div>}
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setOfflineAddItemPopup(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmAddLocalItemRef}>
                Add item
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX657 <cmd-change-item-ref>: first-new-ref-of-the-range prompt. */}
      {changeItemRefPopup && (
        <div className="setup-overlay" onMouseDown={() => setChangeItemRefPopup(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>Enter the first new ref of the selection:</p>
            <input
              type="text"
              data-yagu-id="input-change-item-ref"
              value={changeItemRefPopup.value}
              onChange={(e) => setChangeItemRefPopup((p) => ({ ...p, value: e.target.value }))}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmChangeItemRef(); }}
            />
            {changeItemRefPopup.error && <div className="sc-viewer-err">{changeItemRefPopup.error}</div>}
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setChangeItemRefPopup(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmChangeItemRef}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX658 <cmd-delete-item>: Title 'Item deletion', prompt lists every
          selected ref one per line (FIX658.1). */}
      {deleteItemPopup && (
        <div className="setup-overlay" onMouseDown={() => setDeleteItemPopup(false)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p><strong>Item deletion</strong></p>
            <p style={{ whiteSpace: 'pre-line' }}>
              {`Confirm deletion of items ${selectedFolderIds
                .map((id) => (data?.folders || []).find((f) => f.id === id)?.name)
                .filter(Boolean)
                .join('\n')}`}
            </p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setDeleteItemPopup(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmDeleteItems}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX653.2 <cmd-create-new-project>: name-only prompt, no tech ID —
          same shape as HomeView.jsx's create-local-project popup. */}
      {createProjectPopup && (
        <div className="setup-overlay" onMouseDown={() => !createProjectPopup.busy && setCreateProjectPopup(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p>New project name:</p>
            <input
              type="text"
              data-yagu-id="input-create-new-project-name"
              value={createProjectPopup.name}
              onChange={(e) => setCreateProjectPopup((p) => ({ ...p, name: e.target.value }))}
              autoFocus
              disabled={createProjectPopup.busy}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmCreateProject(); }}
            />
            {createProjectPopup.error && <div className="sc-viewer-err">{createProjectPopup.error}</div>}
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setCreateProjectPopup(null)} disabled={createProjectPopup.busy}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmCreateProject} disabled={createProjectPopup.busy}>
                {createProjectPopup.busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX652 [ex-FIX375.1-ish]: <cmd-publish-all-changes>/<cmd-publish-selection>
          recap — one Ref line per item with pending changes, plus FIX652.2's
          own item-level actions (removed/renamed/new) called out by name
          rather than an image-change count. Nothing pending shows a single
          all-zero line with Confirm disabled, rather than an error. */}
      {crossPublishStage === 'recap' && crossPublishPlan && (
        <div className="setup-overlay" onMouseDown={() => { setCrossPublishStage(null); setCrossPublishPlan(null); }}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            {crossPublishPlan.length === 0 ? (
              <p>0 new, 0 remove, 0 move, 0 change</p>
            ) : (
              crossPublishPlan.map((p) => (
                <p key={p.ref}>
                  {p.kind === 'deleted' && `Ref ${p.ref}: item deleted`}
                  {p.kind === 'new' && `Ref ${p.ref}: new item, ${p.addCount} new`}
                  {p.kind === 'renamed' && (
                    `Ref ${p.ref}: renamed from ${p.oldRef}, ${p.addCount} new, ${p.removeCount} remove, `
                    + `${p.moveCount} move, ${p.changeCount} change`
                  )}
                  {p.kind === 'plain' && (
                    `Ref ${p.ref}: ${p.addCount} new, ${p.removeCount} remove, ${p.moveCount} move, ${p.changeCount} change`
                  )}
                </p>
              ))
            )}
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => { setCrossPublishStage(null); setCrossPublishPlan(null); }}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={crossPublishPlan.length === 0}
                onClick={confirmCrossPublish}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {crossPublishStage === 'running' && (
        <div className="setup-overlay">
          <div className="sc-shrink-box">
            <p>
              Publishing…{' '}
              {crossPublishProgress
                ? `${Math.round((crossPublishProgress.done / crossPublishProgress.total) * 100)}% (${crossPublishProgress.done}/${crossPublishProgress.total})`
                : ''}
            </p>
          </div>
        </div>
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
          and the nav pill (bottom-right). FIX523.3.1 ESC + FIX523.3.2
          system back close the overlay (no in-overlay Back button —
          rely on the navigator). FIX523.3.4 swipe handlers wired on
          the image wrap. */}
      {fullScreen && currentImage && (
        <div
          className="sc-fullscreen"
          data-yagu-id="panel-showcase-img-viewer-fullscreen"
          onClick={() => setFullScreen(false)}
        >
          {/* FIX523.3.5: zoom slider — same mechanics as FIX520.3.3, own
              state. Click swallowed so dragging the slider doesn't close
              the overlay. */}
          <div className="sc-fullscreen-zoom" onClick={(e) => e.stopPropagation()}>
            <span className="sc-viewer-zoom-label">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={fsZoomLevel}
              onChange={(e) => setFsZoomLevel(Number(e.target.value))}
              aria-label="Zoom image"
              title="Zoom"
            />
          </div>
          <div
            ref={fsViewerScrollRef}
            className={`sc-fullscreen-img-wrap${fsZoomLevel > 1 ? ' zoomed' : ''}${fsIsPanning ? ' panning' : ''}`}
            onTouchStart={onImageTouchStart}
            onTouchEnd={onImageTouchEnd}
            onMouseDown={onFsZoomPointerDown}
            onWheel={onFsZoomWheel}
            onClick={(e) => {
              if (wasSwipeRef.current) {
                wasSwipeRef.current = false;
                e.stopPropagation();
              }
              if (fsDraggedRef.current) {
                fsDraggedRef.current = false;
                e.stopPropagation();
              }
            }}
          >
            <ShowcaseImageCanvas
              url={currentImage.url}
              rotation={currentImage.rotation ?? 0}
              crop={currentImage.crop ?? null}
              className="sc-fullscreen-img"
              zoom={fsZoomLevel}
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
            {/* FIX523.3.3 / FIX520.3.2.2: prev / i-n / next pill,
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
      {/* FIX610.4.5.1[ex-610.3.20.1] and FIX610.4.5.2[ex-610.3.20.2] <button-edit>:
          acquiring the cross-side edit lock failed (held by the other side, or
          local has unpublished changes) — a dismissable popup, not a page-replacing error. */}
      {editLockError && (
        <div className="setup-overlay" onMouseDown={() => setEditLockError(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sc-viewer-err">{editLockError}</div>
            <div className="sc-shrink-actions">
              <button type="button" className="primary" onClick={() => setEditLockError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
