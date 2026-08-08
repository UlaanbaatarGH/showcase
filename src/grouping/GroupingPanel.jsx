import { useMemo, useState } from 'react';
import { saveSetup } from '../data/backend.js';
import { normalizeGroups, freshGroupId } from './groups.js';
import { IconAdd, IconDelete } from '../Icons.jsx';

// FIX373 <panel-item-grouping-setup>: Item Grouping setup panel.
//
// New data model (FIX373 updated): a Grouping is a first-class entity —
// (Grouping Name, Property, Segment, Default) — and one Property can
// back N Groupings (was at most one). The old table-keyed-by-property
// layout is gone; rows are now free-form groupings with a Property
// dropdown.
//
// FIX373.2.2/.2.3 Add / Remove buttons manage the list.
// FIX373.2.1.10 one row is always selected (for Remove).
// FIX373.2.1.4.1 ticking Default on a row clears it on all others.
// FIX373.2.1.1.1 Grouping Names must be unique.
export default function GroupingPanel({ projectId, properties, viewSetup, onCancel, onSave }) {
  const initial = useMemo(
    () => normalizeGroups(viewSetup?.showcase?.groups, properties),
    [viewSetup, properties],
  );
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // FIX373.2.1.2.1: Property dropdown options — all stored properties
  // plus the 'Img' derived pseudo-property (group by has/hasn't a
  // Main image).
  const propOptions = useMemo(() => {
    // FIX373.5.1 (Topic 6, User's basket): 'My rating' is the logged-in
    // user's own rating — same derived-pseudo-property pattern as 'Img'.
    const opts = [{ value: 'img', label: 'Img' }, { value: 'rating', label: 'My rating' }];
    for (const p of properties ?? []) {
      opts.push({ value: p.id, label: p.label });
    }
    return opts;
  }, [properties]);

  const updateRow = (id, patch) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const setDefault = (id, checked) => {
    setRows((rs) => rs.map((r) => ({ ...r, default: checked && r.id === id })));
  };

  const addRow = () => {
    const firstProp = propOptions[0]?.value;
    const row = {
      id: freshGroupId(),
      name: '',
      property_id: firstProp,
      segment: '',
      default: false,
    };
    setRows((rs) => [...rs, row]);
    setSelectedId(row.id);
  };

  const removeRow = () => {
    if (!selectedId) return;
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === selectedId);
      const next = rs.filter((r) => r.id !== selectedId);
      const newSelected = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      setSelectedId(newSelected?.id ?? null);
      return next;
    });
  };

  const handleSave = async () => {
    // FIX373.2.1.1.1: names must be unique + non-empty.
    const seen = new Map();
    for (const r of rows) {
      const n = (r.name ?? '').trim();
      if (!n) { setError('Each grouping must have a name'); return; }
      if (seen.has(n)) { setError(`Duplicate grouping name: "${n}"`); return; }
      seen.set(n, true);
    }
    setSaving(true);
    setError(null);
    try {
      const groups = rows.map((r) => ({
        id: r.id,
        name: (r.name ?? '').trim(),
        property_id: r.property_id,
        segment: (r.segment ?? '').trim() || null,
        default: !!r.default,
      }));
      const nextViewSetup = {
        ...(viewSetup || {}),
        showcase: { ...(viewSetup?.showcase || {}), groups },
      };
      const result = await saveSetup({
        // FIX401.2: scope writes to the project we're editing.
        project_id: projectId,
        properties: (properties ?? []).map((p, i) => ({
          id: p.id,
          label: p.label,
          short_label: p.short_label ?? null,
          formula: p.formula ?? null,
          trailing_values: p.trailing_values ?? null,
          accepted_value_set: !!p.accepted_value_set,
          sort_order: p.sort_order ?? i,
        })),
        view_setup: nextViewSetup,
      });
      onSave?.(result);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="setup-overlay" onClick={onCancel}>
      <div
        className="setup-panel"
        data-yagu-id="panel-item-grouping-setup"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="setup-header">
          <h2>Grouping</h2>
        </header>
        <div className="setup-body">
          <section className="setup-section">
            <div className="grouping-toolbar">
              <button
                type="button"
                className="users-add"
                data-yagu-id="button-add-grouping"
                onClick={addRow}
                aria-label="Add grouping"
                title="Add grouping"
              >
                <IconAdd size={20} />
              </button>
              <button
                type="button"
                className="users-remove"
                data-yagu-id="button-remove-grouping"
                onClick={removeRow}
                disabled={!selectedId || rows.length === 0}
                aria-label="Remove grouping"
                title="Remove grouping"
              >
                <IconDelete size={20} />
              </button>
            </div>
            <table className="setup-items">
              <thead>
                <tr>
                  <th>Grouping Name</th>
                  <th>Property</th>
                  <th style={{ width: '9rem' }}>Group segment</th>
                  <th style={{ width: '4rem', textAlign: 'center' }}>Default</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="setup-empty">
                      No groupings yet. Click “+ Add” to create one.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === selectedId ? 'selected' : ''}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td>
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        onFocus={() => setSelectedId(r.id)}
                      />
                    </td>
                    <td>
                      <select
                        value={String(r.property_id)}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = (v === 'img' || v === 'rating') ? v : Number(v);
                          // Switching to a derived property (Img / My
                          // rating) wipes the segment — segments only
                          // apply to value ranges, not to discrete
                          // has/hasn't or icon values.
                          updateRow(r.id, {
                            property_id: next,
                            ...(next === 'img' || next === 'rating' ? { segment: '' } : {}),
                          });
                        }}
                      >
                        {propOptions.map((o) => (
                          <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={r.segment ?? ''}
                        disabled={r.property_id === 'img' || r.property_id === 'rating'}
                        onChange={(e) => updateRow(r.id, { segment: e.target.value })}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.default}
                        onChange={(e) => setDefault(r.id, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        {error && <div className="setup-error">{error}</div>}
        <footer className="setup-footer">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'OK'}
          </button>
        </footer>
      </div>
    </div>
  );
}
