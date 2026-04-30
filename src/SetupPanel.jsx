import { useEffect, useState } from 'react';
import { saveSetup, getStorageSize } from './data/backend.js';

function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// FIX506.5.3: a property's name field may be either a plain label
// ("Year") or a definition with a formula ("pageCount = numberOf(pages)").
// These helpers convert between the stored {label, formula} shape and the
// single-line input the user sees.
function parsePropertyInput(raw) {
  const s = String(raw ?? '');
  const eq = s.indexOf('=');
  if (eq === -1) return { label: s.trim(), formula: null };
  const label = s.slice(0, eq).trim();
  const formula = s.slice(eq + 1).trim();
  return { label, formula: formula || null };
}
function formatPropertyInput(p) {
  if (p.formula) return `${p.label} = ${p.formula}`;
  return p.label ?? '';
}

// FIX505 <panel-general-setup>: Setup general panel. The Showcase tab was
// removed (FIX505.2.2(removed)) — the standalone ShowcaseViewSetupPanel
// replaces it via <button-columns>. What's left is the admin-only
// Properties tab (FIX505.2.1 + FIX505.2.1.0 <tab-properties-setup>), which
// binds to <panel-file-explorer-view-setup>.
export default function SetupPanel({ projectId, properties: initialProperties, viewSetup: initialViewSetup, onSave, onCancel }) {
  // FIX505.2 (updated): the Setup popup hosts three tabs.
  //   - 'General'    → <panel-general-info-setup>         (FIX508)
  //   - 'Properties' → <panel-file-explorer-view-setup>   (FIX506, .2.1)
  //   - 'Sizes'      → <panel-image-sizes>                (FIX507)
  const [activeTab, setActiveTab] = useState('general');
  const [properties, setProperties] = useState(() =>
    (initialProperties ?? []).map((p) => ({ ...p })),
  );
  const [fileExplorer, setFileExplorer] = useState({
    main_img_icon_height: initialViewSetup?.file_explorer?.main_img_icon_height ?? 100,
    // FIX506.2.3 / <setup-property-tagged-deleted>: id of the property
    // that marks an item as deleted when non-blank. null = no such property.
    deleted_property_id: initialViewSetup?.file_explorer?.deleted_property_id ?? null,
  });
  // FIX508 <panel-general-info-setup>: top-level toggles. Stored on
  // view_setup directly (not under file_explorer) since they affect the
  // Showcase too. Default true (FIX508.2.1.1).
  const [generalSetup, setGeneralSetup] = useState({
    show_items_with_no_img: initialViewSetup?.show_items_with_no_img !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [nextTempId, setNextTempId] = useState(-1);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Persist deleted_property_id as-is — a stale id pointing at a property
      // that no longer exists is harmless (dropdown falls back to "— none —"
      // and the liveFolders lookup returns undefined for every folder, hiding
      // nothing). Auto-clearing here would cascade if, for any reason, the
      // local properties state was briefly missing the target property.
      const data = await saveSetup({
        properties: properties
          .filter((p) => (p.label ?? '').trim())
          .map((p, i) => ({
            id: p.id,
            label: p.label.trim(),
            short_label: (p.short_label ?? '').trim() || null,
            formula: p.formula || null,
            // FIX506.2.1.1.4 / <input-property-trailing-values>: raw
            // user string ("'-', '?'"); parsing happens at sort time.
            trailing_values: (p.trailing_values ?? '').trim() || null,
            // FIX506.2.1.1.5 / <input-property-accepted-value-set>.
            accepted_value_set: !!p.accepted_value_set,
            sort_order: i,
          })),
        view_setup: {
          ...(initialViewSetup || {}),
          file_explorer: fileExplorer,
          // FIX508.2.1 / <show-items-with-no-img>: persists alongside
          // file_explorer but applies to all views (Showcase included —
          // FIX510.5.1 / FIX374.2.15).
          show_items_with_no_img: generalSetup.show_items_with_no_img,
        },
      });
      onSave(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const addProperty = () => {
    setProperties([
      ...properties,
      {
        id: nextTempId,
        label: '',
        short_label: '',
        formula: null,
        trailing_values: '',
        accepted_value_set: false,
        sort_order: properties.length,
      },
    ]);
    setNextTempId(nextTempId - 1);
  };
  const removeProperty = (i) => {
    setProperties(properties.filter((_, idx) => idx !== i));
  };
  const updatePropertyLabel = (i, rawInput) => {
    const { label, formula } = parsePropertyInput(rawInput);
    const updated = [...properties];
    // _raw tracks the user's exact text so mid-edit state (partial formula,
    // trailing spaces, etc.) isn't clobbered by round-tripping through parse.
    updated[i] = { ...updated[i], label, formula, _raw: rawInput };
    setProperties(updated);
  };
  const updatePropertyShortLabel = (i, short_label) => {
    const updated = [...properties];
    updated[i] = { ...updated[i], short_label };
    setProperties(updated);
  };
  const updatePropertyField = (i, patch) => {
    const updated = [...properties];
    updated[i] = { ...updated[i], ...patch };
    setProperties(updated);
  };
  const movePropertyBy = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= properties.length) return;
    const updated = [...properties];
    [updated[i], updated[target]] = [updated[target], updated[i]];
    setProperties(updated);
  };

  return (
    <div className="setup-overlay" onClick={onCancel}>
      <div className="setup-panel" onClick={(e) => e.stopPropagation()}>
        {/* FIX505.2.5: title is 'Setup'. */}
        <header className="setup-header">
          <h2>Setup</h2>
        </header>
        {/* FIX505.2 (updated): tab strip — General + Properties + Sizes. */}
        <div className="setup-tabs">
          <button
            type="button"
            className={activeTab === 'general' ? 'active' : ''}
            data-yagu-id="tab-general-setup"
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={activeTab === 'properties' ? 'active' : ''}
            data-yagu-id="tab-properties-setup"
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button
            type="button"
            className={activeTab === 'sizes' ? 'active' : ''}
            data-yagu-id="tab-sizes-setup"
            onClick={() => setActiveTab('sizes')}
          >
            Sizes
          </button>
        </div>
        <div className="setup-body">
          {activeTab === 'general' && (
            /* FIX508 <panel-general-info-setup>. */
            <section className="setup-section" data-yagu-id="panel-general-info-setup">
              <h3>General</h3>
              {/* FIX508.2.1 / <show-items-with-no-img>: drives FIX510.5.1
                  (Showcase list) and FIX374.2.15 (item grouping). Default
                  on (FIX508.2.1.1). */}
              <label className="setup-checkbox-row">
                <input
                  data-yagu-id="show-items-with-no-img"
                  type="checkbox"
                  checked={generalSetup.show_items_with_no_img}
                  onChange={(e) =>
                    setGeneralSetup({
                      ...generalSetup,
                      show_items_with_no_img: e.target.checked,
                    })
                  }
                />
                Show items with no image
              </label>
            </section>
          )}
          {activeTab === 'sizes' && (
            <SizesTab projectId={projectId} />
          )}
          {activeTab === 'properties' && (
          /* FIX505.2.3 / FIX506 <panel-file-explorer-view-setup>. */
          <section className="setup-section" data-yagu-id="panel-file-explorer-view-setup">
            <h3>List of properties</h3>
            {/* FIX506.2.1.0 / <list-properties> */}
            <table className="setup-items" data-yagu-id="list-properties">
              <thead>
                <tr>
                  <th style={{ width: '3rem' }}>Id</th>
                  {/* FIX506.2.1.1.2 / <property-name> */}
                  <th>Property name</th>
                  {/* FIX506.2.1.1.3 / <property-short-name>: optional
                      short label used in the Showcase column headers. */}
                  <th style={{ width: '9rem' }}>Property short name</th>
                  {/* FIX506.2.1.1.4 / <input-property-trailing-values>:
                      tokens always sorted to the end (FIX510.2.1.5). */}
                  <th style={{ width: '9rem' }}>Trailing values</th>
                  {/* FIX506.2.1.1.5 / <input-property-accepted-value-set>:
                      enables the FIX506.5.5 / FIX510.2.1.5 semantics. */}
                  <th style={{ width: '5rem', textAlign: 'center' }}>Value set</th>
                  <th style={{ width: '8rem' }} />
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 && (
                  <tr>
                    <td colSpan={6} className="setup-empty">No properties defined.</td>
                  </tr>
                )}
                {properties.map((p, i) => (
                  <tr key={p.id}>
                    <td>{p.id > 0 ? p.id : <span className="setup-new">new</span>}</td>
                    <td>
                      <input
                        type="text"
                        value={p._raw !== undefined ? p._raw : formatPropertyInput(p)}
                        onChange={(e) => updatePropertyLabel(i, e.target.value)}
                        placeholder="e.g. Year  —  or  pageCount = numberOf(pages)"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={p.short_label ?? ''}
                        onChange={(e) => updatePropertyShortLabel(i, e.target.value)}
                        placeholder="(optional)"
                      />
                    </td>
                    <td>
                      <input
                        data-yagu-id="input-property-trailing-values"
                        type="text"
                        value={p.trailing_values ?? ''}
                        onChange={(e) => updatePropertyField(i, { trailing_values: e.target.value })}
                        placeholder="'-', '?'"
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        data-yagu-id="input-property-accepted-value-set"
                        type="checkbox"
                        checked={!!p.accepted_value_set}
                        onChange={(e) => updatePropertyField(i, { accepted_value_set: e.target.checked })}
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

            {/* FIX506.2.3: pick the property whose non-blank value marks
                an item as deleted. Deleted items are hidden from the
                Showcase list/sort/filter/grouping (FIX510.3). */}
            <h3>Property indicating Item is deleted</h3>
            <select
              value={fileExplorer.deleted_property_id ?? ''}
              onChange={(e) =>
                setFileExplorer({
                  ...fileExplorer,
                  deleted_property_id: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            >
              <option value="">— none —</option>
              {properties
                .filter((p) => p.id > 0 && (p.label ?? '').trim())
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
            </select>
          </section>
          )}
        </div>
        {error && <div className="setup-error">{error}</div>}
        {/* FIX505.2.10 + FIX505.2.11 + FIX505.3.10 footer. */}
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

// FIX507 <panel-image-sizes>: Image sizes panel — currently exposes one
// read-only field, the total bytes used in Supabase Storage by all images
// linked to the current project (FIX507.2.1 / .2.1.1).
function SizesTab({ projectId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (projectId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStorageSize(projectId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);
  return (
    <section className="setup-section" data-yagu-id="panel-image-sizes">
      <h3>Image sizes</h3>
      {/* FIX507.2.1 / .2.1.1: total bytes for the project's images,
          read-only. Reads storage.objects.metadata so old uploads are
          included without any per-image bytes column on our side. */}
      <label className="setup-inline-row">
        <span>Size of Project images</span>
        <input
          type="text"
          readOnly
          value={
            loading ? 'Loading…'
            : error ? `Error: ${error}`
            : data ? `${formatBytes(data.bytes)}  (${data.image_count} image${data.image_count === 1 ? '' : 's'}${data.missing_count ? `, ${data.missing_count} missing` : ''})`
            : '—'
          }
        />
      </label>
    </section>
  );
}
