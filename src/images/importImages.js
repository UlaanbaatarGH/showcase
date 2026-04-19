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

// FileList → { itemName: [{ filename, file }] } keyed by the immediate
// parent folder of each image file. Non-image files and files without a
// parent folder are dropped.
export function scanFiles(fileList) {
  const byItem = new Map();
  for (const file of fileList) {
    const rel = file.webkitRelativePath || file.name;
    const segments = rel.split('/');
    if (segments.length < 2) continue;
    const filename = segments[segments.length - 1];
    const itemName = segments[segments.length - 2];
    if (!isAcceptedImage(filename)) continue;
    if (!byItem.has(itemName)) byItem.set(itemName, []);
    byItem.get(itemName).push({ filename, file });
  }
  return byItem;
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
// per-item plan the dialog renders as a recap.
export function buildImportPlan(scanned, existingByItem) {
  const items = [];
  for (const [itemName, diskFiles] of scanned.entries()) {
    const existing = existingByItem[itemName] || [];
    const cls = classifyItemFiles(diskFiles, existing);
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
