// FIX370: Google Sheet import logic (no React).
// The UI component calls these functions to parse a sheet URL, fetch the
// tabs, run consistency checks, and build the plan that the backend applies.

const FOLDER_COL = '#';

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

export async function fetchSetupCsv(sheetId, gid) {
  // The setup tab is optional. gviz is case-sensitive on sheet names and
  // silently falls back to the default sheet when the requested name
  // doesn't exist. To distinguish "no setup tab" from "setup tab happens to
  // be the default one", fetch the main sheet via the same gviz endpoint
  // and compare: identical output ⇒ fallback ⇒ no setup tab exists.
  const setupText = await fetchGvizCsv(sheetId, { sheet: 'setup' });
  if (setupText == null) return null;
  const mainViaGviz = await fetchGvizCsv(sheetId, { gid });
  if (mainViaGviz != null && setupText.trim() === mainViaGviz.trim()) return null;
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

  // Property header columns (non-'#', non-blank).
  const propHeaders = headers
    .map((h, idx) => ({ label: h, idx }))
    .filter((c) => c.label && c.idx !== folderColIdx);

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
  let setupEntries = null;
  if (setupCsv != null) {
    const setupRows = parseCsv(setupCsv).filter((r) => !isRowBlank(r));
    setupEntries = [];
    // No header row assumed — each non-blank row is (name, id).
    for (let i = 0; i < setupRows.length; i++) {
      const row = setupRows[i];
      const label = (row[0] ?? '').trim();
      const idStr = (row[1] ?? '').trim();
      if (!label) continue;
      const id = idStr === '' ? null : Number(idStr);
      if (idStr !== '' && !Number.isInteger(id)) {
        errors.push(`FIX370 setup sheet: row ${i + 1} has a non-integer id "${idStr}".`);
        continue;
      }
      setupEntries.push({ label, id });
    }
  }

  const projectProps = project.properties || [];
  const propByLabel = new Map(projectProps.map((p) => [p.label, p]));
  const propById = new Map(projectProps.map((p) => [p.id, p]));

  // Resolution: for each property header, figure out current/new/renamed.
  const newProperties = [];
  const renames = [];
  const headerToFinalLabel = new Map();

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
    // 2.2.1 — each main-sheet property header must appear exactly once in setup.
    const setupLabels = setupEntries.map((e) => e.label);
    const countBy = (arr) => {
      const m = new Map();
      for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
      return m;
    };
    const setupCount = countBy(setupLabels);
    for (const col of propHeaders) {
      const c = setupCount.get(col.label) || 0;
      if (c === 0) {
        errors.push(`FIX370.2.2.1: property "${col.label}" missing from the setup sheet.`);
      } else if (c > 1) {
        errors.push(`FIX370.2.2.1: property "${col.label}" listed ${c} times in the setup sheet.`);
      }
    }
    // Build resolution from setup: new entries (no id) → create; entries with
    // id + label differing from current → rename.
    for (const e of setupEntries) {
      if (e.id == null) {
        if (!propByLabel.has(e.label)) newProperties.push(e.label);
      } else {
        const existing = propById.get(e.id);
        if (existing && existing.label !== e.label) {
          renames.push({ id: e.id, label: e.label });
        }
      }
      headerToFinalLabel.set(e.label, e.label);
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

  // Build new folders + updates.
  const projectFolderNames = new Set((project.folders || []).map((f) => f.name));
  const newFolders = [];
  const updatedFolders = [];
  const updates = [];

  dataRows.forEach((row, i) => {
    const name = rowFolderNames[i];
    if (!name) return;
    const isNew = !projectFolderNames.has(name);
    if (isNew) newFolders.push(name);
    else updatedFolders.push(name);
    for (const col of propHeaders) {
      const finalLabel = headerToFinalLabel.get(col.label) || col.label;
      const value = (row[col.idx] ?? '').trim();
      updates.push({ folder_name: name, property_label: finalLabel, value });
    }
  });

  const renameByNew = new Map(renames.map((r) => [r.label, propById.get(r.id)?.label || '?']));
  const recap = {
    newProperties,
    renames: renames.map((r) => ({
      id: r.id,
      from: propById.get(r.id)?.label || '?',
      to: r.label,
    })),
    newFolders,
    updatedFolders,
  };
  // renameByNew not used below; kept for potential diagnostic logging.
  void renameByNew;

  const plan = {
    new_properties: newProperties,
    renames: renames.map((r) => ({ id: r.id, label: r.label })),
    new_folders: newFolders,
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
  const setupCsv = await fetchSetupCsv(parsed.sheetId, parsed.gid);
  return buildPlan({ mainCsv, setupCsv, project });
}
