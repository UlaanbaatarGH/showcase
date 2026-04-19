// FIX372 segmentation logic. Given an anchor segment string (e.g. '1900-1909'
// or 'A-D') and a folder's property value, produce the bucket the folder
// belongs to. Used to (a) list segments with at least one matching item and
// (b) filter items by the currently-selected bucket.

// A parsed segment. `type` is 'exact' | 'integer' | 'text'.
export function parseSegment(segment) {
  if (segment == null || segment === '' || !segment.trim()) {
    return { type: 'exact' };
  }
  const s = segment.trim();
  // Integer range: '1900-1909' — allow optional leading sign on either side.
  const intMatch = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
  if (intMatch) {
    const lower = Number(intMatch[1]);
    const upper = Number(intMatch[2]);
    if (upper >= lower) {
      return { type: 'integer', lower, upper, size: upper - lower + 1 };
    }
  }
  // Text range: 'A-D' — single letters on either side.
  const txtMatch = s.match(/^([A-Za-z])\s*-\s*([A-Za-z])$/);
  if (txtMatch) {
    const lowerC = txtMatch[1].toUpperCase().charCodeAt(0);
    const upperC = txtMatch[2].toUpperCase().charCodeAt(0);
    if (upperC >= lowerC) {
      return {
        type: 'text',
        lowerC,
        upperC,
        size: upperC - lowerC + 1,
      };
    }
  }
  return { type: 'invalid', raw: s };
}

// Returns a bucket key + human label for a given raw value, or null if the
// value cannot be placed (e.g. blank, non-parseable for integer segments).
export function bucketFor(value, parsed) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === '') return null;

  if (parsed.type === 'exact') {
    return { key: raw, label: raw };
  }

  if (parsed.type === 'integer') {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    const { lower, size } = parsed;
    const idx = Math.floor((n - lower) / size);
    const bucketLow = lower + idx * size;
    const bucketHigh = bucketLow + size - 1;
    return {
      key: String(bucketLow),
      label: `${bucketLow}-${bucketHigh}`,
      sort: bucketLow,
    };
  }

  if (parsed.type === 'text') {
    const firstChar = raw.charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(firstChar)) return null;
    const c = firstChar.charCodeAt(0);
    const { lowerC, size } = parsed;
    const idx = Math.floor((c - lowerC) / size);
    const bLow = lowerC + idx * size;
    const bHigh = bLow + size - 1;
    return {
      key: String.fromCharCode(bLow),
      label: `${String.fromCharCode(bLow)}-${String.fromCharCode(bHigh)}`,
      sort: bLow,
    };
  }

  return null;
}

// Given all folder values for a single property and a parsed segment, return
// the list of buckets that have at least one matching value, sorted.
export function bucketsWithValues(folderValues, parsed) {
  const byKey = new Map();
  for (const v of folderValues) {
    const b = bucketFor(v, parsed);
    if (!b) continue;
    if (!byKey.has(b.key)) byKey.set(b.key, b);
  }
  const list = Array.from(byKey.values());
  list.sort((a, b) => {
    if (a.sort != null && b.sort != null) return a.sort - b.sort;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return list;
}

// True iff `value` belongs to the bucket identified by `bucketKey` under the
// given parsed segment.
export function matchesBucket(value, bucketKey, parsed) {
  const b = bucketFor(value, parsed);
  return b != null && b.key === bucketKey;
}
