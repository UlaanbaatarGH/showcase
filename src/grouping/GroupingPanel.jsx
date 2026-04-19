import { useState } from 'react';
import { saveSetup } from '../data/backend.js';

// FIX372.5: Grouping definition popup. One row per project property;
// check 'Group' to mark it as a grouping axis, optionally enter a segment
// string (e.g. '1900-1909' or 'A-D'), and pick at most one Default row.
export default function GroupingPanel({
  properties,
  viewSetup,
  onCancel,
  onSave,
}) {
  const initialGroups = viewSetup?.showcase?.groups ?? [];
  const groupByProp = new Map(initialGroups.map((g) => [g.property_id, g]));

  const [rows, setRows] = useState(() =>
    (properties ?? []).map((p) => {
      const g = groupByProp.get(p.id);
      return {
        id: p.id,
        label: p.label,
        group: !!g,
        segment: g?.segment ?? '',
        default: !!g?.default,
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const updateRow = (id, patch) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // FIX372.5.1.1.1.5.1: checking Default on one row unchecks the others.
  const setDefault = (id, checked) => {
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        default: checked && r.id === id,
      })),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const groups = rows
        .filter((r) => r.group)
        .map((r) => ({
          property_id: r.id,
          segment: (r.segment ?? '').trim() || null,
          default: !!r.default,
        }));

      const nextViewSetup = {
        ...(viewSetup || {}),
        showcase: {
          ...(viewSetup?.showcase || {}),
          groups,
        },
      };

      const result = await saveSetup({
        // Preserve current properties list untouched.
        properties: (properties ?? []).map((p, i) => ({
          id: p.id,
          label: p.label,
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
      <div className="setup-panel" onClick={(e) => e.stopPropagation()}>
        <header className="setup-header">
          <h2>Grouping</h2>
        </header>
        <div className="setup-body">
          <section className="setup-section">
            <table className="setup-items">
              <thead>
                <tr>
                  <th style={{ width: '3rem' }}>Id</th>
                  <th>Name</th>
                  <th style={{ width: '4rem', textAlign: 'center' }}>Group</th>
                  <th style={{ width: '9rem' }}>Group segment</th>
                  <th style={{ width: '4rem', textAlign: 'center' }}>Default</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="setup-empty">
                      No properties defined yet — add some from the gear ⚙ first.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.group}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          updateRow(r.id, {
                            group: checked,
                            // Unchecking clears segment + default.
                            ...(checked ? {} : { segment: '', default: false }),
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={r.segment}
                        disabled={!r.group}
                        placeholder="e.g. 1900-1909 or A-D"
                        onChange={(e) =>
                          updateRow(r.id, { segment: e.target.value })
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.default}
                        disabled={!r.group}
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
