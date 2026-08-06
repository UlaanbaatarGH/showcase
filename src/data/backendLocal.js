// Local implementation of the backend interface. For now it delegates
// everything to the Cloud implementation, so running `npm run dev` on this
// machine still works the same way as the deployed site.
//
// As the Local Agent grows filesystem-backed endpoints for the admin app,
// override the matching functions here (e.g. listProjects, getFolderTree,
// createFolder) without touching the views.
//
// FIX680 Local app startup: when the public DB (the FastAPI/Supabase
// backend, not the local Agent — the Agent is always required regardless)
// is unreachable, listProjects/getShowcase/getFolderImages fall back to
// whatever's already staged on disk under tech/data/staging/ (FIX670), so
// the local app still works for locally-staged projects and items.
import cloud from './backendCloud.js';
import { projectSlug } from '../router.js';
import {
  getStagingRoot, sanitizeSegment, mkdir, resolveItemFolderDir,
  listStagingProjectNames, listStagingItems,
  readManifestEntries, fetchStagedImageBlob, imageAttrsFromManifest,
} from '../viewer/itemStaging.js';

// FIX680.1 (updated, was "If no connection with the public DB then the user
// can:") now reads "With off-line start mode, the user can:" — tying
// FIX680.1.1-.1.3 to the explicit choice FIX680.3's popup introduced rather
// than a bare connection check. No behavior delta here: this flag is
// already the single gate for both the explicit "Off-line" choice
// (forceLocalMode) and the reactive fallback below, so "off-line start
// mode" and "a fallback has triggered" are the same state either way.
//
// FIX680.2: a connection arriving after local-app startup is ignored — once
// a fallback triggers, it's sticky for the rest of the page's lifetime
// (only a hard reload re-attempts the network). Module-level rather than
// React state so it's visible to every caller through this same module.
let localModeActive = false;
export function isLocalModeActive() {
  return localModeActive;
}

// FIX680.3: explicit user choice ("off-line" in the start-mode popup) —
// commits to local mode immediately, regardless of whether the network
// actually works, unlike the reactive per-call fallback below.
export function forceLocalMode() {
  localModeActive = true;
}

// FIX680.3.1: side-effect-free reachability probe for the start-mode
// popup's "on-line" option — calls the cloud implementation directly
// (never the local wrapper below, which would itself set localModeActive
// on failure; this is only a check, not a commitment either way).
export async function checkCloudReachable() {
  try {
    await cloud.listProjects();
    return true;
  } catch {
    return false;
  }
}

// FIX680.1.1.2: getFolderImages only receives a folder id, not a project —
// tracked here from whichever getShowcase last resolved a local project.
// The local app only ever has one project open at a time, so a single
// module-level value is enough (mirrors the single in-flight project of
// ShowcaseView.jsx itself).
let activeLocalProjectName = null;

const LOCAL_ITEM_PREFIX = 'local-item-';
const localItemId = (itemName) => `${LOCAL_ITEM_PREFIX}${itemName}`;
const isLocalItemId = (id) => typeof id === 'string' && id.startsWith(LOCAL_ITEM_PREFIX);
const itemNameFromLocalItemId = (id) => id.slice(LOCAL_ITEM_PREFIX.length);

// FIX680.1.1: "projects having local data" — one card per tech/data/staging/
// subfolder, shaped like the cloud listProjects() response but with no DB
// id/slug and a `local: true` marker (HomeView shows a "local" badge for it
// instead of the "private" one).
async function listLocalProjects() {
  const root = await getStagingRoot();
  const names = await listStagingProjectNames(root);
  return names.map((name) => ({
    id: null,
    name,
    is_public: false,
    can_edit: true,
    cover_image_url: null,
    front_introduction: '',
    official_slug: null,
    local: true,
  }));
}

async function listProjects() {
  if (!localModeActive) {
    try {
      return await cloud.listProjects();
    } catch {
      localModeActive = true;
    }
  }
  return listLocalProjects();
}

// FIX680.1.1: one synthetic folder (item) entry per staged item — mirrors
// the `local-` id convention images already use (isLocalRow), just at the
// item level. FIX658.2.1.1 / FIX655.4 / FIX657.4: carries the same
// pendingRemoval/pendingNew/originalRef flags ShowcaseView.jsx's on-line
// reconciliation effect derives from listStagingItems, so an item displays
// identically whether the project is open on-line or off — see that
// effect's comment for why the flag (not the id shape, which is always a
// string here regardless of what the item actually is) has to drive it.
async function buildLocalFolders(root, projectName) {
  const staged = await listStagingItems(root, projectName);
  const folders = [];
  for (const item of staged) {
    if (item.flag === 'plain' || item.flag === 'chged') {
      // FIX670.20: an unflagged/'(chged)' folder only represents real staged
      // state while its manifest actually has something in it — new/deleted/
      // renamed folders are meaningful by their flag alone, manifest or not.
      const manifest = await readManifestEntries(item.dir);
      if (manifest.length === 0) continue;
    }
    folders.push({
      id: localItemId(item.ref),
      name: item.ref,
      is_main: false,
      sort_order: 0,
      zoom_factor: null,
      pendingRemoval: item.flag === 'deleted',
      pendingNew: item.flag === 'new',
      originalRef: item.flag === 'renamed' ? item.oldRef : null,
    });
  }
  return folders;
}

async function getLocalShowcaseByName(name) {
  const root = await getStagingRoot();
  activeLocalProjectName = name;
  return {
    project: { id: null, name, is_public: false, local: true },
    folders: await buildLocalFolders(root, name),
  };
}

// FIX680.1.1 / FIX680.1.2: resolves the URL slug against local project
// names. projectSlug() is a deterministic, one-way function of the name, so
// this works uniformly for a normal online project that's currently
// unreachable (its local folder was named after the real project name) and
// for a brand-new local-only project (FIX680.1.2, "[2] Add a new project" —
// it never had a DB slug at all, so the cloud call 404s the same way an
// unreachable one fails).
async function getLocalShowcaseBySlug(slug) {
  const root = await getStagingRoot();
  const names = await listStagingProjectNames(root);
  const match = names.find((n) => projectSlug(n) === slug);
  if (!match) {
    const err = new Error('Project not found locally');
    err.status = 404;
    throw err;
  }
  return getLocalShowcaseByName(match);
}

async function getShowcase(slug) {
  if (!localModeActive) {
    try {
      return await cloud.getShowcase(slug);
    } catch {
      localModeActive = true;
    }
  }
  return getLocalShowcaseBySlug(slug);
}

// FIX680.1.1.2: a manifest entry backed by an actual file on disk becomes a
// real local row (same shape as ShowcaseImgListEditor.jsx's makeLocalRow /
// the FIX670 reconciliation effect) — only a genuinely new/local image ever
// has bytes staged here, so it's always `added`, never `deleted`. A
// manifest entry with no matching file is a *public* image whose bytes only
// ever lived on the server — with no network to fetch it, it's rendered as
// a placeholder (FIX680.1.1.2), carrying whatever chged/moved/deleted flags
// the manifest recorded for it.
async function buildLocalImageRows(itemDir) {
  const manifest = await readManifestEntries(itemDir);
  const rows = [];
  let localIdCounter = 0;
  for (let i = 0; i < manifest.length; i++) {
    const { filename, origPosition, chged, moved, deleted, attrs } = manifest[i];
    const blob = await fetchStagedImageBlob(`${itemDir}/${filename}`);
    if (blob) {
      rows.push({
        id: `local-${Date.now()}-${localIdCounter++}`,
        image_id: null,
        url: URL.createObjectURL(blob),
        filename,
        ...imageAttrsFromManifest(attrs), // FIX670.1.2.2.4
        sort_order: i,
        rotation: 0,
        crop: null,
        added: true, chged: false, moved: false, deleted: false,
        localFile: blob,
        stagedPath: `${itemDir}/${filename}`,
      });
    } else {
      rows.push({
        id: `placeholder-${filename}`,
        image_id: null,
        url: null,
        filename,
        ...imageAttrsFromManifest(attrs), // FIX670.1.2.2.4
        sort_order: i,
        origSortOrder: (origPosition ?? i + 1) - 1,
        added: false,
        chged: !!chged,
        moved: !!moved,
        deleted: !!deleted,
        isPlaceholder: true, // FIX680.1.1.2: rendered as a grey "Public image {filename}" box
      });
    }
  }
  return rows;
}

async function getFolderImages(folderId) {
  if (localModeActive && isLocalItemId(folderId)) {
    const root = await getStagingRoot();
    const itemName = itemNameFromLocalItemId(folderId);
    return buildLocalImageRows(await resolveItemFolderDir(root, activeLocalProjectName, itemName));
  }
  return cloud.getFolderImages(folderId);
}

// FIX680.1.2: a brand-new project that only ever exists locally — a name,
// no DB row ("no tech ID"). Just creates the staging root folder; the
// getShowcase(slug) fallback above (via projectSlug matching) resolves it
// the moment the app navigates there, no separate creation bookkeeping.
export async function createLocalProject(name) {
  const root = await getStagingRoot();
  await mkdir(`${root}/${sanitizeSegment(name)}`);
  localModeActive = true;
  return { id: null, name, is_public: false, local: true };
}

export default {
  ...cloud,
  listProjects,
  getShowcase,
  getFolderImages,
  isLocalModeActive,
  createLocalProject,
  forceLocalMode,
  checkCloudReachable,
};
