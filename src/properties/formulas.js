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
