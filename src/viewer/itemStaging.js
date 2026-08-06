// FIX670 Changes & Publication: durable local item staging. Folder-per-item
// under a staging root on disk, so add/remove/unremove/move survive a
// reload/crash before Publish. Every local-edit path in
// ShowcaseImgListEditor.jsx goes through this shared module.
const AGENT_URL = 'http://localhost:3001';

const MANIFEST_FILENAME = 'list.txt';

// FIX670.1.2.2: manifest line suffixes. An image is New XOR (any combination
// of Chged/Moved/Deleted) — Move and Chg are independent axes of the same
// public image (moving it doesn't change its bytes/attrs, and vice versa),
// so both may be set at once; a not-yet-published (New) image never carries
// any of the other three.
const NEW_SUFFIX = ' (new)';
const CHGED_SUFFIX = ' (chged)';
const MOVED_SUFFIX = ' (moved)';
const DELETED_SUFFIX = ' (deleted)';
// FIX670.1.2.2.2: a public image's line starts with its immutable original
// public-list position, 1-based, counted among public images only (local
// images have no position information at all). Set once, the moment the
// image is first written into a manifest, and never recomputed afterward —
// it survives an offline restart, unlike re-deriving it from a live fetch.
const POSITION_RE = /^\[(\d+)\]\s+/;

// FIX670.1.1.2.1: staging-folder-name postfixes.
const NEW_POSTFIX = ' (new)';
const CHGED_POSTFIX = ' (chged)';
const DELETED_ITEM_POSTFIX = ' (deleted)';
const EX_POSTFIX_RE = / \(ex-.+\)$/;

// FIX670.1: the folder segment is the project's literal name (spec text:
// tech/data/staging/{project-name}/{item-folder-ref}), sanitized for
// filesystem safety since a project name is free text, unlike the item ref
// (already a plain zero-padded number).
export function sanitizeSegment(name) {
  return String(name ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || '_';
}

// FIX670.1: dataRoot is cached module-wide — it can't change mid-session.
let cachedAgentDataRoot = null;
async function getDataRoot() {
  if (cachedAgentDataRoot == null) {
    const res = await fetch(`${AGENT_URL}/agent/status`);
    const body = await res.json();
    cachedAgentDataRoot = body.dataRoot;
  }
  return cachedAgentDataRoot;
}

// FIX670.1: tech/data/staging is the one mechanism backing every local-edit
// path.
export async function getStagingRoot() {
  return `${await getDataRoot()}/staging`;
}

// Pre-FIX670 capture-staging tree (FIX653), kept only for one-time migration.
export async function getLegacyStagingRoot() {
  return `${await getDataRoot()}/capture-staging`;
}

// FIX670.1.1 / FIX670.1.1.0: the per-item staging folder, Id <folder-staged-item>.
// `postfix` is only ever passed by code actively creating/renaming into one
// of the FIX670.1.1.2.1 forms — everyone else resolving an *existing* item's
// folder should use resolveItemFolderDir instead, since it may already carry
// one.
export function stagingItemDir(root, projectName, itemName, postfix = '') {
  return `${root}/${sanitizeSegment(projectName)}/${sanitizeSegment(itemName)}${postfix}`;
}

// Strips a known postfix off a raw folder name, returning the clean ref and
// which postfix (if any) it carried.
function parseItemFolderName(folderName) {
  if (folderName.endsWith(NEW_POSTFIX)) return { ref: folderName.slice(0, -NEW_POSTFIX.length), postfix: NEW_POSTFIX };
  if (folderName.endsWith(DELETED_ITEM_POSTFIX)) return { ref: folderName.slice(0, -DELETED_ITEM_POSTFIX.length), postfix: DELETED_ITEM_POSTFIX };
  if (folderName.endsWith(CHGED_POSTFIX)) return { ref: folderName.slice(0, -CHGED_POSTFIX.length), postfix: CHGED_POSTFIX };
  const exMatch = folderName.match(EX_POSTFIX_RE);
  if (exMatch) return { ref: folderName.slice(0, -exMatch[0].length), postfix: exMatch[0] };
  return { ref: folderName, postfix: '' };
}

async function findItemFolderEntry(root, projectName, itemRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(itemRef);
  const entries = await listEntries(projectDir);
  return entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted) || null;
}

// FIX670.10: resolves an item's *current* on-disk folder, which may carry a
// ' (new)'/' (chged)'/' (ex-{old-ref})'/' (deleted)' postfix from earlier —
// every operational lookup (sync on edit, offline image list, rename) should
// go through this instead of the bare stagingItemDir. Falls back to a bare
// path when nothing exists yet.
export async function resolveItemFolderDir(root, projectName, itemRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const match = await findItemFolderEntry(root, projectName, itemRef);
  return match ? `${projectDir}/${match.name}` : stagingItemDir(root, projectName, itemRef);
}

// FIX670.10.8 <cmd-change-item-ref>: renames an item's staging folder to a new
// ref, keeping its ' (new)' postfix or an already-present ' (ex-...)' tag
// as-is (either takes priority over a fresh rename tag), otherwise tagging
// it ' (ex-{oldRef})' with the ref it carried right before this rename. A
// bare or ' (chged)' folder both take the ' (ex-...)' tag the same way — the
// ref-change is tracked independently of any pending image change. Returns
// the new dir, or null if there was nothing on disk to rename.
export async function renameItemFolder(root, projectName, oldRef, newRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const match = await findItemFolderEntry(root, projectName, oldRef);
  if (!match) return null;
  const { postfix } = parseItemFolderName(match.name);
  const newPostfix = (postfix === NEW_POSTFIX || EX_POSTFIX_RE.test(postfix)) ? postfix : ` (ex-${oldRef})`;
  const oldPath = `${projectDir}/${match.name}`;
  const newPath = stagingItemDir(root, projectName, newRef, newPostfix);
  await fetch(`${AGENT_URL}/agent/dir/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return newPath;
}

// FIX670.10.8: reverts a real item's staged rename — used when the admin
// sets the ref back to what it was before any <cmd-change-item-ref> use this
// session, clearing the ' (ex-...)' tag entirely (bare, or ' (chged)' if
// image changes are also pending) rather than re-tagging it with itself.
// No-op if the folder isn't currently ' (ex-...)'-tagged. Removes the folder
// outright if nothing else is staged for it.
export async function clearRenameTag(root, projectName, currentRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const match = await findItemFolderEntry(root, projectName, currentRef);
  if (!match) return null;
  const { postfix } = parseItemFolderName(match.name);
  const oldPath = `${projectDir}/${match.name}`;
  if (!EX_POSTFIX_RE.test(postfix)) return oldPath; // nothing to clear
  const manifest = await readManifestEntries(oldPath);
  const hasPendingImages = manifest.some((e) => e.added || e.chged || e.moved || e.deleted);
  if (!hasPendingImages) {
    await rmPath(oldPath);
    return null;
  }
  const newPath = stagingItemDir(root, projectName, currentRef, CHGED_POSTFIX);
  await fetch(`${AGENT_URL}/agent/dir/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return newPath;
}

// FIX670.10.9 <cmd-delete-item>: tags a public item's staging folder
// ' (deleted)' — deletion itself is deferred to publish (there's no
// delete-folder API for a real DB item), this just marks the terminal state
// on disk, overriding whatever postfix it carried before. mkdir's a fresh
// ' (deleted)' folder if nothing was staged yet, so the tag survives even
// when the item had no prior local edits.
export async function markItemFolderDeleted(root, projectName, ref) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const match = await findItemFolderEntry(root, projectName, ref);
  const newPath = stagingItemDir(root, projectName, ref, DELETED_ITEM_POSTFIX);
  if (!match) {
    await mkdir(newPath);
    return newPath;
  }
  const oldPath = `${projectDir}/${match.name}`;
  await fetch(`${AGENT_URL}/agent/dir/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return newPath;
}

// FIX670.1.2 / FIX670.1.2.0: the manifest file, Id <file-staged-item-img-list>.
function manifestPath(itemDir) {
  return `${itemDir}/${MANIFEST_FILENAME}`;
}

// FIX670.1.2.2: a manifest line is `[{origPosition}] filename` for a public
// image (origPosition immutable once set, absent entirely for a local
// image), followed by any combination of ' (chged)'/' (moved)'/' (deleted)',
// or a local image is `filename (new)`.
function parseManifestLine(line) {
  let rest = line;
  let origPosition = null;
  const posMatch = rest.match(POSITION_RE);
  if (posMatch) {
    origPosition = Number(posMatch[1]);
    rest = rest.slice(posMatch[0].length);
  }
  let added = false;
  let chged = false;
  let moved = false;
  let deleted = false;
  // Suffixes are only ever appended in a fixed order (see formatManifestLine)
  // but are parsed defensively regardless of order.
  let changed = true;
  while (changed) {
    changed = false;
    if (rest.endsWith(DELETED_SUFFIX)) { deleted = true; rest = rest.slice(0, -DELETED_SUFFIX.length); changed = true; }
    else if (rest.endsWith(MOVED_SUFFIX)) { moved = true; rest = rest.slice(0, -MOVED_SUFFIX.length); changed = true; }
    else if (rest.endsWith(CHGED_SUFFIX)) { chged = true; rest = rest.slice(0, -CHGED_SUFFIX.length); changed = true; }
    else if (rest.endsWith(NEW_SUFFIX)) { added = true; rest = rest.slice(0, -NEW_SUFFIX.length); changed = true; }
  }
  // FIX670.1.2.2.4: `attrs` starts empty and is filled in by the caller
  // (readManifestEntries) from whatever indented attr lines follow — an
  // attr absent from the manifest (never staged, or staged back to its
  // blank/default) simply stays absent from this bag, same as a missing
  // FIX670.1.2.2.3 tag.
  return { filename: rest, origPosition, added, chged, moved, deleted, attrs: {} };
}

function formatManifestLine({ filename, origPosition, added, chged, moved, deleted }) {
  let line = origPosition != null ? `[${origPosition}] ${filename}` : filename;
  if (added) line += NEW_SUFFIX;
  if (chged) line += CHGED_SUFFIX;
  if (moved) line += MOVED_SUFFIX;
  if (deleted) line += DELETED_SUFFIX;
  return line;
}

// FIX670.1.2.2.4 <file-staged-item-img-list> attrs: each filename line may be
// followed by indented 'attr-name : attr-value' lines. Generic on purpose —
// this layer knows nothing about which attr-names exist (today: caption/
// section/main, via imageAttrsToManifest/imageAttrsFromManifest below); a
// future attribute (another image one, or an item-level one once that
// lands) is just another key through the same two functions, no format
// change here. A blank/absent value is skipped — same "optional" posture as
// FIX670.1.2.2.3's tags.
function formatAttrLines(attrs) {
  return Object.entries(attrs || {})
    .filter(([, value]) => value)
    .map(([name, value]) => `  ${name} : ${value}`);
}

function parseAttrLine(trimmedLine, entry) {
  const sep = trimmedLine.indexOf(' : ');
  if (sep === -1) return;
  entry.attrs[trimmedLine.slice(0, sep)] = trimmedLine.slice(sep + 3);
}

// FIX670.1.2.2.4: today's image attrs — caption/section/is_main are the only
// per-image fields staged outside the bytes themselves (FIX610.3.6's
// crop/rotate bake straight into the file). All manifest attr values are
// raw strings; `main` is stored as the literal 'true' (never written at all
// when false, matching formatAttrLines' skip-if-blank rule) rather than a
// real boolean, same convention as every other manifest flag.
export function imageAttrsToManifest(im) {
  const attrs = {};
  if (im.caption) attrs.caption = im.caption;
  if (im.section) attrs.section = im.section;
  if (im.is_main) attrs.main = 'true';
  return attrs;
}

export function imageAttrsFromManifest(attrs) {
  return {
    caption: attrs?.caption || '',
    section: attrs?.section || '',
    is_main: attrs?.main === 'true',
  };
}

// FIX670.10: reads the item's list.txt (public + local images, display
// order). Returns [] when the file doesn't exist yet — a brand-new /
// not-yet-staged item.
export async function readManifestEntries(itemDir) {
  const res = await fetch(`${AGENT_URL}/file/read?path=${encodeURIComponent(manifestPath(itemDir))}`);
  const body = await res.json().catch(() => ({ content: '' }));
  const content = body.content || '';
  const entries = [];
  for (const rawLine of content.split('\n')) {
    if (!rawLine.trim()) continue;
    if (/^\s/.test(rawLine)) {
      // FIX670.1.2.2.4: an indented attr line belongs to the entry it
      // immediately follows.
      if (entries.length) parseAttrLine(rawLine.trim(), entries[entries.length - 1]);
      continue;
    }
    entries.push(parseManifestLine(rawLine));
  }
  return entries;
}

async function writeManifestEntries(itemDir, entries) {
  const content = entries
    .flatMap((entry) => [formatManifestLine(entry), ...formatAttrLines(entry.attrs)])
    .join('\n');
  await fetch(`${AGENT_URL}/file/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: manifestPath(itemDir), content }),
  });
}

export async function mkdir(dir) {
  await fetch(`${AGENT_URL}/agent/dir/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dir }),
  });
}

// FIX670.10.2 <cmd-add-item>: creates a freshly-added item's staging folder
// together with its (empty) <file-staged-item-img-list> — the manifest must
// exist on disk from the moment the item is created, not just once its
// first image lands, otherwise listStagingItems' manifest-exists check
// elsewhere would drop the item from the offline list entirely.
export async function createItemStagingFolder(root, projectName, itemName) {
  const dir = stagingItemDir(root, projectName, itemName, NEW_POSTFIX);
  await mkdir(dir);
  await writeManifestEntries(dir, []);
  return dir;
}

// FIX670.20.3.1: removes a whole item staging folder (or a single file —
// same route handles both). Idempotent (no-op on ENOENT).
export async function rmPath(targetPath) {
  await fetch(`${AGENT_URL}/agent/dir/rmdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath }),
  });
}

async function listEntries(dir) {
  const res = await fetch(`${AGENT_URL}/agent/dir/list?path=${encodeURIComponent(dir)}`);
  if (!res.ok) return [];
  const { entries } = await res.json();
  return entries || [];
}

// FIX680.1.1: enumerates "projects having local data" — every immediate
// subfolder of the staging root, one per project name.
export async function listStagingProjectNames(root) {
  return (await listEntries(root)).filter((e) => e.type === 'folder').map((e) => e.name);
}

// FIX670.20 <process-staged-items-publication>: enumerates every one of a
// project's staged item folders on disk, together with the flag (if any)
// its name carries. `oldRef` is only set for an ' (ex-{oldRef})' folder,
// extracted straight from the postfix text.
export async function listStagingItems(root, projectName) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const entries = await listEntries(projectDir);
  return entries
    .filter((e) => e.type === 'folder')
    .map((e) => {
      const { ref, postfix } = parseItemFolderName(e.name);
      const exMatch = postfix.match(/^ \(ex-(.+)\)$/);
      let flag = 'plain';
      if (postfix === NEW_POSTFIX) flag = 'new';
      else if (postfix === DELETED_ITEM_POSTFIX) flag = 'deleted';
      else if (postfix === CHGED_POSTFIX) flag = 'chged';
      else if (exMatch) flag = 'renamed';
      return {
        dir: `${projectDir}/${e.name}`,
        ref,
        flag,
        oldRef: exMatch ? exMatch[1] : null,
      };
    });
}

// Fetches a staged image's bytes as a Blob — same Agent route the
// reconciliation-on-load effect uses.
export async function fetchStagedImageBlob(path) {
  const res = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  return res.blob();
}

// FIX670.20 'new'-flag branch: rebuilds a brand-new item's image list
// straight from disk — the manifest (file order) plus each file's own
// bytes — so <cmd-publish-all-changes>/<cmd-publish-selection> never depend on imagesByFolderRef
// having been populated this session. A brand-new item has no public
// baseline to merge against, so every manifest entry is simply an Added row.
export async function readStagedItemImages(itemDir) {
  const manifest = await readManifestEntries(itemDir);
  const rows = [];
  for (const { filename, deleted, attrs } of manifest) {
    if (deleted) continue;
    const blob = await fetchStagedImageBlob(`${itemDir}/${filename}`);
    if (!blob) continue;
    rows.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      image_id: null,
      url: URL.createObjectURL(blob),
      filename,
      ...imageAttrsFromManifest(attrs), // FIX670.1.2.2.4: caption/section/is_main
      sort_order: rows.length,
      rotation: 0,
      crop: null,
      added: true,
      chged: false,
      moved: false,
      deleted: false,
      localFile: blob,
      stagedPath: `${itemDir}/${filename}`,
    });
  }
  return rows;
}

// Writes a local (not-yet-published) image's bytes to disk. The source is an
// in-browser File/Blob with no real filesystem path of its own, so this
// base64-encodes it over /agent/dir/image/save.
function writeLocalImageBytes(path, blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const base64 = String(fr.result).split(',')[1];
        await fetch(`${AGENT_URL}/agent/dir/image/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, data: base64 }),
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// FIX670.10: the core sync — called (best-effort, fire-and-forget) after
// every structural or field-level local edit, so the on-disk folder +
// list.txt always mirror the current `images` staging state.
//
// - Nothing pending (every row is a plain public image, no local rows):
//   the whole folder is removed (FIX670.20.3.1) rather than left behind
//   empty.
// - Otherwise: the folder is (re)created — tagged ' (chged)' if this is the
//   first-ever staged change on a published item (FIX670.1.1.2.1) — any
//   local row missing its bytes on disk gets copied in, any file on disk
//   with no matching row anymore gets deleted, and list.txt is rewritten.
// - Each public row's origPosition (FIX670.1.2.2.2) is carried over from
//   whatever the folder's existing manifest already recorded for that
//   filename; a public row seen for the first time gets one assigned now,
//   as its 1-based rank among public rows ordered by `origSortOrder`
//   (the true, once-fetched public order) — never by current `sort_order`.
//   `moved` is then simply: does this row's current rank among public rows
//   (by current `sort_order`) still match that origPosition?
//
// `setImages` is used to patch the newly-assigned `stagedPath` onto rows
// just copied to disk, the same field publishItemImages.js reads/writes.
export async function syncStagingFolder({ root, projectName, itemName, images, setImages }) {
  const pending = images.some((im) => im.added || im.chged || im.moved || im.deleted);
  const existingEntry = await findItemFolderEntry(root, projectName, itemName);
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const dir = existingEntry ? `${projectDir}/${existingEntry.name}` : stagingItemDir(root, projectName, itemName, CHGED_POSTFIX);

  if (!pending) {
    if (existingEntry) await rmPath(dir);
    return;
  }

  // Recover already-assigned origPositions (keyed by filename) before
  // rewriting the manifest, so they never get recomputed.
  const priorByFilename = new Map(
    existingEntry ? (await readManifestEntries(dir)).map((e) => [e.filename, e]) : [],
  );

  await mkdir(dir);

  const localImgs = images.filter((im) => isLocalRow(im));
  const publicImgs = images.filter((im) => !isLocalRow(im));

  // FIX670.1.2.2.2: assign a fresh origPosition, by origSortOrder rank, to
  // any public row this folder has never recorded before.
  const byOrigSortOrder = [...publicImgs].sort((a, b) => (a.origSortOrder ?? a.sort_order) - (b.origSortOrder ?? b.sort_order));
  const origPositionByFilename = new Map();
  byOrigSortOrder.forEach((im, idx) => {
    const prior = priorByFilename.get(im.filename);
    origPositionByFilename.set(im.filename, prior?.origPosition ?? idx + 1);
  });

  // Current rank among public rows only, by current sort_order — the basis
  // FIX670.1.2.2.2's Moved comparison is made on (interleaved local rows
  // never affect a public image's own relative position).
  const byCurrentOrder = [...publicImgs].sort((a, b) => a.sort_order - b.sort_order);
  const currentRankByFilename = new Map(byCurrentOrder.map((im, idx) => [im.filename, idx + 1]));

  const stagedRows = images.filter((im) => isLocalRow(im) || im.chged);
  const keepFilenames = new Set(stagedRows.map((im) => im.filename));

  const onDisk = await listEntries(dir);
  await Promise.all(
    onDisk
      .filter((e) => e.type === 'file' && e.name !== MANIFEST_FILENAME && !keepFilenames.has(e.name))
      .map((e) => rmPath(`${dir}/${e.name}`)),
  );

  const toCopy = stagedRows.filter((im) => im.localFile && !im.stagedPath);
  if (toCopy.length) {
    await Promise.all(toCopy.map((im) => writeLocalImageBytes(`${dir}/${im.filename}`, im.localFile)));
    const copiedIds = new Set(toCopy.map((im) => im.id));
    setImages((prev) =>
      prev.map((im) => (copiedIds.has(im.id) ? { ...im, stagedPath: `${dir}/${im.filename}` } : im)),
    );
  }

  // FIX670.1.2.2.4: caption/section/is_main written for every row (not just
  // chged ones) — cheap redundancy for an unstaged public row (its values
  // already match the server), but keeps this the one place attrs are
  // derived rather than special-casing which rows need it.
  const entries = images.map((im) => {
    if (isLocalRow(im)) {
      return {
        filename: im.filename, origPosition: null, added: true, chged: false, moved: false, deleted: false,
        attrs: imageAttrsToManifest(im),
      };
    }
    const origPosition = origPositionByFilename.get(im.filename);
    const moved = currentRankByFilename.get(im.filename) !== origPosition;
    return {
      filename: im.filename,
      origPosition,
      added: false,
      chged: !!im.chged,
      moved,
      deleted: !!im.deleted,
      attrs: imageAttrsToManifest(im),
    };
  });
  await writeManifestEntries(dir, entries);
}

// FIX670.1 migration: folds any leftover FIX653-era capture-staging data for
// this project into the new FIX670 tree, the first time that project is
// opened after the rename. Each legacy item folder had no list.txt — one is
// synthesized here, listing every file found, unmarked. Best-effort and
// idempotent.
export async function migrateLegacyProjectFolder({ projectId, projectName, root, legacyRoot }) {
  const legacyProjectDir = `${legacyRoot}/${projectId}`;
  const itemEntries = await listEntries(legacyProjectDir);
  for (const entry of itemEntries) {
    if (entry.type !== 'folder') continue;
    const legacyItemDir = `${legacyProjectDir}/${entry.name}`;
    const already = await readManifestEntries(await resolveItemFolderDir(root, projectName, entry.name));
    if (already.length > 0) {
      await rmPath(legacyItemDir);
      continue;
    }
    const files = (await listEntries(legacyItemDir)).filter((e) => e.type === 'file');
    if (files.length === 0) {
      await rmPath(legacyItemDir);
      continue;
    }
    const newDir = stagingItemDir(root, projectName, entry.name, NEW_POSTFIX);
    await mkdir(newDir);
    const copied = [];
    for (const f of files) {
      try {
        const res = await fetch(`${AGENT_URL}/agent/dir/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ src: `${legacyItemDir}/${f.name}`, dst: `${newDir}/${f.name}` }),
        });
        if (res.ok) copied.push(f.name);
      } catch {
        // Best-effort per file.
      }
    }
    await writeManifestEntries(
      newDir,
      copied.map((filename) => ({ filename, origPosition: null, added: true, chged: false, moved: false, deleted: false })),
    );
    await rmPath(legacyItemDir);
  }
  await rmPath(legacyProjectDir);
}

// Mirrors publishItemImages.js's isLocalRow (a locally-staged row carries a
// synthetic string id) — duplicated rather than imported to avoid a
// circular dependency between the two modules.
function isLocalRow(im) {
  return typeof im.id === 'string' && im.id.startsWith('local-');
}
