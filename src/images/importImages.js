// FIX371: Image file import from hard disk — logic (no React).
// Takes a FileList produced by <input type="file" webkitdirectory>,
// groups files by item folder, and classifies each against the project's
// existing images using the _v{n} versioning rule (FIX371.5.3).

const ACCEPTED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function isAcceptedImage(filename) {
  const i = filename.lastIndexOf('.');
  if (i < 0) return false;
  return ACCEPTED_EXT.has(filename.slice(i + 1).toLowerCase());
}

// 'foo_v3.jpg' → { base: 'foo', version: 3, ext: 'jpg' }
// 'foo.jpg'    → { base: 'foo', version: 0, ext: 'jpg' }
export function parseVersion(filename) {
  const m = filename.match(/^(.*)_v(\d+)\.([^.]+)$/);
  if (m) return { base: m[1], version: Number(m[2]), ext: m[3].toLowerCase() };
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return { base: filename, version: 0, ext: '' };
  return {
    base: filename.slice(0, dot),
    version: 0,
    ext: filename.slice(dot + 1).toLowerCase(),
  };
}

// FileList → Map<itemName, { files: [{filename, file}], sortList: string[] }>
// keyed by the immediate parent folder of each image file. Non-image files
// (other than sort.txt — FIX371.1.2.2) and files without a parent folder
// are dropped. sortList holds the filenames listed in the item's sort.txt,
// in display order; empty when the file is absent or unreadable.
export async function scanFiles(fileList) {
  const byItem = new Map();
  const sortPromises = [];
  for (const file of fileList) {
    const rel = file.webkitRelativePath || file.name;
    const segments = rel.split('/');
    if (segments.length < 2) continue;
    const filename = segments[segments.length - 1];
    const itemName = segments[segments.length - 2];
    if (!byItem.has(itemName)) byItem.set(itemName, { files: [], sortList: [] });
    if (filename === 'sort.txt') {
      sortPromises.push(
        file.text().then((txt) => {
          byItem.get(itemName).sortList = parseSortList(txt);
        }).catch(() => {
          // Unreadable sort.txt → treat as absent.
        }),
      );
      continue;
    }
    if (!isAcceptedImage(filename)) continue;
    byItem.get(itemName).files.push({ filename, file });
  }
  await Promise.all(sortPromises);
  // Drop items that ended up with neither images nor sort entries (e.g. an
  // item folder that contained only sort.txt with no listed files).
  for (const [name, entry] of byItem) {
    if (entry.files.length === 0) byItem.delete(name);
  }
  return byItem;
}

// Parse a sort.txt body: one filename per line; blank lines and lines
// starting with '#' are ignored. Whitespace around each filename is trimmed.
export function parseSortList(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    out.push(line);
  }
  return out;
}

// Stable-sort disk files by their position in sortList. Files not listed
// in sortList go after the listed ones, keeping their original scan order.
function orderBySortList(diskFiles, sortList) {
  if (!sortList || sortList.length === 0) return diskFiles;
  const pos = new Map(sortList.map((f, i) => [f, i]));
  return diskFiles
    .map((f, i) => ({ f, listed: pos.get(f.filename), scan: i }))
    .sort((a, b) => {
      const al = a.listed ?? Infinity;
      const bl = b.listed ?? Infinity;
      if (al !== bl) return al - bl;
      return a.scan - b.scan;
    })
    .map((x) => x.f);
}

// Classify each disk file vs the project's current state for one item.
// `existing` is the array of {folder_image_id, image_id, storage_key}
// returned by GET /api/projects/:id/existing-images.
function classifyItemFiles(diskFiles, existing) {
  // Max existing version per base.
  const existingByBase = new Map();
  for (const ex of existing) {
    const fname = (ex.storage_key || '').split('/').pop() || '';
    const { base, version } = parseVersion(fname);
    const prev = existingByBase.get(base);
    if (!prev || prev.version < version) {
      existingByBase.set(base, { ...ex, version, filename: fname });
    }
  }
  const newFiles = [];
  const updateFiles = [];
  const ignoreFiles = [];
  for (const disk of diskFiles) {
    const { base, version } = parseVersion(disk.filename);
    const prev = existingByBase.get(base);
    if (!prev) {
      // FIX371.5.3.2
      newFiles.push(disk);
    } else if (version > prev.version) {
      // FIX371.5.3.4
      updateFiles.push({ ...disk, replaces_image_id: prev.image_id });
    } else {
      // FIX371.5.3.3
      ignoreFiles.push(disk);
    }
  }
  return { newFiles, updateFiles, ignoreFiles };
}

// Given the full scanned map and the existing-images payload, produce the
// per-item plan the dialog renders as a recap. Disk files are reordered
// per FIX371.1.2.2 using the item's sort.txt before being classified, so
// uploads happen in the display order the user defined.
export function buildImportPlan(scanned, existingByItem) {
  const items = [];
  for (const [itemName, entry] of scanned.entries()) {
    const ordered = orderBySortList(entry.files, entry.sortList);
    const existing = existingByItem[itemName] || [];
    const cls = classifyItemFiles(ordered, existing);
    items.push({
      name: itemName,
      newCount: cls.newFiles.length,
      updateCount: cls.updateFiles.length,
      ignoreCount: cls.ignoreFiles.length,
      newFiles: cls.newFiles,
      updateFiles: cls.updateFiles,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
