import { useState } from 'react';
import { saveSetup } from './data/backend.js';

// FIX503.3.2 + FIX504[ex-500.2.3] <panel-showcase-view-setup>: standalone popup that
// displays only the Showcase view setup (columns, folder column new name,
// Roman year converter). Reached from <button-columns>. The tabbed general
// Setup panel still exposes the same content via its 'Showcase' tab.
export default function ShowcaseViewSetupPanel({
  projectId,
  properties,
  viewSetup,
  ratingSetup,
  isAnonymous = false,
  onCancel,
  onSave,
  onLocalSave,
  onLocalReset,
}) {
  // FIX504.2.1.2.2.6: raters lookup, keyed by project_rater id, for the
  // picker label and the existing-columns table.
  const ratersById = new Map((ratingSetup?.raters ?? []).map((r) => [r.id, r]));
  const [showcase, setShowcase] = useState(() => {
    // FIX504.2.1.2.1.3: no default items in the list — start from
    // whatever was saved, even if empty.
    const columns = (viewSetup?.showcase?.columns ?? []).map((c) => ({ ...c }));
    return {
      folder_column_name: viewSetup?.showcase?.folder_column_name ?? null,
      roman_year_converter: !!viewSetup?.showcase?.roman_year_converter,
      columns,
    };
  });
  // FIX504.2.1.3.3 (updated): move up/down by selecting a row first,
  // then pressing the toolbar Move buttons. The selected row stays selected
  // after a move. Track by stable column key (each key is unique per row —
  // availableToAdd dedups by key).
  const [selectedKey, setSelectedKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const columnKey = (col) => {
    if (col.type === 'property') return `prop_${col.property_id}`;
    // FIX504.2.1.2.2.6: one pickable entry per configured rater.
    if (col.type === 'user_rating') return `rater_${col.rater_id}`;
    return col.type;
  };
  const displayedColumnName = (col) => {
    if (col.type === 'folder_name') return '#';
    if (col.type === 'img') return 'Img';
    if (col.type === 'img_size') return 'Img size'; // FIX504.2.1.2.2.4
    if (col.type === 'img_zoom') return 'Img zoom factor'; // FIX504.2.1.2.2.5
    if (col.type === 'property') {
      const p = (properties ?? []).find((pp) => pp.id === col.property_id);
      return p?.label || '(missing property)';
    }
    // FIX504.2.1.2.2.6: identified by the user's name.
    if (col.type === 'user_rating') {
      return ratersById.get(col.rater_id)?.name || '(missing user)';
    }
    return col.type;
  };
  const availableToAdd = () => {
    const used = new Set(showcase.columns.map(columnKey));
    const options = [];
    // FIX504.2.1.2.2 (updated): picker aggregates the predefined
    // '#' (item id), the project's properties (<list-properties>), the
    // 'With image' derived property (rendered as 'Img' once added —
    // <derived-property-img>), and (FIX504.2.1.2.2.6) one entry per
    // configured rater, each identified by the user's name.
    if (!used.has('folder_name'))
      options.push({ key: 'folder_name', label: '#', create: () => ({ type: 'folder_name' }) });
    if (!used.has('img'))
      options.push({ key: 'img', label: 'With image', create: () => ({ type: 'img' }) });
    // FIX504.2.1.2.2.4 <Image size>: predefined column = total size of all
    // the item's images.
    if (!used.has('img_size'))
      options.push({ key: 'img_size', label: 'Img size', create: () => ({ type: 'img_size' }) });
    // FIX504.2.1.2.2.5: predefined column = the item's max image zoom factor.
    if (!used.has('img_zoom'))
      options.push({ key: 'img_zoom', label: 'Img zoom factor', create: () => ({ type: 'img_zoom' }) });
    for (const p of properties ?? []) {
      if ((p.label ?? '').trim() && !used.has(`prop_${p.id}`)) {
        options.push({
          key: `prop_${p.id}`,
          label: p.label,
          create: () => ({ type: 'property', property_id: p.id }),
        });
      }
    }
    // FIX504.2.1.2.2.6.1: while <field-enable-rating> is OFF, user's
    // ratings are not offered as new columns (already-added ones are
    // handled separately below, per FIX504.2.1.2.2.6.2).
    if (ratingSetup?.enabled) {
      for (const r of ratingSetup?.raters ?? []) {
        const key = `rater_${r.id}`;
        if (!used.has(key)) {
          options.push({
            key,
            label: r.name,
            create: () => ({ type: 'user_rating', rater_id: r.id }),
          });
        }
      }
    }
    return options;
  };
  const addColumn = (option) => {
    setShowcase({ ...showcase, columns: [...showcase.columns, option.create()] });
  };
  const removeColumn = (i) => {
    const removed = showcase.columns[i];
    setShowcase({ ...showcase, columns: showcase.columns.filter((_, idx) => idx !== i) });
    if (removed && columnKey(removed) === selectedKey) setSelectedKey(null);
  };
  const moveSelectedBy = (dir) => {
    if (!selectedKey) return;
    const i = showcase.columns.findIndex((c) => columnKey(c) === selectedKey);
    if (i < 0) return;
    const target = i + dir;
    if (target < 0 || target >= showcase.columns.length) return;
    const updated = [...showcase.columns];
    [updated[i], updated[target]] = [updated[target], updated[i]];
    setShowcase({ ...showcase, columns: updated });
    // selectedKey is unchanged — selection follows the moved row.
  };
  const updateColumn = (i, patch) => {
    const updated = [...showcase.columns];
    updated[i] = { ...updated[i], ...patch };
    setShowcase({ ...showcase, columns: updated });
  };
  // FIX504.2.1.2.1.3 + .3.1 / <input-row-order>: only positive
  // integers are accepted; blank clears the value (= "don't consider for
  // sorting", per FIX504.5.1). Reject anything else by ignoring the
  // keystroke.
  const updateRowOrder = (i, raw) => {
    const s = String(raw ?? '').trim();
    if (s === '') return updateColumn(i, { row_order: null });
    if (!/^\d+$/.test(s)) return;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1) return;
    updateColumn(i, { row_order: n });
  };

  const handleSave = async () => {
    // FIX504.2.1.3.5: anonymous users persist locally (no DB call);
    // logged-in users hit /api/setup as before.
    if (isAnonymous) {
      onLocalSave?.({
        columns: showcase.columns,
        folder_column_name: showcase.folder_column_name,
        roman_year_converter: showcase.roman_year_converter,
      });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Pass the existing property list through unchanged — saveSetup would
      // otherwise clear short_label/formula. Same approach as GroupingPanel.
      const data = await saveSetup({
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

  // FIX504.2.1.3.4 + FIX504.2.1.2.10: drop the local override
  // and revert to the DB column setup. Anonymous-only.
  const handleReset = () => {
    if (!isAnonymous) return;
    onLocalReset?.();
  };

  const addOptions = availableToAdd();
  const selectedIndex = selectedKey
    ? showcase.columns.findIndex((c) => columnKey(c) === selectedKey)
    : -1;
  const canMoveUp = selectedIndex > 0;
  const canMoveDown = selectedIndex >= 0 && selectedIndex < showcase.columns.length - 1;

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
            {/* FIX504.2.1.3.3 (updated): Move buttons act on the
                currently selected row. Disabled when no row is selected
                or the selected row is already at the edge. */}
            <div className="grouping-toolbar">
              <button
                type="button"
                onClick={() => moveSelectedBy(-1)}
                disabled={!canMoveUp}
                aria-label="Move up"
              >
                ↑ Move up
              </button>
              <button
                type="button"
                onClick={() => moveSelectedBy(1)}
                disabled={!canMoveDown}
                aria-label="Move down"
              >
                ↓ Move down
              </button>
            </div>
            <table className="setup-items">
              <thead>
                <tr>
                  <th>Column</th>
                  <th style={{ width: '8rem' }}>Width hint</th>
                  <th style={{ width: '4rem' }}>Wrap</th>
                  {/* FIX504.2.1.2.1.3 / <input-row-order>: per-column
                      sort priority used by FIX504.5.1. */}
                  <th style={{ width: '5rem' }}>Sort order</th>
                  <th style={{ width: '4rem' }} />
                </tr>
              </thead>
              <tbody>
                {showcase.columns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="setup-empty">No columns.</td>
                  </tr>
                )}
                {showcase.columns.map((col, i) => {
                  const key = columnKey(col);
                  // FIX504.2.1.2.2.6.2: an already-added rating column is
                  // shown disabled (not deleted) while rating is off — it
                  // also won't render on the actual item list (ShowcaseView).
                  const isDisabledRatingCol = col.type === 'user_rating' && !ratingSetup?.enabled;
                  return (
                    <tr
                      key={key}
                      className={`${key === selectedKey ? 'selected' : ''}${isDisabledRatingCol ? ' setup-row-disabled' : ''}`}
                      onClick={() => setSelectedKey(key)}
                    >
                      <td>
                        {displayedColumnName(col)}
                        {isDisabledRatingCol && ' (rating disabled)'}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={col.width ?? ''}
                          placeholder="auto"
                          onFocus={() => setSelectedKey(key)}
                          onChange={(e) => updateColumn(i, { width: e.target.value || null })}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!col.wrap}
                          onFocus={() => setSelectedKey(key)}
                          onChange={(e) => updateColumn(i, { wrap: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          data-yagu-id="input-row-order"
                          type="text"
                          inputMode="numeric"
                          value={col.row_order ?? ''}
                          placeholder="—"
                          onFocus={() => setSelectedKey(key)}
                          onChange={(e) => updateRowOrder(i, e.target.value)}
                        />
                      </td>
                      <td className="setup-row-actions">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeColumn(i);
                          }}
                          title="Remove"
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

            {/* FIX504.2.1.2.3 / <item-id-new-name>: optional
                replacement label for the '#' column (item id). Stored at
                view_setup.showcase.folder_column_name.
                FIX504.2.1.2.3.2 (updated): label and input on the same
                line. */}
            <label className="setup-inline-row">
              <span>New name for column &apos;#&apos;</span>
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
            </label>

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
          {/* FIX504.2.1.2.10 / .2.10.1: Reset button — only visible
              to anonymous users. Drops the local override so the panel
              and the Showcase fall back to the DB column setup
              (FIX504.2.1.3.4). */}
          {isAnonymous && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              title="Discard local column changes and revert to the project defaults"
            >
              Reset
            </button>
          )}
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
