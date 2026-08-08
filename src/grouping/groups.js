// FIX373 (updated): one Property can have 0..N Groupings (was 0..1).
// Each grouping entry has its own identity (id + user-editable name),
// a property reference, and optional segment/default flags. Older
// view_setup records use the pre-change shape (keyed by property_id, no
// id/name); normalizeGroups() migrates them on read so the rest of the
// app can rely on the new shape uniformly.
export function normalizeGroups(rawGroups, properties) {
  if (!Array.isArray(rawGroups)) return [];
  const propLabel = (pid) => {
    if (pid === 'img') return 'Img';
    const p = (properties || []).find((pp) => pp.id === pid);
    return p?.label ?? `Property ${pid}`;
  };
  return rawGroups.map((g, i) => ({
    id: g.id ?? `g-${g.property_id}-${i}`,
    name: g.name ?? propLabel(g.property_id),
    property_id: g.property_id,
    segment: g.segment ?? null,
    default: !!g.default,
  }));
}

export function freshGroupId() {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
