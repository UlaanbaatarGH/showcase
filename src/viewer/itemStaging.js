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
// FIX610.3.1.1: a manifest line for a newly-added, not-yet-published image
// carries this same-worded ' (new)' tag (line-level, distinct from
// NEW_POSTFIX below, which tags a whole item *folder*).
const NEW_SUFFIX = ' (new)';
// FIX611.1: a public image locally re-saved (crop/rotate) carries this tag
// on its manifest line — the durable record that its staged bytes now
// differ from the published ones, mirroring NEW_SUFFIX's role for a
// brand-new image.
const CHANGED_SUFFIX = ' (chged)';
// FIX655.2 / FIX657.3.2 / FIX658.2.1.1: staging-folder-name postfixes — a
// freshly <cmd-add-item>-created folder is marked ' (new)'; <cmd-new-item-ref>
// marks a renamed one ' (ex-{old-ref})' (the ref it carried just before this
// rename), unless it's already ' (new)' or already carries an ' (ex-...)'
// tag from an earlier rename (either takes priority and isn't overwritten,
// so the folder name keeps tracing back to its very first on-disk ref);
// <cmd-delete-item> marks a public item's folder ' (removed)' (same literal
// text as REMOVED_SUFFIX above, but that one tags a single manifest *line*,
// not a folder name — distinct mechanisms that happen to share wording).
// Purely a disk-naming detail, not part of the item's identity — see
// resolveItemFolderDir/renameItemFolder.
const NEW_POSTFIX = ' (new)';
const REMOVED_ITEM_POSTFIX = ' (removed)';
const EX_POSTFIX_RE = / \(ex-.+\)$/;

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
// `postfix` is FIX655.2/FIX657.3.2's ' (new)'/' (ex-{old-ref})' marker, only
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
  if (folderName.endsWith(REMOVED_ITEM_POSTFIX)) return { ref: folderName.slice(0, -REMOVED_ITEM_POSTFIX.length), postfix: REMOVED_ITEM_POSTFIX };
  const exMatch = folderName.match(EX_POSTFIX_RE);
  if (exMatch) return { ref: folderName.slice(0, -exMatch[0].length), postfix: exMatch[0] };
  return { ref: folderName, postfix: '' };
}

// FIX655.2 / FIX657: resolves an item's *current* on-disk folder, which may
// carry a ' (new)'/' (ex-{old-ref})' postfix from earlier — every operational
// lookup (sync on edit, offline image list, rename) should go through this
// instead of the bare stagingItemDir. A genuinely new item already has its
// ' (new)'-postfixed folder by the time this is reached (ensureStagingFolder
// / createItemStagingFolder creates it at <cmd-add-item> time, per
// FIX655.2 — before any image can be added to it), so the fallback below —
// for an existing/published item's first-ever local edit — is a bare,
// unpostfixed folder: FIX655.2 scopes the ' (new)' tag to <cmd-add-item>
// alone, nothing spec's it for a plain item that merely gained a local edit.
export async function resolveItemFolderDir(root, projectName, itemRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(itemRef);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
  return match ? `${projectDir}/${match.name}` : stagingItemDir(root, projectName, itemRef);
}

// FIX657.3.1 / FIX657.3.2: renames an item's staging folder to a new ref,
// keeping its ' (new)' postfix or an already-present ' (ex-...)' tag as-is
// (either takes priority), otherwise tagging it ' (ex-{oldRef})' with the
// ref it carried right before this rename. Returns the new dir, or null if
// there was nothing on disk to rename (e.g. the item somehow never got a
// folder — best-effort, the caller still updates the item's display name
// either way).
export async function renameItemFolder(root, projectName, oldRef, newRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(oldRef);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
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

// FIX657.5: reverts a real item's staged rename — used when the admin sets
// the ref back to what it was before any <cmd-new-item-ref> use this
// session, clearing the <file-flag-chged-item-ref> tag entirely (bare
// name) rather than re-tagging it with itself. No-op if the folder isn't
// currently ' (ex-...)'-tagged. Removes the folder outright if nothing
// else is staged for it (FIX670.20) rather than leaving an empty bare
// folder behind.
export async function clearRenameTag(root, projectName, currentRef) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(currentRef);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
  if (!match) return null;
  const { postfix } = parseItemFolderName(match.name);
  const oldPath = `${projectDir}/${match.name}`;
  if (!EX_POSTFIX_RE.test(postfix)) return oldPath; // nothing to clear
  const manifest = await readManifestEntries(oldPath);
  if (manifest.length === 0) {
    await rmPath(oldPath);
    return null;
  }
  const newPath = stagingItemDir(root, projectName, currentRef, '');
  await fetch(`${AGENT_URL}/agent/dir/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return newPath;
}

// FIX658.2.1.1: tags a public item's staging folder ' (removed)' — deletion
// itself is deferred to publish (there's no delete-folder API for a real DB
// item), this just marks the terminal state on disk, overriding whatever
// ' (new)'/' (ex-...)' postfix it carried before. mkdir's a fresh
// ' (removed)' folder if nothing was staged yet, so the tag survives even
// when the item had no prior local edits.
export async function markItemFolderRemoved(root, projectName, ref) {
  const projectDir = `${root}/${sanitizeSegment(projectName)}`;
  const wanted = sanitizeSegment(ref);
  const entries = await listEntries(projectDir);
  const match = entries.find((e) => e.type === 'folder' && parseItemFolderName(e.name).ref === wanted);
  const newPath = stagingItemDir(root, projectName, ref, REMOVED_ITEM_POSTFIX);
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

// FIX670.10.3 / FIX670.10.3.0: the manifest file, Id <file-staged-item-img-list>.
function manifestPath(itemDir) {
  return `${itemDir}/${MANIFEST_FILENAME}`;
}

// FIX670.11 / FIX670.13 / FIX610.3.1.1 / FIX611.1: a manifest line is a bare
// filename, filename + ' (removed)' for a public image staged for removal,
// filename + ' (new)' for a not-yet-published Added image, or filename +
// ' (chged)' for a public image locally re-saved (crop/rotate) — the
// durable on-disk record of that status, read back on reconciliation
// instead of re-derived from scratch.
function parseManifestLine(line) {
  if (line.endsWith(REMOVED_SUFFIX)) {
    return { filename: line.slice(0, -REMOVED_SUFFIX.length), removed: true, added: false, chged: false };
  }
  if (line.endsWith(NEW_SUFFIX)) {
    return { filename: line.slice(0, -NEW_SUFFIX.length), removed: false, added: true, chged: false };
  }
  if (line.endsWith(CHANGED_SUFFIX)) {
    return { filename: line.slice(0, -CHANGED_SUFFIX.length), removed: false, added: false, chged: true };
  }
  return { filename: line, removed: false, added: false, chged: false };
}

function formatManifestLine({ filename, removed, added, chged }) {
  if (removed) return `${filename}${REMOVED_SUFFIX}`;
  if (added) return `${filename}${NEW_SUFFIX}`;
  if (chged) return `${filename}${CHANGED_SUFFIX}`;
  return filename;
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

// FIX655.2 <cmd-add-item>: creates a freshly-added item's staging folder
// together with its (empty) <file-staged-item-img-list> — the manifest must
// exist on disk from the moment the item is created, not just once its
// first image lands, otherwise listStagingItemNames' manifest-exists check
// below would drop the item from the offline list entirely.
export async function createItemStagingFolder(root, projectName, itemName) {
  const dir = stagingItemDir(root, projectName, itemName, NEW_POSTFIX);
  await mkdir(dir);
  await writeManifestEntries(dir, []);
  return dir;
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

// FIX652.2: enumerates every one of a project's staged item folders on
// disk, together with the flag (if any) its name carries — both
// <cmd-publish-changes> (FIX652.2.1-.2.4) and every mode-aware item-list
// display (ShowcaseView.jsx's reconciliation effect, backendLocal.js's
// buildLocalFolders) drive their per-item state off this. `oldRef` is only
// set for an ' (ex-{oldRef})' (<file-flag-chged-item-ref>) folder,
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
      else if (postfix === REMOVED_ITEM_POSTFIX) flag = 'removed';
      else if (exMatch) flag = 'renamed';
      return {
        dir: `${projectDir}/${e.name}`,
        ref,
        flag,
        oldRef: exMatch ? exMatch[1] : null,
      };
    });
}

// FIX680.1.1.2: fetches a staged image's bytes as a Blob — same Agent route
// (`/agent/dir/image`) the reconciliation-on-load effect already uses.
export async function fetchStagedImageBlob(path) {
  const res = await fetch(`${AGENT_URL}/agent/dir/image?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  return res.blob();
}

// FIX652.2.3: rebuilds a <file-flag-new-item> item's image list straight
// from disk — the manifest (file order) plus each file's own bytes — so
// <cmd-publish-changes> never depends on imagesByFolderRef having been
// populated this session. A brand-new item has no public baseline to merge
// against (unlike the reconciliation-on-load effect), so every manifest
// entry is simply an Added row; a 'removed' entry shouldn't occur here
// (removing a not-yet-published image deletes its row outright, per
// FIX610.3.2) but is skipped defensively rather than trusted.
export async function readStagedItemImages(itemDir) {
  const manifest = await readManifestEntries(itemDir);
  const rows = [];
  for (const { filename, removed } of manifest) {
    if (removed) continue;
    const blob = await fetchStagedImageBlob(`${itemDir}/${filename}`);
    if (!blob) continue;
    rows.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      image_id: null,
      url: URL.createObjectURL(blob),
      filename,
      caption: '',
      section: '',
      is_main: false,
      sort_order: rows.length,
      rotation: 0,
      crop: null,
      status: 'Added',
      localFile: blob,
      stagedPath: `${itemDir}/${filename}`,
    });
  }
  return rows;
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
  // (bare, ' (new)', or ' (ex-...)') rather than assuming the bare name —
  // an item created via <cmd-add-item> already has a postfixed folder by
  // the time its first image lands here.
  const dir = await resolveItemFolderDir(root, projectName, itemName);
  const pending = images.some((im) => im.status);
  if (!pending) {
    await rmPath(dir);
    return;
  }
  await mkdir(dir);

  // FIX611.1: a public image locally re-saved (crop/rotate) has real staged
  // bytes on disk too, just like a not-yet-published Added row — both are
  // tracked here by the same `stagedPath`/`localFile` fields.
  const stagedRows = images.filter((im) => isLocalRow(im) || im.status === 'Changed');
  const keepFilenames = new Set(stagedRows.map((im) => im.filename));

  // FIX670.12: a local image's file is deleted from the folder the moment
  // it's no longer in the staged list (e.g. just Removed) — public/removed
  // rows never had a physical copy here to begin with.
  const onDisk = await listEntries(dir);
  await Promise.all(
    onDisk
      .filter((e) => e.type === 'file' && e.name !== MANIFEST_FILENAME && !keepFilenames.has(e.name))
      .map((e) => rmPath(`${dir}/${e.name}`)),
  );

  // FIX610.3.6.1: a caption/section/main-only 'Changed' row has no image
  // bytes to write at all (just the manifest tag below) -- only copy when
  // there's an actual pending blob, or this would try to FileReader a
  // undefined localFile.
  const toCopy = stagedRows.filter((im) => im.localFile && !im.stagedPath);
  if (toCopy.length) {
    await Promise.all(toCopy.map((im) => writeLocalImageBytes(`${dir}/${im.filename}`, im.localFile)));
    const copiedIds = new Set(toCopy.map((im) => im.id));
    setImages((prev) =>
      prev.map((im) => (copiedIds.has(im.id) ? { ...im, stagedPath: `${dir}/${im.filename}` } : im)),
    );
  }

  // FIX670.10/.11/.13/.14 / FIX610.3.1.1 / FIX611.1: list.txt mirrors the
  // current display order, marking public rows staged for removal or
  // locally re-saved (chged), and local rows staged as Added — the change
  // status itself, not just the filename, must survive on disk.
  const entries = images.map((im) => ({
    filename: im.filename,
    removed: im.status === 'Removed',
    added: im.status === 'Added',
    chged: im.status === 'Changed',
  }));
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
    // Already migrated (or already has FIX670-era staged state) — just
    // clear the leftover legacy copy.
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
    // FIX655.2: no folder exists on the public site either, so this
    // first-ever local folder is marked ' (new)' too.
    const newDir = stagingItemDir(root, projectName, entry.name, ' (new)');
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
