import { useState } from 'react';
import { saveSetup } from './data/backend.js';

export default function SetupPanel({ properties: initialProperties, viewSetup: initialViewSetup, onSave, onCancel }) {
  const [tab, setTab] = useState('file_explorer');
  const [properties, setProperties] = useState(() =>
    (initialProperties ?? []).map((p) => ({ ...p })),
  );
  const [fileExplorer, setFileExplorer] = useState({
    main_img_icon_height: initialViewSetup?.file_explorer?.main_img_icon_height ?? 100,
  });
  const [showcase, setShowcase] = useState(() => {
    // FIX500.2.3.2.1.2.1.3.1: '#' is the one default item in the list —
    // always present, never removable. Inject it if missing.
    const saved = (initialViewSetup?.showcase?.columns ?? []).map((c) => ({ ...c }));
    const columns = saved.some((c) => c.type === 'folder_name')
      ? saved
      : [{ type: 'folder_name' }, ...saved];
    return {
      folder_column_name: initialViewSetup?.showcase?.folder_column_name ?? null,
      roman_year_converter: !!initialViewSetup?.showcase?.roman_year_converter,
      columns,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [nextTempId, setNextTempId] = useState(-1);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await saveSetup({
        properties: properties
          .filter((p) => (p.label ?? '').trim())
          .map((p, i) => ({ id: p.id, label: p.label.trim(), sort_order: i })),
        view_setup: {
          ...(initialViewSetup || {}),
          file_explorer: fileExplorer,
          showcase: {
            ...(initialViewSetup?.showcase || {}),
            ...showcase,
          },
        },
      });
      onSave(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  // --- Property list handlers (File Explorer tab) ---
  const addProperty = () => {
    setProperties([...properties, { id: nextTempId, label: '', sort_order: properties.length }]);
    setNextTempId(nextTempId - 1);
  };
  const removeProperty = (i) => {
    setProperties(properties.filter((_, idx) => idx !== i));
    // Also strip from showcase columns
    setShowcase((s) => ({
      ...s,
      columns: s.columns.filter(
        (c) => c.type !== 'property' || c.property_id !== properties[i].id,
      ),
    }));
  };
  const updatePropertyLabel = (i, label) => {
    const updated = [...properties];
    updated[i] = { ...updated[i], label };
    setProperties(updated);
  };
  const movePropertyBy = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= properties.length) return;
    const updated = [...properties];
    [updated[i], updated[target]] = [updated[target], updated[i]];
    setProperties(updated);
  };

  // --- Showcase columns handlers (Showcase tab) ---
  const columnKey = (col) => {
    if (col.type === 'property') return `prop_${col.property_id}`;
    return col.type;
  };
  const displayedColumnName = (col) => {
    if (col.type === 'folder_name') return '#';
    if (col.type === 'img') return 'Img';
    if (col.type === 'main_image_icon') return 'Main image icon';
    if (col.type === 'property') {
      const p = properties.find((pp) => pp.id === col.property_id);
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
    // FIX500.2.3.2.1.2.2: picker label is 'With image'; once added to the
    // column list, the column is shown as 'Img'.
    if (!used.has('img'))
      options.push({ key: 'img', label: 'With image', create: () => ({ type: 'img' }) });
    for (const p of properties) {
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

  const addOptions = availableToAdd();

  return (
    <div className="setup-overlay" onClick={onCancel}>
      <div className="setup-panel" onClick={(e) => e.stopPropagation()}>
        <header className="setup-header">
          <h2>Photo Setup</h2>
        </header>
        <div className="setup-tabs">
          <button
            type="button"
            className={tab === 'file_explorer' ? 'active' : ''}
            onClick={() => setTab('file_explorer')}
          >
            File Explorer
          </button>
          <button
            type="button"
            className={tab === 'showcase' ? 'active' : ''}
            onClick={() => setTab('showcase')}
          >
            Showcase
          </button>
        </div>
        <div className="setup-body">
          {tab === 'file_explorer' && (
            <section className="setup-section">
              <h3>List of properties</h3>
              <table className="setup-items">
                <thead>
                  <tr>
                    <th style={{ width: '3rem' }}>Id</th>
                    <th>Label</th>
                    <th style={{ width: '8rem' }} />
                  </tr>
                </thead>
                <tbody>
                  {properties.length === 0 && (
                    <tr>
                      <td colSpan={3} className="setup-empty">No properties defined.</td>
                    </tr>
                  )}
                  {properties.map((p, i) => (
                    <tr key={p.id}>
                      <td>{p.id > 0 ? p.id : <span className="setup-new">new</span>}</td>
                      <td>
                        <input
                          type="text"
                          value={p.label ?? ''}
                          onChange={(e) => updatePropertyLabel(i, e.target.value)}
                          placeholder="e.g. Year, Author…"
                        />
                      </td>
                      <td className="setup-row-actions">
                        <button type="button" onClick={() => movePropertyBy(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                        <button type="button" onClick={() => movePropertyBy(i, 1)} disabled={i === properties.length - 1} aria-label="Move down">↓</button>
                        <button type="button" onClick={() => removeProperty(i)} aria-label="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="setup-add-btn" onClick={addProperty}>
                + Add property
              </button>

              <h3>Main Image Icon height (px)</h3>
              <input
                type="number"
                min="1"
                value={fileExplorer.main_img_icon_height}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setFileExplorer({ ...fileExplorer, main_img_icon_height: Number.isFinite(n) && n > 0 ? n : 100 });
                }}
              />
            </section>
          )}

          {tab === 'showcase' && (
            <section className="setup-section">
              <h3>Showcase columns</h3>
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

              <h3>Item column name</h3>
              <input
                type="text"
                value={showcase.folder_column_name ?? ''}
                placeholder="Folder name (default)"
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
          )}
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
