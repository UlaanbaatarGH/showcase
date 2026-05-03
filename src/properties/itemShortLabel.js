// FIX508.2.4 + FIX508.5.1 <item-short-label>: build a one-line item
// label from a stack of (property, max_length) entries.
//
// Algorithm:
//   - Walk the stack in order; for each entry, look up the property
//     value on the item.
//   - Skip empty values (FIX508.5.1).
//   - If max_length is a positive number and the value is longer,
//     hard-truncate (no per-property ellipsis).
//   - Join the surviving fragments with a single space.
//   - If any property was truncated, append '...' to the joined string.
//
// max_length 0 / null / undefined = no truncation for that part.
import { computePropertyValue } from './formulas.js';

export function buildItemShortLabel(folder, parts, properties, propertiesByLabel) {
  if (!Array.isArray(parts) || parts.length === 0) return '';
  const fragments = [];
  let truncated = false;
  for (const part of parts) {
    const prop = (properties || []).find((p) => p.id === part?.property_id);
    if (!prop) continue;
    const raw = computePropertyValue(folder, prop, propertiesByLabel);
    if (raw == null || raw === '') continue;
    const txt = String(raw);
    const max = Number(part.max_length) || 0;
    if (max > 0 && txt.length > max) {
      fragments.push(txt.slice(0, max));
      truncated = true;
    } else {
      fragments.push(txt);
    }
  }
  if (fragments.length === 0) return '';
  return fragments.join(' ') + (truncated ? '...' : '');
}
