// FIX370 / FIX370.0 <cmd-import-google-sheet>: Google Sheet import logic
// (no React). The UI component calls these functions to parse a sheet URL,
// fetch the tabs, run format checks (FIX370.2 / FIX370.2.0
// <gsheet-format-checks>), and build the plan that the backend applies.

import { fetchGsheetTitle } from '../data/backend.js';

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

// ---------- Format checks + plan building ----------

export function buildPlan({ mainCsv, setupCsv, project }) {
  const errors = [];
  const mainRows = parseCsv(mainCsv);
  if (mainRows.length === 0) {
    return { errors: ['The main sheet is empty.'] };
  }
  const headers = (mainRows[0] || []).map((h) => (h ?? '').trim());
  const dataRows = mainRows.slice(1);

  // FIX370.2.1.1 (updated): the mandatory folder-name column is no longer
  // the hardcoded literal '#' -- it's whichever main-sheet column is
  // labeled like the project's <setup-item-key-property> (FIX506.2.7).
  // '#' is now just the spec's own shorthand for "that column", used
  // throughout the rest of FIX370.2.1.x's error text and comments below.
  const itemKeyProperty = (project.properties || [])
    .find((p) => p.id === project.item_key_property_id) ?? null;
  const keyColLabel = itemKeyProperty?.label ?? null;
  // Error text carries no FIX reference -- a FTag is a spec entry id, not
  // an error id, for the user.
  if (!keyColLabel) {
    errors.push("Set 'Item key property' in Setup > Properties before importing.");
  }
  const folderColIdx = keyColLabel ? headers.indexOf(keyColLabel) : -1;
  if (keyColLabel && folderColIdx < 0) {
    errors.push(`A '${keyColLabel}' column is mandatory in the main sheet.`);
  }
  // FIX370.2.1.7 (updated) — <setup-import-chg-ref-col> (FIX513.2.1): the
  // admin-typed name of the optional rename-command column (was the
  // hardcoded literal '# new'). Inactive (no column treated as a rename
  // command) unless it's both set and actually present in the sheet.
  const chgRefColName = (project.import_chg_ref_col || '').trim();
  const folderNewColIdx = chgRefColName ? headers.indexOf(chgRefColName) : -1;

  // FIX370.2.1.2 — unique column headers
  {
    const seen = new Set();
    for (const h of headers) {
      if (!h) continue;
      if (seen.has(h)) {
        errors.push(`Duplicate column header "${h}".`);
      } else {
        seen.add(h);
      }
    }
  }

  // Property header columns (non-rename-command, non-blank). Bug fix
  // (user-reported): the key column used to be excluded here too, on the
  // theory that it's structural-only -- but FIX370.2.1.1 carries no "not
  // as an item property" clause the way FIX370.2.1.7 does for the
  // rename-command column, and it's a real row in the Properties list
  // now. It's no exception from the rest of the property columns: its
  // value is imported normally like any other, so a plain {ItsLabel}
  // caption placeholder resolves it through the same computePropertyValue
  // path as everything else, no special-casing needed anywhere.
  const propHeaders = headers
    .map((h, idx) => ({ label: h, idx }))
    .filter((c) => c.label && c.idx !== folderNewColIdx);

  // FIX370.2.1.3 / FIX370.2.1.4 / FIX370.2.1.5 — row-level checks only run
  // when the '#' column exists; otherwise per-row '#' errors would just be
  // noise flowing from the already-reported FIX370.2.1.1 failure.
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
        errors.push(`Row ${i + 2} has a blank '#' value.`);
        rowFolderNames.push(null);
        return;
      }
      if (seen.has(name)) {
        errors.push(
          `'#' value "${name}" appears on rows ${seen.get(name) + 2} and ${i + 2}.`,
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
      // The rename-command column (FIX370.2.1.7's <setup-import-chg-ref-col>)
      // is explicitly "not as an item property" -- skip if it shows up in
      // the setup sheet (e.g. copy-paste of main-sheet headers). The key
      // column (FIX370.2.1.1's <setup-item-key-property>) has no such
      // clause -- it's a real property now, so it's not skipped here.
      if (chgRefColName && label === chgRefColName) continue;
      // FIX370.1.2.1.2.1: name ending with "(*)" flags this row as the main
      // property. Strip the marker so the stored label matches the header.
      let main = false;
      if (label.endsWith(MAIN_MARK)) {
        main = true;
        label = label.slice(0, -MAIN_MARK.length).trim();
        if (!label) continue;
      }
      const id = idStr === '' ? null : Number(idStr);
      // FIX370.1.2.1.1 — property id must be an integer when given.
      if (idStr !== '' && !Number.isInteger(id)) {
        errors.push(`Setup sheet: row ${i + 1} has a non-integer id "${idStr}".`);
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
  // FIX370.2.1.6.1: main-sheet headers dropped because they don't match an
  // existing property (only populated in the no-setup-sheet branch below).
  const droppedColumns = [];

  // Map from a main-sheet header (full or short name) to its setup entry.
  // Built only when a setup sheet is provided. Unmatched main-sheet
  // columns are silently skipped (FIX370.2.2.1 updated).
  const setupByMainHeader = new Map();
  if (setupCsv != null) {
    // FIX370.2.2.2 — all ids in setup must exist in the project.
    for (const e of setupEntries) {
      if (e.id != null && !propById.has(e.id)) {
        errors.push(`Setup sheet references unknown property id ${e.id}.`);
      }
    }
    // FIX370.2.2.3 — a setup entry with no id means "new property"; its
    // name must not collide with an existing property in the project.
    for (const e of setupEntries) {
      if (e.id == null && propByLabel.has(e.label)) {
        errors.push(
          `Property "${e.label}" cannot be declared as new — it already exists.`,
        );
      }
    }
    // FIX370.2.2.4 — a setup entry with an id must not clash with an
    // existing property that has the same name but a different id.
    for (const e of setupEntries) {
      if (e.id == null) continue;
      const byName = propByLabel.get(e.label);
      if (byName && byName.id !== e.id) {
        errors.push(
          `Property "${e.label}" already exists with id ${byName.id}, not id ${e.id}.`,
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
          `Main-sheet column "${col.label}" matches ${matches.length} setup rows.`,
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
    // FIX370.2.1.6.1 (updated): no setup sheet → a main-sheet header that
    // doesn't match an existing property is no longer a hard error. It's
    // dropped (excluded from headerToFinalLabel / importedPropHeaders
    // below, same "silently skip" treatment the with-setup-sheet branch
    // already gives an unlisted column) and surfaced to the user as a
    // confirmable list rather than blocking the import outright.
    for (const col of propHeaders) {
      if (propByLabel.has(col.label)) {
        headerToFinalLabel.set(col.label, col.label);
      } else {
        droppedColumns.push(col.label);
      }
    }
  }

  if (errors.length > 0) return { errors };

  // FIX370.4.2.3 and FIX370.4.2.4: find the "Main" property in the setup
  // sheet (if any) so the recap can postfix each folder with its value
  // under that property.
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
  // in the import. The rest are silently dropped. FIX370.2.1.6.1 (updated):
  // with no setup sheet, only headers matching an existing property
  // participate — droppedColumns holds everything else.
  const importedPropHeaders = setupCsv != null
    ? propHeaders.filter((c) => setupByMainHeader.has(c.label))
    : propHeaders.filter((c) => propByLabel.has(c.label));
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

  // FIX370.4.2.5 / <setup-property-tagged-deleted>: recap the folders
  // that will be tagged as deleted after the import (i.e. the rows where
  // the deletion property's value is non-blank). null = feature disabled.
  const deletedPropertyId = project.deleted_property_id ?? null;
  const deletedColIdx =
    deletedPropertyId != null
      ? (propHeaders.find(
          (c) => labelToFinalId.get(c.label) === deletedPropertyId,
        )?.idx ?? null)
      : null;

  // Two rows resolving to the same *effective* (post-chg-ref-col-rename)
  // folder name would silently clobber each other in the backend's
  // per-folder merge (whichever row's updates the server processes last
  // wins, with no error surfaced). FIX370.2.1.4 only dedupes the raw key
  // column, which doesn't catch this — check the resolved name too,
  // before building any recap/plan off of it.
  const effectiveNames = [];
  {
    const seenEffective = new Map();
    dataRows.forEach((row, i) => {
      const name = rowFolderNames[i];
      if (!name) { effectiveNames.push(null); return; }
      const isNew = !projectFolderNames.has(name);
      const newRefRaw = folderNewColIdx >= 0 ? (row[folderNewColIdx] ?? '').trim() : '';
      // FIX370.2.1.7.2 (updated): a new item's row can't carry a
      // chg-ref-col value at all -- error out before import starts,
      // instead of the old behavior of silently creating the item under
      // that value instead of its '#'.
      if (isNew && newRefRaw) {
        errors.push(
          `Row ${i + 2}: '${chgRefColName}' is set ("${newRefRaw}") but '${name}' is a new item -- ` +
          `'${chgRefColName}' can only rename an existing item.`,
        );
      }
      // FIX370.2.1.7.3: an existing item's row may still be renamed via
      // chg-ref-col.
      let effectiveName = name;
      if (!isNew && newRefRaw && newRefRaw !== name) effectiveName = newRefRaw;
      effectiveNames.push(effectiveName);
      if (seenEffective.has(effectiveName)) {
        errors.push(
          `Rows ${seenEffective.get(effectiveName) + 2} and ${i + 2} both resolve to item '${effectiveName}'.`,
        );
      } else {
        seenEffective.set(effectiveName, i);
      }
    });
  }
  if (errors.length > 0) return { errors };

  const newFolderNames = [];
  const newFolderDisplays = [];
  const updatedFolderDisplays = [];
  const deletedFolderDisplays = [];
  const renamedFolders = [];
  const updates = [];
  // FIX370.4.2.2.4: a ref-renamed item also counts as an 'Updated item',
  // alongside items with a changed property value -- deduped by row so an
  // item with both doesn't count twice.
  const updatedItemRows = new Set();
  // FIX370.4.2.11.1: refs behind updatedItemRows's count, for the 'Show
  // details' popup -- one push per row (first of the two branches below to
  // touch it wins), matching updatedItemRows's own dedup.
  const updatedItemNames = [];
  // FIX370.4.3.10.1: names (not ids -- a newly-deleted row may also be a
  // brand-new folder with no id yet) of items predicted to end up deletion-
  // tagged, so the effective-import check can re-read each one's actual
  // deletion-property value after the import and compare counts.
  const deletedFolderNames = [];

  dataRows.forEach((row, i) => {
    const name = rowFolderNames[i];
    if (!name) return;
    const isNew = !projectFolderNames.has(name);
    const existingFolder = folderByName.get(name);
    const newRefRaw = folderNewColIdx >= 0 ? (row[folderNewColIdx] ?? '').trim() : '';
    const effectiveName = effectiveNames[i];
    // FIX370.2.1.7 (updated): <setup-import-chg-ref-col> is a command to
    // change the current key-column value (folder name), not an item
    // property. FIX370.2.1.7.1: no value, or equal to the current value ->
    // nothing to do. FIX370.2.1.7.2 (checked above, in the effectiveNames
    // pass): an error, not a rename, when the row is a new item.
    if (!isNew && newRefRaw && newRefRaw !== name) {
      renamedFolders.push({ id: existingFolder.id, from: name, to: newRefRaw });
      if (!updatedItemRows.has(i)) updatedItemNames.push(effectiveNames[i]);
      updatedItemRows.add(i);
    }
    let display = effectiveName;
    if (mainColIdx != null) {
      const v = (row[mainColIdx] ?? '').trim();
      if (v) display = `${effectiveName} — ${v}`;
    }
    // FIX370.4.2.5.1 (updated): an item is recapped as 'Deleted' only
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
          deletedFolderNames.push(effectiveName);
        }
      }
    }
    // The key column's own stored property value should track the item's
    // CURRENT ref, same as folder.name itself -- for a renamed row that's
    // effectiveName (FIX370.2.1.7.3), not the sheet's raw pre-rename cell
    // text (row[folderColIdx]). Every other column just reads its cell.
    const colValue = (col) => (col.idx === folderColIdx ? effectiveName : (row[col.idx] ?? '').trim());
    if (isNew || newlyDeleted) {
      // New folder: nothing to compare against yet — write every imported
      // column. Newly-deleted: preserve existing behavior (still writes
      // its other columns alongside the deletion tag).
      if (isNew) {
        newFolderNames.push(effectiveName);
        newFolderDisplays.push(display);
      }
      for (const col of importedPropHeaders) {
        const finalLabel = headerToFinalLabel.get(col.label) || col.label;
        updates.push({ folder_name: effectiveName, property_label: finalLabel, value: colValue(col) });
      }
    } else {
      // Existing folder: only push (and report as 'updated') the columns
      // whose value actually differs from what the project currently
      // stores — pushing every column unconditionally, as before, made the
      // backend's applied-update count (and its writes) cover virtually
      // every folder in the sheet regardless of whether anything changed.
      // Values are normalized before comparison so invisible characters
      // (NBSP, zero-width, CR, BOM) and Unicode form (NFC vs NFD) don't
      // produce spurious diffs.
      const currentProps = existingFolder?.properties || {};
      let changed = false;
      for (const col of importedPropHeaders) {
        const finalId = labelToFinalId.get(col.label);
        const newValue = normalizeForCompare(colValue(col));
        const curValue = finalId != null
          ? normalizeForCompare(currentProps[String(finalId)])
          : '';
        if (curValue !== newValue) {
          changed = true;
          const finalLabel = headerToFinalLabel.get(col.label) || col.label;
          updates.push({ folder_name: effectiveName, property_label: finalLabel, value: colValue(col) });
        }
      }
      if (changed) {
        updatedFolderDisplays.push(display);
        if (!updatedItemRows.has(i)) updatedItemNames.push(effectiveName);
        updatedItemRows.add(i);
      }
    }
  });

  // FIX370.4.2 <popup-import-preview>: replaces the old per-name recap
  // lists (FIX370.4.2(deep-old) family) with counts only, one per
  // change-type (FIX370.4.2.2.1.3's fixed display order). FIX370.4.2.2.1.10:
  // a new property alone isn't an 'Updated item' -- only setting a value for
  // it (which the updatedItemRows tracking above already requires) is.
  // FIX370.4.2.2.1.12: a property rename doesn't touch updatedItemRows at
  // all, so it's correctly excluded from 'Updated item'.
  const recap = {
    changeCounts: {
      newItem: newFolderDisplays.length,
      updatedItem: updatedItemRows.size,
      deletedItem: deletedFolderDisplays.length,
      updatedItemRef: renamedFolders.length,
      newProperty: newProperties.length,
      updatedPropertyName: renames.length,
    },
    // FIX370.4.2.11.1: comma-joinable refs/property names behind each
    // change-type count above, for the 'Show details' popup.
    changeDetails: {
      newItem: newFolderNames,
      updatedItem: updatedItemNames,
      deletedItem: deletedFolderNames,
      updatedItemRef: renamedFolders.map((r) => `${r.from} → ${r.to}`),
      newProperty: newProperties.map((p) => p.label),
      updatedPropertyName: renames.map((r) => `${propById.get(r.id)?.label || '?'} → ${r.label}`),
    },
    // FIX370.4.2.2.2 / FIX370.4.2.2.2.2: every main-sheet column, flagged
    // with whether it's actually read -- this is what would have caught
    // the "colour silently dropped because a setup sheet only listed an
    // unrelated column" case directly, instead of the user having to be
    // told the setup-sheet-is-an-allowlist rule. The key column is a real
    // property now (propHeaders includes it, no exception), so it's
    // covered by the normal mapping below; only the rename-command column
    // -- explicitly "not as an item property" (FIX370.2.1.7) -- is added
    // back in on its own, always flagged read since it IS consulted for
    // every row even though it never produces a property-value update.
    gsheetColumns: [
      ...propHeaders.map((c) => ({ label: c.label, idx: c.idx, read: importedPropHeaders.includes(c) })),
      ...(folderNewColIdx >= 0 ? [{ label: headers[folderNewColIdx], idx: folderNewColIdx, read: true }] : []),
    ]
      .sort((a, b) => a.idx - b.idx)
      .map(({ label, read }) => ({ label, read })),
    // FIX370.2.1.6.1 (updated): columns dropped for not matching an
    // existing property, when no setup sheet was provided.
    droppedColumns,
    // FIX370.4.3.10.1: see deletedFolderNames declaration above.
    deletedFolderNames,
  };

  const plan = {
    // Backend accepts {label, short_label} objects (or plain strings for
    // legacy callers) — see FIX370.1.2.1.3 in showcase-api.
    new_properties: newProperties,
    renames: renames.map((r) => ({ id: r.id, label: r.label })),
    new_folders: newFolderNames,
    // FIX370.2.1.7.3: rename an existing item's key-column value (folder.name).
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
  const result = buildPlan({ mainCsv, setupCsv, project });

  // FIX370.2.1.8: the gsheet's document title must be 'Showcase
  // <project-name>'. Fetched server-side (backend /api/gsheet-title) --
  // the /edit page (the only place carrying the actual title) isn't
  // CORS-fetchable from the browser, same reasoning as FIX378.3.4.2's
  // identical check in the create-gsheet wizard. Merged into the same
  // errors list as every other FIX370.2.1.x check, all surfaced together
  // via the FIX379 <popup-gsheet-format-err> popup (FIX370.4.1.3) --
  // unlike FIX370.2.1.6.1, nothing here is safe to silently drop/skip.
  const expectedTitle = `Showcase ${project?.name || ''}`.trim();
  let title = null;
  try {
    const res = await fetchGsheetTitle(url);
    title = res?.title || null;
  } catch {
    // best-effort — folds into the mismatch error below
  }
  if (!title || title.trim().toLowerCase() !== expectedTitle.toLowerCase()) {
    const titleError = `The gsheet must be named "${expectedTitle}" (found ${title ? `"${title}"` : 'nothing readable'}).`;
    return { errors: [...(result.errors || []), titleError] };
  }
  return result;
}
