// FIX508.2.4 + FIX508.5.1 <item-short-label>: build a one-line item
// label from a stack of (property, max_length, prefix, suffix) entries.
//
// Algorithm:
//   - Walk the stack in order; for each entry, look up the property
//     value on the item.
//   - Skip empty values (FIX508.5.1) — neither the prefix nor the
//     suffix renders when the value itself is missing.
//   - If max_length is a positive number and the value is longer,
//     hard-truncate (no per-property ellipsis).
//   - FIX508.2.4.2: wrap the (truncated) value with prefix + suffix
//     when both/either are set. Either may be empty.
//   - Join the surviving fragments with a single space.
//   - If any property was truncated, append '...' to the joined string.
//
// max_length 0 / null / undefined = no truncation for that part.
//
// FIX508.2.4.3: any property in the project can sit in the stack —
// including a '#'-style reference field. No special-casing in the
// builder; the SetupPanel dropdown lists every property.
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
    let txt = String(raw);
    const max = Number(part.max_length) || 0;
    if (max > 0 && txt.length > max) {
      txt = txt.slice(0, max);
      truncated = true;
    }
    const prefix = part.prefix || '';
    const suffix = part.suffix || '';
    fragments.push(`${prefix}${txt}${suffix}`);
  }
  if (fragments.length === 0) return '';
  return fragments.join(' ') + (truncated ? '...' : '');
}
