import { useState } from 'react';
import { saveSetup } from './data/backend.js';

// FIX503.3.2 + FIX500.2.3 <panel-showcase-view-setup>: standalone popup that
// displays only the Showcase view setup (columns, folder column new name,
// Roman year converter). Reached from <button-columns>. The tabbed general
// Setup panel still exposes the same content via its 'Showcase' tab.
export default function ShowcaseViewSetupPanel({
  properties,
  viewSetup,
  onCancel,
  onSave,
}) {
  const [showcase, setShowcase] = useState(() => {
    // FIX500.2.3.2.1.2.1.3.1: '#' is the one default item in the list —
    // always present, never removable. Inject it if missing.
    const saved = (viewSetup?.showcase?.columns ?? []).map((c) => ({ ...c }));
    const columns = saved.some((c) => c.type === 'folder_name')
      ? saved
      : [{ type: 'folder_name' }, ...saved];
    return {
      folder_column_name: viewSetup?.showcase?.folder_column_name ?? null,
      roman_year_converter: !!viewSetup?.showcase?.roman_year_converter,
      columns,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const columnKey = (col) => {
    if (col.type === 'property') return `prop_${col.property_id}`;
    return col.type;
  };
  const displayedColumnName = (col) => {
    if (col.type === 'folder_name') return '#';
    if (col.type === 'img') return 'Img';
    if (col.type === 'main_image_icon') return 'Main image icon';
    if (col.type === 'property') {
      const p = (properties ?? []).find((pp) => pp.id === col.property_id);
      return p?.label || '(missing property)';
    }
    return col.type;
  };
  const availableToAdd = () => {
    const used = new Set(showcase.columns.map(columnKey));
    const options = [];
    if (!used.has('main_image_icon'))
      options.push({ key: 'main_image_icon', label: 'Main image icon', create: () => ({ type: 'main_image_icon' }) });
    if (!used.has('folder_name'))
      options.push({ key: 'folder_name', label: '#', create: () => ({ type: 'folder_name' }) });
    // FIX500.2.3.2.1.2.2: picker label is 'With image'; the added column
    // renders as 'Img'.
    if (!used.has('img'))
      options.push({ key: 'img', label: 'With image', create: () => ({ type: 'img' }) });
    for (const p of properties ?? []) {
      if ((p.label ?? '').trim() && !used.has(`prop_${p.id}`)) {
        options.push({
          key: `prop_${p.id}`,
          label: p.label,
          create: () => ({ type: 'property', property_id: p.id }),
        });
      }
    }
    return options;
  };
  const addColumn = (option) => {
    setShowcase({ ...showcase, columns: [...showcase.columns, option.create()] });
  };
  const removeColumn = (i) => {
    if (showcase.columns[i].type === 'folder_name') return;
    setShowcase({ ...showcase, columns: showcase.columns.filter((_, idx) => idx !== i) });
  };
  const moveColumnBy = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= showcase.columns.length) return;
    const updated = [...showcase.columns];
    [updated[i], updated[target]] = [updated[target], updated[i]];
    setShowcase({ ...showcase, columns: updated });
  };
  const updateColumn = (i, patch) => {
    const updated = [...showcase.columns];
    updated[i] = { ...updated[i], ...patch };
    setShowcase({ ...showcase, columns: updated });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Pass the existing property list through unchanged — saveSetup would
      // otherwise clear short_label/formula. Same approach as GroupingPanel.
      const data = await saveSetup({
        properties: (properties ?? []).map((p, i) => ({
          id: p.id,
          label: p.label,
          short_label: p.short_label ?? null,
          formula: p.formula ?? null,
          sort_order: p.sort_order ?? i,
        })),
        view_setup: {
          ...(viewSetup || {}),
          showcase: {
            ...(viewSetup?.showcase || {}),
            ...showcase,
          },
        },
      });
      onSave?.(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const addOptions = availableToAdd();

  return (
    <div className="setup-overlay" onClick={onCancel}>
      <div
        className="setup-panel"
        data-yagu-id="panel-showcase-view-setup"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="setup-header">
          <h2>Showcase columns</h2>
        </header>
        <div className="setup-body">
          <section className="setup-section">
            <table className="setup-items">
              <thead>
                <tr>
                  <th>Column</th>
                  <th style={{ width: '8rem' }}>Width hint</th>
                  <th style={{ width: '4rem' }}>Wrap</th>
                  <th style={{ width: '8rem' }} />
                </tr>
              </thead>
              <tbody>
                {showcase.columns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="setup-empty">No columns.</td>
                  </tr>
                )}
                {showcase.columns.map((col, i) => (
                  <tr key={`${columnKey(col)}_${i}`}>
                    <td>{displayedColumnName(col)}</td>
                    <td>
                      <input
                        type="text"
                        value={col.width ?? ''}
                        placeholder="auto"
                        onChange={(e) => updateColumn(i, { width: e.target.value || null })}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!col.wrap}
                        onChange={(e) => updateColumn(i, { wrap: e.target.checked })}
                      />
                    </td>
                    <td className="setup-row-actions">
                      <button type="button" onClick={() => moveColumnBy(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" onClick={() => moveColumnBy(i, 1)} disabled={i === showcase.columns.length - 1} aria-label="Move down">↓</button>
                      <button
                        type="button"
                        onClick={() => removeColumn(i)}
                        disabled={col.type === 'folder_name'}
                        title={col.type === 'folder_name' ? "'#' cannot be removed" : 'Remove'}
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {addOptions.length > 0 && (
              <div className="setup-add-col">
                <label>
                  Add column:&nbsp;
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const opt = addOptions.find((o) => o.key === e.target.value);
                      if (opt) addColumn(opt);
                      e.target.value = '';
                    }}
                    value=""
                  >
                    <option value="">— pick one —</option>
                    {addOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* FIX500.2.3.2.1.2.3 / <item-id-new-name>: optional replacement
                label for the '#' column (item id). Stored at
                view_setup.showcase.folder_column_name. */}
            <h3>New name for Property &apos;#&apos;</h3>
            <input
              type="text"
              value={showcase.folder_column_name ?? ''}
              placeholder="#"
              onChange={(e) =>
                setShowcase({
                  ...showcase,
                  folder_column_name: e.target.value.trim() ? e.target.value : null,
                })
              }
            />

            <label className="setup-checkbox-row">
              <input
                type="checkbox"
                checked={showcase.roman_year_converter}
                onChange={(e) =>
                  setShowcase({ ...showcase, roman_year_converter: e.target.checked })
                }
              />
              Roman year converter — append Arabic year to values of any 'Year' property
              written in Roman numerals (e.g. MDCXIII).
            </label>
          </section>
        </div>
        {error && <div className="setup-error">{error}</div>}
        <footer className="setup-footer">
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
