// FIX506.5.3 / FIX506.5.4: derived-property formulas.
//
// Syntax: <function-name>(<other-property-name>)
//
// Functions:
//   numberOf(prop)  — count of "terms" in the referenced property's value:
//     - 'a, b, c'   → 3   (FIX506.5.4.1.1, comma-separated)
//     - '2..6'      → 5   (FIX506.5.4.1.2, inclusive integer range)
//     - '' / null   → ''  (unknown → blank, not 0, so the UI matches
//                          an empty cell rather than a misleading 0)

function numberOf(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const range = s.match(/^(-?\d+)\s*\.\.\s*(-?\d+)$/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return Math.abs(hi - lo) + 1;
  }
  const terms = s.split(',').map((t) => t.trim()).filter(Boolean);
  return terms.length;
}

const FUNCTIONS = { numberOf };

// Parse 'funcName(argLabel)' → { fn, argLabel } or null on syntax error.
export function parseFormula(formula) {
  if (!formula) return null;
  const m = String(formula).trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*(.+?)\s*\)\s*$/);
  if (!m) return null;
  const fnName = m[1];
  const argLabel = m[2].trim();
  if (!(fnName in FUNCTIONS)) return null;
  return { fn: FUNCTIONS[fnName], argLabel };
}

// Evaluate `formula` against a folder's stored properties.
// propertiesByLabel: Map<string, {id, label, ...}>.
export function evaluateFormula(formula, folder, propertiesByLabel) {
  const parsed = parseFormula(formula);
  if (!parsed) return '';
  const refProp = propertiesByLabel.get(parsed.argLabel);
  if (!refProp) return '';
  const rawValue = folder.properties?.[String(refProp.id)] ?? '';
  return parsed.fn(rawValue);
}

// Read a property's value for a given folder, computing it from the
// formula when the property is derived, or reading from the stored JSONB
// otherwise.
export function computePropertyValue(folder, prop, propertiesByLabel) {
  if (prop.formula) {
    return evaluateFormula(prop.formula, folder, propertiesByLabel);
  }
  return folder.properties?.[String(prop.id)] ?? '';
}

// FIX506.2.1.1.4 / <input-property-trailing-values>: parse the user-entered
// list of "trailing" tokens — values that always sort to the end of the
// list regardless of sort direction (FIX510.2.1.5).
//
// Format (FIX506.2.1.1.4.1): comma-separated, each value wrapped in single
// quotes. Example:  '-', '?'   → Set { '-', '?' }
// Anything outside the quoted tokens is ignored, so a stray comma or stray
// whitespace doesn't break the parse.
export function parseTrailingValues(raw) {
  if (!raw) return new Set();
  const matches = String(raw).match(/'([^']*)'/g) || [];
  return new Set(matches.map((m) => m.slice(1, -1)));
}

// FIX506.5.5 / FIX510.2.1.5: when a property has
// <input-property-accepted-value-set> checked, its raw value can be:
//   - a range  "1876..1877"
//   - a comma-separated list  "a, b, c"
//   - or a single value (no set semantics → returns null)
export function parseValueSet(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const range = s.match(/^(.+?)\s*\.\.\s*(.+?)$/);
  if (range) return { kind: 'range', lo: range[1].trim(), hi: range[2].trim() };
  if (s.includes(',')) {
    const parts = s.split(',').map((t) => t.trim()).filter(Boolean);
    if (parts.length >= 2) return { kind: 'set', values: parts };
  }
  return null;
}

// Lightweight numeric-aware compare used internally to find the lo/hi of
// a value list. Mirrors the behavior of compareValues in ShowcaseView so
// the 'set' case sorts numbers numerically (e.g. '10' > '9') and falls
// back to a case-insensitive string compare otherwise.
function cmpForEdge(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (
    Number.isFinite(na) && Number.isFinite(nb) &&
    String(na) === String(a).trim() && String(nb) === String(b).trim()
  ) return na - nb;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

// FIX510.2.1.5: pick the lo (asc) or hi (desc) edge of a value set.
// Returns the original raw value when it isn't a set.
export function valueSetEdge(raw, side /* 'lo' | 'hi' */) {
  const parsed = parseValueSet(raw);
  if (!parsed) return raw;
  if (parsed.kind === 'range') return parsed[side];
  const sorted = [...parsed.values].sort(cmpForEdge);
  return side === 'lo' ? sorted[0] : sorted[sorted.length - 1];
}
