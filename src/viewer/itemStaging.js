// FIX670 Changes & Publication: durable local item staging. Formalizes (and
// replaces) what FIX653 built ad hoc for camera captures alone — a folder per
// item under a staging root on disk, so add/remove/unremove/move survive a
// reload/crash before Publish, not just the raw captured file. FIX653 and
// FIX610.3.8 (and every other local-edit path in ShowcaseImgListEditor.jsx)
// now go through this shared module instead of each keeping its own partial
// copy of the mechanism.
//
// FIX653 durable capture staging: same local Agent server ShowcaseView.jsx /
// publishItemImages.js talk to — no shared module for this literal, matching
// the existing per-file redeclaration convention.
const AGENT_URL = 'http://localhost:3001';

const MANIFEST_FILENAME = 'list.txt';
const REMOVED_SUFFIX = ' (removed)';
// FIX655.2 / FIX657.3.2: staging-folder-name postfixes — a freshly
// <cmd-add-item>-created folder is marked ' (new)'; <cmd-new-item-ref>
// marks a renamed one ' (renamed)', unless it's already ' (new)' (that
// takes priority and isn't overwritten). Purely a disk-naming detail, not
// part of the item's identity — see resolveItemFolderDir/renameItemFolder.
const NEW_POSTFIX = ' (new)';
const RENAMED_POSTFIX = ' (renamed)';

// FIX670.1: the folder segment is the project's literal name (spec text:
// tech/data/staging/{project-name}/{item-folder-ref}), sanitized for
// filesystem safety since a project name is free text, unlike the item ref
// (already a plain zero-padded number).
export function sanitizeSegment(name) {
  return String(name ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || '_';
}

// FIX670.1: dataRoot is cached module-wide — it can't change mid-session
// (same posture as FIX653's original getStagingRoot).
let cachedAgentDataRoot = null;
async function getDataRoot() {
  if (cachedAgentDataRoot == null) {
    const res = await fetch(`${AGENT_URL}/agent/status`);
    const body = await res.json();
    cachedAgentDataRoot = body.dataRoot;
  }
  return cachedAgentDataRoot;
}

// FIX670.1: root renamed from FIX653's capture-staging — tech/data/staging
// is now the one mechanism backing every local-edit path, not just camera
// captures.
export async function getStagingRoot() {
  return `${await getDataRoot()}/staging`;
}

// FIX670.1 migration: capture-staging was FIX653's own pre-FIX670 tree —
// never itself spec'd, keyed by numeric project id, no list.txt manifest.
// Real unpublished camera-capture work can still be sitting there for a
// project whose FIX670-era staging folder has never been created; see
// migrateLegacyProjectFolder below.
export async function getLegacyStagingRoot() {
  return `${await getDataRoot()}/capture-staging`;
}

// FIX670.10.1 / FIX670.10.1.0: the per-item staging folder, Id <folder-staged-item>.
// `postfix` is FIX655.2/FIX657.3.2's ' (new)'/' (renamed)' marker, only
// ever passed by the code that's actively creating/renaming into one of
// those forms — everyone else resolving an *existing* item's folder should
// use resolveItemFolderDir instead, since it may already carry one.
export function stagingItemDir(root, projectName, itemName, postfix = '') {
  return `${root}/${sanitizeSegment(projectName)}/${sanitizeSegment(itemName)}${postfix}`;
}

// FIX655.2 / FIX657.3.2: strips a known postfix off a raw folder name,
// returning the clean ref and which postfix (if any) it carried.
function parseItemFolderName(folderName) {
  if (folderName.endsWith(NEW_POSTFIX)) return { ref: folderName.slice(0, -NEW_POSTFIX.length), postfix: NEW_POSTFIX };
  if (folderName.endsWith(RENAMED_POSTFIX)) return { ref: folderName.slice(0, -RENAMED_POSTFIX.length), postfix: RENAMED_POSTFIX };
  return { ref: folderName, postfix: '' };
}

// FIX655.2 / FIX657: resolves an item's *current* on-disk folder, which may
// carry a ' (new)'/' (renamed)' postfix from earlier — every operational
// lookup (sync on edit, offline image list, rename) should go through this
// instead of the bare stagingItemDir, which only knows the canonical
// no-postfix name. Falls back to that canonical name when nothing exists
// yet (first-ever creation via an ordinary image add, no postfix involved).
export async function resolveItemFolderDir(root, projectName, itemRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(itemRef);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
  return match ? `${projectDir}/${match.name}` : stagingItemDir(root, projectName, itemRef);
}

// FIX657.3.1 / FIX657.3.2: renames an item's staging folder to a new ref,
// keeping its ' (new)' postfix if it already had one, otherwise marking it
// ' (renamed)'. Returns the new dir, or null if there was nothing on disk
// to rename (e.g. the item somehow never got a folder — best-effort, the
// caller still updates the item's display name either way).
export async function renameItemFolder(root, projectName, oldRef, newRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(oldRef);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
  if (!match) return null;
  const { postfix } = parseItemFolderName(match.name);
  const newPostfix = postfix === NEW_POSTFIX ? NEW_POSTFIX : RENAMED_POSTFIX;
  const oldPath = `${projectDir}/${match.name}`;
  const newPath = stagingItemDir(root, projectName, newRef, newPostfix);
  await fetch(`${AGENT_URL}/agent/dir/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return newPath;
}

// FIX670.10.3 / FIX670.10.3.0: the manifest file, Id <file-staged-item-img-list>.
function manifestPath(itemDir) {
  return `${itemDir}/${MANIFEST_FILENAME}`;
}

// FIX670.11 / FIX670.13: a manifest line is a bare filename, or filename +
// ' (removed)' for a public image staged for removal.
function parseManifestLine(line) {
  if (line.endsWith(REMOVED_SUFFIX)) {
    return { filename: line.slice(0, -REMOVED_SUFFIX.length), removed: true };
  }
  return { filename: line, removed: false };
}

function formatManifestLine({ filename, removed }) {
  return removed ? `${filename}${REMOVED_SUFFIX}` : filename;
}

// FIX670.10: reads the item's list.txt (public + local images, display
// order). Returns [] when the file doesn't exist yet — a brand-new /
// not-yet-staged item.
export async function readManifestEntries(itemDir) {
  const res = await fetch(`${AGENT_URL}/file/read?path=${encodeURIComponent(manifestPath(itemDir))}`);
  const body = await res.json().catch(() => ({ content: '' }));
  const content = body.content || '';
  return content.split('\n').map((l) => l.trim()).filter(Boolean).map(parseManifestLine);
}

async function writeManifestEntries(itemDir, entries) {
  const content = entries.map(formatManifestLine).join('\n');
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

// FIX670.20 / FIX670.30: removes a whole item staging folder (or a single
// file — same route handles both). Idempotent (no-op on ENOENT).
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

// FIX680.1.1: enumerates a project's staged items (subfolders that actually
// carry a manifest — an item folder with no list.txt isn't real staged
// state, see FIX670.20).
export async function listStagingItemNames(root, projectName) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const entries = await listEntries(projectDir);
  const names = [];
  for (const e of entries) {
    if (e.type !== 'folder') continue;
    const manifest = await readManifestEntries(`${projectDir}/${e.name}`);
    // FIX655.2: the folder name may carry a ' (new)'/' (renamed)' postfix —
    // that's a disk-naming detail, not part of the item's ref/identity.
    if (manifest.length > 0) names.push(parseItemFolderName(e.name).ref);
  }
  return names;
}

// FIX680.1.1.2: fetches a staged image's bytes as a Blob — same Agent route
// (`/agent/dir/image`) the reconciliation-on-load effect already uses.
export async function fetchStagedImageBlob(path) {
  const res = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  return res.blob();
}

// FIX670.10: writes a local (not-yet-published) image's bytes to disk. The
// source is an in-browser File/Blob (file picker, drag-drop, or a fetched
// watched-folder blob) with no real filesystem path of its own, so — unlike
// FIX653's camera-capture copy (source already sits on disk, plain
// /agent/dir/copy) — this base64-encodes it over /agent/dir/image/save.
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

// FIX670.1 / FIX670.10-FIX670.14 / FIX670.20: the core sync — called
// (best-effort, fire-and-forget) after every structural local edit
// (add / remove / unremove / move) so the on-disk folder + list.txt always
// mirror the current `images` staging state.
//
// - Nothing pending (every row's status is '' and there's no local row left):
//   the whole folder is removed (FIX670.20) rather than left behind empty.
// - Otherwise: the folder is (re)created, any local row missing its bytes on
//   disk gets copied in, any file on disk with no matching local row anymore
//   gets deleted (FIX670.12), and list.txt is rewritten to the current
//   filename/removed/order state (FIX670.10/.11/.13/.14).
//
// `setImages` is used to patch the newly-assigned `stagedPath` onto rows just
// copied to disk, the same field FIX653's camera flow and publishItemImages.js
// already read/write.
export async function syncStagingFolder({ root, projectName, itemName, images, setImages }) {
  // FIX655.2/FIX657: resolve whatever actually exists on disk for this ref
  // (bare, ' (new)', or ' (renamed)') rather than assuming the bare name —
  // an item created via <cmd-add-item> already has a postfixed folder by
  // the time its first image lands here.
  const dir = await resolveItemFolderDir(root, projectName, itemName);
  const pending = images.some((im) => im.status);
  if (!pending) {
    await rmPath(dir);
    return;
  }
  await mkdir(dir);

  const localRows = images.filter((im) => isLocalRow(im));
  const keepFilenames = new Set(localRows.map((im) => im.filename));

  // FIX670.12: a local image's file is deleted from the folder the moment
  // it's no longer in the staged list (e.g. just Removed) — public/removed
  // rows never had a physical copy here to begin with.
  const onDisk = await listEntries(dir);
  await Promise.all(
    onDisk
      .filter((e) => e.type === 'file' && e.name !== MANIFEST_FILENAME && !keepFilenames.has(e.name))
      .map((e) => rmPath(`${dir}/${e.name}`)),
  );

  const toCopy = localRows.filter((im) => !im.stagedPath);
  if (toCopy.length) {
    await Promise.all(toCopy.map((im) => writeLocalImageBytes(`${dir}/${im.filename}`, im.localFile)));
    const copiedIds = new Set(toCopy.map((im) => im.id));
    setImages((prev) =>
      prev.map((im) => (copiedIds.has(im.id) ? { ...im, stagedPath: `${dir}/${im.filename}` } : im)),
    );
  }

  // FIX670.10/.11/.13/.14: list.txt mirrors the current display order,
  // marking public rows staged for removal.
  const entries = images.map((im) => ({ filename: im.filename, removed: im.status === 'Removed' }));
  await writeManifestEntries(dir, entries);
}

// FIX670.1 migration: folds any leftover FIX653-era capture-staging data for
// this project into the new FIX670 tree, the first time that project is
// opened after the rename — run from ShowcaseView.jsx's reconciliation
// effect, which is the one place that already has both the numeric project
// id (the legacy key) and the project name (the new key) at hand, so no
// out-of-band lookup of "what's project 5's name" is ever needed. Each
// legacy item folder had no list.txt (FIX653 predates it) — one is
// synthesized here, listing every file found, unmarked (nothing was ever
// staged for removal under the old mechanism). Best-effort and idempotent:
// safe to call on every project open, a no-op once migrated.
export async function migrateLegacyProjectFolder({ projectId, projectName, root, legacyRoot }) {
  const legacyProjectDir = `${legacyRoot}/${projectId}`;
  const itemEntries = await listEntries(legacyProjectDir);
  for (const entry of itemEntries) {
    if (entry.type !== 'folder') continue;
    const legacyItemDir = `${legacyProjectDir}/${entry.name}`;
    const newDir = stagingItemDir(root, projectName, entry.name);
    // Already migrated (or already has FIX670-era staged state) — just
    // clear the leftover legacy copy.
    const already = await readManifestEntries(newDir);
    if (already.length > 0) {
      await rmPath(legacyItemDir);
      continue;
    }
    const files = (await listEntries(legacyItemDir)).filter((e) => e.type === 'file');
    if (files.length === 0) {
      await rmPath(legacyItemDir);
      continue;
    }
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
        // Best-effort per file — a failed copy just leaves that one image
        // out of the migrated manifest rather than aborting the rest.
      }
    }
    await writeManifestEntries(newDir, copied.map((filename) => ({ filename, removed: false })));
    await rmPath(legacyItemDir);
  }
  await rmPath(legacyProjectDir);
}

// FIX610.3.1: mirrors publishItemImages.js's isLocalRow (a locally-staged row
// carries a synthetic string id) — duplicated rather than imported to avoid a
// circular dependency between the two modules (publishItemImages.js will
// import this module for FIX670.30's cleanup).
function isLocalRow(im) {
  return typeof im.id === 'string' && im.id.startsWith('local-');
}
