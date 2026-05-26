// FIX372 segmentation logic. Given an anchor segment string (e.g. '1900-1909'
// or 'A-D') and a folder's property value, produce the bucket the folder
// belongs to. Used to (a) list segments with at least one matching item and
// (b) filter items by the currently-selected bucket.
//
// FIX374.2.2: a single item can belong to *several* Group values when its
// property value is a set/range (FIX506.5.5). bucketsFor() returns every
// bucket an item's value maps to; an item is then counted once per distinct
// bucket (FIX374.2.2.2.1 / FIX374.2.2.3.1).
import { parseValueSet } from '../properties/formulas.js';

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

function dedupeBuckets(buckets) {
  const seen = new Map();
  for (const b of buckets) if (b && !seen.has(b.key)) seen.set(b.key, b);
  return [...seen.values()];
}

// Buckets touched by a [lo..hi] value range (FIX374.2.2.2.1 / FIX374.2.2.3.1).
//  - exact (individual values): every integer in [lo..hi] is its own bucket
//    (e.g. 1800..1810 → 11 values). Non-numeric ranges fall back to the two
//    endpoints as exact buckets.
//  - integer segments: every segment that intersects [lo..hi].
//  - text segments: every segment between the endpoints' first letters.
function bucketsForRange(loRaw, hiRaw, parsed) {
  if (parsed.type === 'exact') {
    const lo = Number(loRaw);
    const hi = Number(hiRaw);
    if (Number.isInteger(lo) && Number.isInteger(hi) && hi >= lo) {
      const out = [];
      for (let n = lo; n <= hi; n++) out.push(bucketFor(String(n), parsed));
      return dedupeBuckets(out);
    }
    return dedupeBuckets([bucketFor(loRaw, parsed), bucketFor(hiRaw, parsed)]);
  }
  if (parsed.type === 'integer') {
    const lo = Number(loRaw);
    const hi = Number(hiRaw);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    const { lower, size } = parsed;
    const out = [];
    for (let idx = Math.floor((a - lower) / size); idx <= Math.floor((b - lower) / size); idx++) {
      const bucketLow = lower + idx * size;
      out.push({ key: String(bucketLow), label: `${bucketLow}-${bucketLow + size - 1}`, sort: bucketLow });
    }
    return out;
  }
  if (parsed.type === 'text') {
    const loC = String(loRaw).charAt(0).toUpperCase().charCodeAt(0);
    const hiC = String(hiRaw).charAt(0).toUpperCase().charCodeAt(0);
    if (!loC || !hiC) return [];
    const a = Math.min(loC, hiC);
    const b = Math.max(loC, hiC);
    const { lowerC, size } = parsed;
    const out = [];
    for (let idx = Math.floor((a - lowerC) / size); idx <= Math.floor((b - lowerC) / size); idx++) {
      const bLow = lowerC + idx * size;
      out.push({ key: String.fromCharCode(bLow), label: `${String.fromCharCode(bLow)}-${String.fromCharCode(bLow + size - 1)}`, sort: bLow });
    }
    return out;
  }
  return [];
}

// FIX374.2.2: every bucket the value maps to. `acceptsSet` enables the
// set/range interpretation (FIX506.5.5); when false the value is a single
// scalar and maps to at most one bucket (the pre-FIX374.2.2 behavior).
export function bucketsFor(value, parsed, acceptsSet) {
  if (value == null) return [];
  const raw = String(value).trim();
  if (raw === '') return [];
  const set = acceptsSet ? parseValueSet(raw) : null;
  if (!set) {
    const b = bucketFor(raw, parsed);
    return b ? [b] : [];
  }
  if (set.kind === 'set') {
    return dedupeBuckets(set.values.map((v) => bucketFor(v, parsed)));
  }
  return bucketsForRange(set.lo, set.hi, parsed); // kind === 'range'
}

// FIX374.2.3 [ex-FIX372.6.2.3]: sentinel key used for the trailing "No value" bucket that
// collects items whose value for the grouping property is missing or not
// placeable under the current segment.
export const NO_VALUE_KEY = '__novalue__';

// Given all folder values for a single property and a parsed segment, return
// the list of buckets that have at least one matching value, with count.
export function bucketsWithValues(folderValues, parsed, acceptsSet) {
  const byKey = new Map();
  let noValueCount = 0;
  for (const v of folderValues) {
    const buckets = bucketsFor(v, parsed, acceptsSet);
    if (buckets.length === 0) {
      noValueCount += 1;
      continue;
    }
    // FIX374.2.2.2.1 / FIX374.2.2.3.1: count the item once per distinct
    // bucket it belongs to (a range/set item lands in several).
    for (const b of buckets) {
      const existing = byKey.get(b.key);
      if (existing) existing.count += 1;
      else byKey.set(b.key, { ...b, count: 1 });
    }
  }
  // FIX374.2.11 [ex-FIX372.6.2.11]: order the bucket list by increasing value.
  //   .11.1 — if every value is a number, sort numerically.
  //   .11.2 — otherwise, sort alphabetically (case-insensitive).
  // Segmented groups (integer / text ranges) already carry a numeric `sort`
  // key per bucket, so they take the numeric path automatically.
  const list = Array.from(byKey.values());
  const hasAllSortKeys = list.length > 0 && list.every((b) => b.sort != null);
  const allNumericLabels =
    !hasAllSortKeys &&
    list.length > 0 &&
    list.every((b) => {
      const t = b.label.trim();
      if (!t) return false;
      const n = Number(t);
      return Number.isFinite(n) && String(n) === t;
    });
  list.sort((a, b) => {
    if (hasAllSortKeys) return a.sort - b.sort;
    if (allNumericLabels) return Number(a.label) - Number(b.label);
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  if (noValueCount > 0) {
    list.push({ key: NO_VALUE_KEY, label: 'No value', count: noValueCount });
  }
  return list;
}

// True iff `value` belongs to the bucket identified by `bucketKey` under the
// given parsed segment (FIX374.2.2: a set/range value may match several).
export function matchesBucket(value, bucketKey, parsed, acceptsSet) {
  return bucketsFor(value, parsed, acceptsSet).some((b) => b.key === bucketKey);
}
