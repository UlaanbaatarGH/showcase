// FIX370: Google Sheet import logic (no React).
// The UI component calls these functions to parse a sheet URL, fetch the
// tabs, run consistency checks, and build the plan that the backend applies.

const FOLDER_COL = '#';
// FIX370.2.1.7: optional column carrying a rename command for the current
// '#' (or, per FIX370.2.1.7.2, the ref to create a new item under).
const FOLDER_NEW_COL = '# new';

// ---------- URL + fetch ----------

export function parseGsheetUrl(url) {
  if (!url) return null;
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  return {
    sheetId: idMatch[1],
    gid: gidMatch ? gidMatch[1] : '0',
  };
}

async function fetchGvizCsv(sheetId, params) {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
  const qs = new URLSearchParams({ tqx: 'out:csv', ...params });
  const r = await fetch(`${base}?${qs}`);
  if (!r.ok) return null;
  const text = await r.text();
  // When a sheet name doesn't exist Google sometimes returns a 200 with an
  // HTML error page. Detect + treat as "not found".
  if (text.trim().startsWith('<')) return null;
  return text;
}

async function fetchExportCsv(sheetId, gid) {
  // /export?format=csv preserves every cell regardless of the column's
  // inferred type — unlike gviz, which drops non-numeric text from a column
  // Google has typed as 'number' (e.g. leading-zero-padded '099', '100').
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const text = await r.text();
  if (text.trim().startsWith('<')) return null;
  return text;
}

export async function fetchMainCsv(sheetId, gid) {
  const text = await fetchExportCsv(sheetId, gid);
  if (text == null) {
    throw new Error(
      'Could not fetch the main sheet. Make sure the sheet is shared as ' +
      '"Anyone with the link can view" and the URL points to the tab you ' +
      'want to import.',
    );
  }
  return text;
}

export async function fetchSetupCsv(sheetId) {
  // The setup tab is optional. gviz silently falls back to some default
  // content when the requested sheet name doesn't exist; that content is
  // not predictable across workbooks (sometimes the main sheet, sometimes
  // a list of its header names). Detect the fallback by asking for a
  // deliberately-bogus sheet name and comparing: if 'setup' returns the
  // same thing, no setup tab exists.
  const setupText = await fetchGvizCsv(sheetId, { sheet: 'setup' });
  if (setupText == null) return null;
  const bogusName = `__showcase_probe_${Math.random().toString(36).slice(2)}__`;
  const fallbackText = await fetchGvizCsv(sheetId, { sheet: bogusName });
  if (fallbackText != null && setupText.trim() === fallbackText.trim()) return null;
  return setupText;
}

// ---------- CSV parser (RFC 4180-ish) ----------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // skip; \n will finalize
    } else if (c === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Normalize a cell value for equality comparison between the gsheet and
// the stored property: Unicode NFC, convert non-breaking space to regular
// space, strip zero-width characters and BOM, then trim.
function normalizeForCompare(v) {
  return String(v ?? '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .trim();
}

function isRowBlank(row) {
  return row.every((c) => (c ?? '').trim() === '');
}

// ---------- Consistency checks + plan building ----------

export function buildPlan({ mainCsv, setupCsv, project }) {
  const errors = [];
  const mainRows = parseCsv(mainCsv);
  if (mainRows.length === 0) {
    return { errors: ['The main sheet is empty.'] };
  }
  const headers = (mainRows[0] || []).map((h) => (h ?? '').trim());
  const dataRows = mainRows.slice(1);

  // 2.1.1 — '#' column mandatory
  const folderColIdx = headers.indexOf(FOLDER_COL);
  if (folderColIdx < 0) {
    errors.push("FIX370.2.1.1: a '#' column is mandatory in the main sheet.");
  }
  // FIX370.2.1.7 — optional '# new' column (rename command, not a property).
  const folderNewColIdx = headers.indexOf(FOLDER_NEW_COL);

  // 2.1.2 — unique column headers
  {
    const seen = new Set();
    for (const h of headers) {
      if (!h) continue;
      if (seen.has(h)) {
        errors.push(`FIX370.2.1.2: duplicate column header "${h}".`);
      } else {
        seen.add(h);
      }
    }
  }

  // Property header columns (non-'#', non-'# new', non-blank).
  const propHeaders = headers
    .map((h, idx) => ({ label: h, idx }))
    .filter((c) => c.label && c.idx !== folderColIdx && c.idx !== folderNewColIdx);

  // 2.1.3 / 2.1.4 / 2.1.5 — row-level checks only run when the '#' column
  // exists; otherwise per-row '#' errors would just be noise flowing from
  // the already-reported 2.1.1 failure.
  const rowFolderNames = [];
  if (folderColIdx >= 0) {
    const seen = new Map();
    dataRows.forEach((row, i) => {
      if (isRowBlank(row)) {
        rowFolderNames.push(null);
        return;
      }
      const name = (row[folderColIdx] ?? '').trim();
      if (!name) {
        errors.push(`FIX370.2.1.3: row ${i + 2} has a blank '#' value.`);
        rowFolderNames.push(null);
        return;
      }
      if (seen.has(name)) {
        errors.push(
          `FIX370.2.1.4: '#' value "${name}" appears on rows ${seen.get(name) + 2} and ${i + 2}.`,
        );
        rowFolderNames.push(null);
        return;
      }
      seen.set(name, i);
      rowFolderNames.push(name);
    });
  }

  // Setup sheet parse (optional).
  // FIX370.1.2.1: each non-blank row has three columns —
  //   col 0: property id (optional, blank = "new property")
  //   col 1: property name — if it ends with "(*)" this row is the main
  //          property used by the recap display (FIX370.1.2.1.2.1)
  //   col 2: optional short name (FIX370.1.2.1.3 / <property-short-name>)
  let setupEntries = null;
  if (setupCsv != null) {
    const setupRows = parseCsv(setupCsv).filter((r) => !isRowBlank(r));
    setupEntries = [];
    const MAIN_MARK = '(*)';
    for (let i = 0; i < setupRows.length; i++) {
      const row = setupRows[i];
      const idStr = (row[0] ?? '').trim();
      let label = (row[1] ?? '').trim();
      const shortLabel = (row[2] ?? '').trim() || null;
      if (!label) continue;
      // '#' is the folder-name column, not a property — skip if it shows up
      // in the setup sheet (e.g. copy-paste of main-sheet headers).
      if (label === FOLDER_COL) continue;
      // FIX370.1.2.1.2.1: name ending with "(*)" flags this row as the main
      // property. Strip the marker so the stored label matches the header.
      let main = false;
      if (label.endsWith(MAIN_MARK)) {
        main = true;
        label = label.slice(0, -MAIN_MARK.length).trim();
        if (!label) continue;
      }
      const id = idStr === '' ? null : Number(idStr);
      if (idStr !== '' && !Number.isInteger(id)) {
        errors.push(`FIX370 setup sheet: row ${i + 1} has a non-integer id "${idStr}".`);
        continue;
      }
      setupEntries.push({ label, id, main, shortLabel });
    }
  }

  const projectProps = project.properties || [];
  const propByLabel = new Map(projectProps.map((p) => [p.label, p]));
  const propById = new Map(projectProps.map((p) => [p.id, p]));

  // Resolution: for each property header, figure out current/new/renamed.
  const newProperties = [];
  const renames = [];
  const headerToFinalLabel = new Map();

  // Map from a main-sheet header (full or short name) to its setup entry.
  // Built only when a setup sheet is provided. Unmatched main-sheet
  // columns are silently skipped (FIX370.2.2.1 updated).
  const setupByMainHeader = new Map();
  if (setupCsv != null) {
    // 2.2.2 — all ids in setup must exist in the project.
    for (const e of setupEntries) {
      if (e.id != null && !propById.has(e.id)) {
        errors.push(`FIX370.2.2.2: setup sheet references unknown property id ${e.id}.`);
      }
    }
    // 2.2.3 — a setup entry with no id means "new property"; its name must
    // not collide with an existing property in the project.
    for (const e of setupEntries) {
      if (e.id == null && propByLabel.has(e.label)) {
        errors.push(
          `FIX370.2.2.3: property "${e.label}" cannot be declared as new — it already exists.`,
        );
      }
    }
    // 2.2.4 — a setup entry with an id must not clash with an existing
    // property that has the same name but a different id.
    for (const e of setupEntries) {
      if (e.id == null) continue;
      const byName = propByLabel.get(e.label);
      if (byName && byName.id !== e.id) {
        errors.push(
          `FIX370.2.2.4: property "${e.label}" already exists with id ${byName.id}, not id ${e.id}.`,
        );
      }
    }
    // FIX370.2.2.1 (updated): the setup sheet lists only the properties
    // to be uploaded — main-sheet columns missing from setup are skipped,
    // not flagged. A main-sheet header may match a setup entry by full
    // name OR short name. Two setup entries matching the same main
    // header is still wrong (ambiguous mapping).
    for (const col of propHeaders) {
      const matches = setupEntries.filter(
        (e) => e.label === col.label || (e.shortLabel && e.shortLabel === col.label),
      );
      if (matches.length === 0) continue; // unlisted → skip silently
      if (matches.length > 1) {
        errors.push(
          `FIX370.2.2.1: main-sheet column "${col.label}" matches ${matches.length} setup rows.`,
        );
        continue;
      }
      setupByMainHeader.set(col.label, matches[0]);
    }
    // Build resolution from setup: new entries (no id) → create; entries with
    // id + label differing from current → rename. The optional short label
    // from the setup row is carried into the payload for new properties.
    // Only setup entries that are actually used by the main sheet are
    // applied — listing an unused entry has no effect.
    const usedEntries = new Set(setupByMainHeader.values());
    for (const e of setupEntries) {
      if (!usedEntries.has(e)) continue;
      if (e.id == null) {
        if (!propByLabel.has(e.label)) {
          newProperties.push({ label: e.label, short_label: e.shortLabel ?? null });
        }
      } else {
        const existing = propById.get(e.id);
        if (existing && existing.label !== e.label) {
          renames.push({ id: e.id, label: e.label });
        }
      }
    }
    // headerToFinalLabel maps each main-sheet header to the property
    // label as it will be stored after import (rename-aware). Unlisted
    // headers don't appear → the updates loop will skip them.
    for (const [mainLabel, e] of setupByMainHeader) {
      headerToFinalLabel.set(mainLabel, e.label);
    }
  } else {
    // 2.1.6.1 — no setup sheet → every main-sheet property header must exist.
    for (const col of propHeaders) {
      if (!propByLabel.has(col.label)) {
        errors.push(`FIX370.2.1.6.1: property "${col.label}" does not exist in the project (and no setup sheet was provided).`);
      } else {
        headerToFinalLabel.set(col.label, col.label);
      }
    }
  }

  if (errors.length > 0) return { errors };

  // FIX370.3.2.2.2.3/4: find the "Main" property in the setup sheet (if any)
  // so the recap can postfix each folder with its value under that property.
  // The main entry is matched against any main-sheet header by full or
  // short name (FIX370.2.2.1 updated).
  const mainEntry = setupEntries?.find((e) => e.main) ?? null;
  const mainColIdx = mainEntry
    ? (propHeaders.find((c) => {
        const matched = setupByMainHeader.get(c.label);
        return matched === mainEntry;
      })?.idx ?? null)
    : null;

  // Build new folders + updates.
  const projectFolderNames = new Set((project.folders || []).map((f) => f.name));
  const folderByName = new Map((project.folders || []).map((f) => [f.name, f]));
  // FIX370.2.2.1 (updated): only the property columns that are actually
  // listed in the setup sheet (matched by full or short name) participate
  // in the import. The rest are silently dropped.
  const importedPropHeaders = setupCsv != null
    ? propHeaders.filter((c) => setupByMainHeader.has(c.label))
    : propHeaders;
  // Resolve each imported header to the property id it will carry after
  // import. null = brand-new property.
  const labelToFinalId = new Map();
  for (const col of importedPropHeaders) {
    if (setupCsv != null) {
      const e = setupByMainHeader.get(col.label);
      labelToFinalId.set(col.label, e?.id ?? null);
    } else {
      labelToFinalId.set(col.label, propByLabel.get(col.label)?.id ?? null);
    }
  }

  // FIX370.3.2.2.2.5 / <setup-property-tagged-deleted>: recap the folders
  // that will be tagged as deleted after the import (i.e. the rows where
  // the deletion property's value is non-blank). null = feature disabled.
  const deletedPropertyId = project.deleted_property_id ?? null;
  const deletedColIdx =
    deletedPropertyId != null
      ? (propHeaders.find(
          (c) => labelToFinalId.get(c.label) === deletedPropertyId,
        )?.idx ?? null)
      : null;

  const newFolderNames = [];
  const newFolderDisplays = [];
  const updatedFolderDisplays = [];
  const deletedFolderDisplays = [];
  const renamedFolders = [];
  const updates = [];

  dataRows.forEach((row, i) => {
    const name = rowFolderNames[i];
    if (!name) return;
    const isNew = !projectFolderNames.has(name);
    const existingFolder = folderByName.get(name);
    const newRefRaw = folderNewColIdx >= 0 ? (row[folderNewColIdx] ?? '').trim() : '';
    // FIX370.2.1.7: '# new' is a command to change the current '#' (folder
    // name), not an item property.
    // FIX370.2.1.7.1: no value, or equal to '#' -> nothing to do.
    // FIX370.2.1.7.2: '#' doesn't exist yet -> '# new' (if not blank) is
    // taken instead of '#' to create the new item.
    let effectiveName = name;
    if (!isNew) {
      if (newRefRaw && newRefRaw !== name) {
        effectiveName = newRefRaw;
        renamedFolders.push({ id: existingFolder.id, from: name, to: newRefRaw });
      }
    } else if (newRefRaw) {
      effectiveName = newRefRaw;
    }
    let display = effectiveName;
    if (mainColIdx != null) {
      const v = (row[mainColIdx] ?? '').trim();
      if (v) display = `${effectiveName} — ${v}`;
    }
    // FIX370.3.2.2.2.5.1 (updated): an item is recapped as 'Deleted' only
    // when the deletion property is non-blank in the sheet AND blank or
    // missing in the DB — i.e. the import is the act of tagging it.
    // Items already tagged in the DB don't reappear in this list, and
    // newly-tagged items are not also shown under 'Updated'.
    let newlyDeleted = false;
    if (deletedColIdx != null) {
      const sheetVal = (row[deletedColIdx] ?? '').trim();
      if (sheetVal) {
        const currentDeleted = existingFolder
          ? normalizeForCompare(existingFolder.properties?.[String(deletedPropertyId)])
          : '';
        if (!currentDeleted) {
          newlyDeleted = true;
          deletedFolderDisplays.push(display);
        }
      }
    }
    if (isNew) {
      newFolderNames.push(effectiveName);
      newFolderDisplays.push(display);
    } else if (!newlyDeleted) {
      // Existing folder is reported as 'updated' only when at least one
      // property value in the row actually differs from what the project
      // currently stores. Values are normalized before comparison so
      // invisible characters (NBSP, zero-width, CR, BOM) and Unicode form
      // (NFC vs NFD) don't produce spurious diffs.
      const currentProps = existingFolder?.properties || {};
      let changed = false;
      for (const col of importedPropHeaders) {
        const finalId = labelToFinalId.get(col.label);
        const newValue = normalizeForCompare(row[col.idx]);
        const curValue = finalId != null
          ? normalizeForCompare(currentProps[String(finalId)])
          : '';
        if (curValue !== newValue) {
          changed = true;
          break;
        }
      }
      if (changed) updatedFolderDisplays.push(display);
    }
    for (const col of importedPropHeaders) {
      const finalLabel = headerToFinalLabel.get(col.label) || col.label;
      const value = (row[col.idx] ?? '').trim();
      updates.push({ folder_name: effectiveName, property_label: finalLabel, value });
    }
  });

  const recap = {
    // Recap renders the list as plain text, so expose labels only.
    newProperties: newProperties.map((p) => p.label),
    renames: renames.map((r) => ({
      id: r.id,
      from: propById.get(r.id)?.label || '?',
      to: r.label,
    })),
    newFolders: newFolderDisplays,
    updatedFolders: updatedFolderDisplays,
    deletedFolders: deletedFolderDisplays,
    renamedFolders: renamedFolders.map((r) => ({ from: r.from, to: r.to })),
  };

  const plan = {
    // Backend accepts {label, short_label} objects (or plain strings for
    // legacy callers) — see FIX370.1.2.1.3 in showcase-api.
    new_properties: newProperties,
    renames: renames.map((r) => ({ id: r.id, label: r.label })),
    new_folders: newFolderNames,
    // FIX370.2.1.7: rename an existing item's '#' (folder.name).
    folder_renames: renamedFolders.map((r) => ({ id: r.id, name: r.to })),
    updates,
  };

  return { errors: [], recap, plan };
}

// Convenience: full pipeline from a URL + current project state.
export async function planFromUrl(url, project) {
  const parsed = parseGsheetUrl(url);
  if (!parsed) {
    return { errors: ['The URL does not look like a Google Sheets link.'] };
  }
  const mainCsv = await fetchMainCsv(parsed.sheetId, parsed.gid);
  const setupCsv = await fetchSetupCsv(parsed.sheetId);
  return buildPlan({ mainCsv, setupCsv, project });
}
