import { useState } from 'react';
import { saveSetup } from './data/backend.js';
import LanguageSetupPanel from './LanguageSetupPanel.jsx';
import { IconAdd, IconDelete, RATING_ICONS } from './Icons.jsx';

// FIX507.4.5 <rating-icon>: exactly three fixed rating symbols -- green
// tick (interested), orange question mark (not sure yet), red cross
// (not interested). <rating-icon> stores the key, not a raw glyph.
const RATING_ICON_CHOICES = [
  { key: 'yes', label: 'Interested' },
  { key: 'unknown', label: 'Not sure yet' },
  { key: 'no', label: 'Not interested' },
];

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
// replaces it via <button-columns>. FIX507 was later reused for the new
// Rating tab (FIX505.2.3) — unrelated to the earlier Sizes tab that once
// held that number.
export default function SetupPanel({
  projectId,
  properties: initialProperties,
  viewSetup: initialViewSetup,
  ratingSetup: initialRatingSetup,
  ratingCandidates,
  onSave,
  onCancel,
}) {
  // FIX505.2 (updated): the Setup popup hosts four tabs.
  //   - 'General'    → <panel-general-info-setup>  (FIX508)
  //   - 'Properties' → <tab-properties-setup>      (FIX506)
  //   - 'Rating'     → <panel-rating-setup>         (FIX507 — content still being defined)
  //   - 'Language'   → <panel-language-setup>      (FIX509)
  const [activeTab, setActiveTab] = useState('general');
  const [properties, setProperties] = useState(() =>
    (initialProperties ?? []).map((p) => ({ ...p })),
  );
  const [itemFilters, setItemFilters] = useState({
    // FIX506.2.3 / <setup-property-tagged-deleted>: id of the property
    // that marks an item as deleted when non-blank. null = no such property.
    deleted_property_id: initialViewSetup?.item_filters?.deleted_property_id ?? null,
    // FIX506.2.4 / <setup-date-property>: id of the property that holds
    // the item's date. Used by FIX510.5.2 / FIX374.2.16 to optionally
    // hide items missing a date. null = no such property.
    date_property_id: initialViewSetup?.item_filters?.date_property_id ?? null,
  });
  // FIX508 <panel-general-info-setup>: top-level toggles. Stored on
  // view_setup directly (not under item_filters) since they affect the
  // Showcase too. Default true (FIX508.2.1.1 / .2.2.1).
  // FIX508.2.3 / <setup-select-first-item>: default false — opening the
  // Showcase view leaves the selection empty until the user picks an item.
  const [generalSetup, setGeneralSetup] = useState({
    show_items_with_no_img: initialViewSetup?.show_items_with_no_img !== false,
    show_items_with_no_date: initialViewSetup?.show_items_with_no_date !== false,
    select_first_item: !!initialViewSetup?.select_first_item,
    // FIX508.2.5 / <setup-properties-gsheet>: the gsheet URL
    // <cmd-import-properties-gsheet> (FIX370) reads from and
    // <cmd-open-properties-gsheet> (FIX375) opens.
    properties_gsheet_url: initialViewSetup?.properties_gsheet_url || '',
    // FIX508.2.6 / <setup-initial-show-as>: defines <select-catalogue-
    // show-as>'s value at project opening. Defaulted to 'list'
    // (FIX508.2.6.2) -- independent of FIX503.2.11.2's own default for
    // the runtime selector itself, which only applies when a project has
    // no view_setup at all.
    initial_show_as: initialViewSetup?.initial_show_as === 'gallery' ? 'gallery' : 'list',
  });
  // FIX508.2.4 <item-short-label>: stack of (property, max_length)
  // entries. The Contact panel item list (FIX420.2.2) and other
  // 'one-liner per item' contexts use buildItemShortLabel() to render
  // the value.
  const [shortLabelParts, setShortLabelParts] = useState(
    () => Array.isArray(initialViewSetup?.item_short_label)
      ? initialViewSetup.item_short_label.map((p) => ({
          property_id: p.property_id ?? null,
          max_length: Number(p.max_length) || 0,
          prefix: p.prefix || '',
          suffix: p.suffix || '',
        }))
      : [],
  );
  // FIX507 <panel-rating-setup>: enable flag + rating values + raters.
  // FIX507.4.2: all three save through this same handleSave, not a
  // separate round trip.
  const [ratingEnabled, setRatingEnabled] = useState(!!initialRatingSetup?.enabled);
  const [ratingValues, setRatingValues] = useState(
    () => (initialRatingSetup?.values ?? []).map((v) => ({ ...v })),
  );
  const [selectedRatingValueIdx, setSelectedRatingValueIdx] = useState(null);
  const [openIconPickerIdx, setOpenIconPickerIdx] = useState(null);
  const [raters, setRaters] = useState(
    () => (initialRatingSetup?.raters ?? []).map((r) => ({ ...r })),
  );
  const [selectedRaterIdx, setSelectedRaterIdx] = useState(null);
  const [nextTempRatingId, setNextTempRatingId] = useState(-1);
  const [nextTempRaterId, setNextTempRaterId] = useState(-1);
  // FIX507.2.4 / FIX507.2.5: unchecked / defaulted to 2.
  const [showRatingConflict, setShowRatingConflict] = useState(!!initialRatingSetup?.show_conflict);
  const [conflictThreshold, setConflictThreshold] = useState(
    initialRatingSetup?.conflict_threshold ?? 2,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [nextTempId, setNextTempId] = useState(-1);

  const handleSave = async () => {
    // FIX509: every label cell on the Language tab autosaves on
    // blur, so there's nothing for /api/setup to do. Skip the
    // round-trip and close immediately — keeps the panel snappy
    // and avoids "Saving…" sticking around if /api/setup happens
    // to be slow / cold.
    if (activeTab === 'language') {
      onSave({});
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Persist deleted_property_id as-is — a stale id pointing at a property
      // that no longer exists is harmless (dropdown falls back to "— none —"
      // and the liveFolders lookup returns undefined for every folder, hiding
      // nothing). Auto-clearing here would cascade if, for any reason, the
      // local properties state was briefly missing the target property.
      const data = await saveSetup({
        // FIX401.2: scope writes to the project we're editing so
        // the wrong project doesn't get overwritten when more than
        // one exists.
        project_id: projectId,
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
          item_filters: itemFilters,
          // FIX508.2.1 / <show-items-with-no-img>: persists alongside
          // item_filters but applies to all views (Showcase included —
          // FIX510.5.1 / FIX374.2.15).
          show_items_with_no_img: generalSetup.show_items_with_no_img,
          // FIX508.2.2 / <show-items-with-no-date>: same shape; drives
          // FIX510.5.2 / FIX374.2.16. The date property itself is
          // <setup-date-property> on item_filters above.
          show_items_with_no_date: generalSetup.show_items_with_no_date,
          // FIX508.2.3 / <setup-select-first-item>: when false, the
          // Showcase view opens with no item selected.
          select_first_item: generalSetup.select_first_item,
          // FIX508.2.5 / <setup-properties-gsheet>.
          properties_gsheet_url: generalSetup.properties_gsheet_url.trim(),
          // FIX508.2.6 / <setup-initial-show-as>.
          initial_show_as: generalSetup.initial_show_as,
          // FIX508.2.4 / <item-short-label>: persist the stack only
          // with parts pointing at known properties (drop orphans
          // pointing at deleted properties). FIX508.2.4.2: optional
          // prefix / suffix per part; both default to ''.
          item_short_label: shortLabelParts
            .filter((p) => p.property_id != null
              && properties.some((pp) => pp.id === p.property_id))
            .map((p) => ({
              property_id: p.property_id,
              max_length: Number(p.max_length) || 0,
              prefix: p.prefix || '',
              suffix: p.suffix || '',
            })),
        },
        // FIX507.4.2 <panel-rating-setup>: saved as part of this same
        // general setup save function.
        rating: {
          enabled: ratingEnabled,
          // FIX507.2.2.1.1 <rating-text> / .2 <rating-icon>: blank-text
          // rows are dropped, same as a blank property label.
          values: ratingValues
            .filter((v) => (v.text ?? '').trim())
            .map((v, i) => ({
              id: v.id,
              text: v.text.trim(),
              icon: v.icon || null,
              sort_order: i,
            })),
          // FIX507.2.3.1.1 <rating-user>: a row with no picked user
          // isn't a real rater yet, same treatment.
          raters: raters
            .filter((r) => r.user_id)
            .map((r) => ({
              id: r.id,
              user_id: r.user_id,
              acronym: (r.acronym ?? '').trim(),
              enabled: !!r.enabled,
            })),
          // FIX507.2.4 / FIX507.2.5.
          show_conflict: showRatingConflict,
          conflict_threshold: Number(conflictThreshold) || 2,
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

  // FIX507.2.2.1.13 <table-rating-values> Add: green + row, selected.
  const addRatingValue = () => {
    setRatingValues((prev) => {
      const next = [...prev, { id: nextTempRatingId, text: '', icon: '' }];
      setSelectedRatingValueIdx(next.length - 1);
      return next;
    });
    setNextTempRatingId((n) => n - 1);
  };
  // FIX507.2.2.1.14: Del enabled only when a row is selected (button
  // itself is gated on selectedRatingValueIdx in the JSX below).
  const removeSelectedRatingValue = () => {
    if (selectedRatingValueIdx == null) return;
    setRatingValues((prev) => prev.filter((_, i) => i !== selectedRatingValueIdx));
    setSelectedRatingValueIdx(null);
    setOpenIconPickerIdx(null);
  };
  const updateRatingValue = (i, patch) => {
    setRatingValues((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  };

  // FIX507.2.3.1.13 <table-users-allowed-to-rate> Add: same pattern.
  const addRater = () => {
    setRaters((prev) => {
      // FIX507.4.4: a freshly added row is enabled by default.
      const next = [...prev, { id: nextTempRaterId, user_id: null, acronym: '', enabled: true }];
      setSelectedRaterIdx(next.length - 1);
      return next;
    });
    setNextTempRaterId((n) => n - 1);
  };
  const removeSelectedRater = () => {
    if (selectedRaterIdx == null) return;
    setRaters((prev) => prev.filter((_, i) => i !== selectedRaterIdx));
    setSelectedRaterIdx(null);
  };
  const updateRater = (i, patch) => {
    setRaters((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  return (
    // Backdrop is no longer click-to-dismiss — clicking outside
    // was racing async saves (notably the Language tab's per-cell
    // autosave) and dropping data. Only the Cancel / Save buttons
    // close the popup.
    <div className="setup-overlay">
      <div className="setup-panel" onClick={(e) => e.stopPropagation()}>
        {/* FIX505.2.5: title is 'Setup'. */}
        <header className="setup-header">
          <h2>Setup</h2>
        </header>
        {/* FIX505.2 (updated): tab strip — General / Properties /
            Rating / Language (FIX505.2.0 diagram). Tab buttons themselves
            carry no data-yagu-id (FIX505.2.1.0[removed] dropped the one on
            Properties); the *content* sections do, per FIX506.0,
            FIX507.0, FIX509.0. FIX505.3.{1..5} are the click
            handlers below. */}
        <div className="setup-tabs">
          <button
            type="button"
            className={activeTab === 'general' ? 'active' : ''}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={activeTab === 'properties' ? 'active' : ''}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          {/* FIX505.2.3 <tab-rating-setup>: opens <panel-rating-setup>
              per FIX505.3.4. */}
          <button
            type="button"
            className={activeTab === 'rating' ? 'active' : ''}
            data-yagu-id="tab-rating-setup"
            onClick={() => setActiveTab('rating')}
          >
            Rating
          </button>
          <button
            type="button"
            className={activeTab === 'language' ? 'active' : ''}
            data-yagu-id="tab-language-setup"
            onClick={() => setActiveTab('language')}
          >
            Language
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
              {/* FIX508.2.2 / <show-items-with-no-date>: drives
                  FIX510.5.2 / FIX374.2.16. The date property itself is
                  picked on the Properties tab (FIX506.2.4 /
                  <setup-date-property>). Default on (FIX508.2.2.1). */}
              <label className="setup-checkbox-row">
                <input
                  data-yagu-id="show-items-with-no-date"
                  type="checkbox"
                  checked={generalSetup.show_items_with_no_date}
                  onChange={(e) =>
                    setGeneralSetup({
                      ...generalSetup,
                      show_items_with_no_date: e.target.checked,
                    })
                  }
                />
                Show items with no date
              </label>
              {/* FIX508.2.3 / <setup-select-first-item>: when off (the
                  default), the Showcase view opens with no item selected. */}
              <label className="setup-checkbox-row">
                <input
                  data-yagu-id="setup-select-first-item"
                  type="checkbox"
                  checked={generalSetup.select_first_item}
                  onChange={(e) =>
                    setGeneralSetup({
                      ...generalSetup,
                      select_first_item: e.target.checked,
                    })
                  }
                />
                Select first item by default
              </label>
              {/* FIX508.2.6 / <setup-initial-show-as>: defines
                  <select-catalogue-show-as>'s value at project opening.
                  Defaulted to 'Item list' (FIX508.2.6.2). */}
              <label className="setup-checkbox-row">
                Show item gallery at opening
                <select
                  data-yagu-id="setup-initial-show-as"
                  value={generalSetup.initial_show_as}
                  onChange={(e) =>
                    setGeneralSetup({
                      ...generalSetup,
                      initial_show_as: e.target.value,
                    })
                  }
                >
                  <option value="list">Item list</option>
                  <option value="gallery">Item gallery</option>
                </select>
              </label>
              {/* FIX508.2.4 + FIX508.2.4.2 + FIX508.2.4.3 + FIX508.5.1
                  <item-short-label>: ordered stack of
                  (property, prefix, suffix, max length) entries that
                  buildItemShortLabel() collapses into a one-line item
                  label. Empty values skip the whole entry (no
                  prefix/suffix either). Longer values are hard-
                  truncated to max length, and a trailing '...' is
                  appended when any part was truncated. max length = 0
                  means no truncation. Prefix / suffix are optional
                  wrapper text added around the (truncated) value. */}
              <div
                className="setup-short-label"
                data-yagu-id="item-short-label"
              >
                <h3 className="setup-short-label-title">Item short label</h3>
                <table className="setup-items">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th style={{ width: '6rem' }}>Prefix</th>
                      <th style={{ width: '6rem' }}>Suffix</th>
                      <th style={{ width: '7rem' }}>Max length</th>
                      <th style={{ width: '4rem' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {shortLabelParts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="setup-empty">
                          No part defined yet — add one to enable a short label.
                        </td>
                      </tr>
                    )}
                    {shortLabelParts.map((part, i) => (
                      <tr key={i}>
                        <td>
                          <select
                            value={part.property_id ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === ''
                                ? null
                                : Number(e.target.value);
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i ? { ...p, property_id: v } : p,
                                ),
                              );
                            }}
                          >
                            <option value="">— pick a property —</option>
                            {properties
                              .filter((p) => (p.label ?? '').trim())
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={part.prefix}
                            onChange={(e) => {
                              const v = e.target.value;
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i ? { ...p, prefix: v } : p,
                                ),
                              );
                            }}
                            placeholder="e.g. ["
                            title="Text inserted before the value (only when value is non-empty)"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={part.suffix}
                            onChange={(e) => {
                              const v = e.target.value;
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i ? { ...p, suffix: v } : p,
                                ),
                              );
                            }}
                            placeholder="e.g. ]"
                            title="Text inserted after the value (only when value is non-empty)"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={part.max_length}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i ? { ...p, max_length: v } : p,
                                ),
                              );
                            }}
                            title="0 = no truncation"
                          />
                        </td>
                        <td className="setup-row-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i - 1
                                    ? prev[i]
                                    : idx === i
                                    ? prev[i - 1]
                                    : p,
                                ),
                              )
                            }
                            disabled={i === 0}
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setShortLabelParts((prev) =>
                                prev.map((p, idx) =>
                                  idx === i + 1
                                    ? prev[i]
                                    : idx === i
                                    ? prev[i + 1]
                                    : p,
                                ),
                              )
                            }
                            disabled={i === shortLabelParts.length - 1}
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setShortLabelParts((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="setup-add-btn"
                  onClick={() =>
                    setShortLabelParts((prev) => [
                      ...prev,
                      { property_id: null, max_length: 0, prefix: '', suffix: '' },
                    ])
                  }
                >
                  + Add part
                </button>
              </div>
              {/* FIX508.2.5 / <setup-properties-gsheet>: the gsheet URL
                  <cmd-import-properties-gsheet> (FIX370.4.1) reads
                  from and <cmd-open-properties-gsheet> (FIX375) opens. */}
              <label className="setup-inline-row">
                <span>Properties Google sheet</span>
                <input
                  type="text"
                  data-yagu-id="setup-properties-gsheet"
                  value={generalSetup.properties_gsheet_url}
                  onChange={(e) =>
                    setGeneralSetup({
                      ...generalSetup,
                      properties_gsheet_url: e.target.value,
                    })
                  }
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                />
              </label>
            </section>
          )}
          {activeTab === 'rating' && (
            /* FIX507.0 <panel-rating-setup>: opened via FIX505.3.4. */
            <section className="setup-section" data-yagu-id="panel-rating-setup">
              <h3>Rating</h3>
              {/* FIX507.2.1 <field-enable-rating>: unchecked by default
                  (FIX507.2.1.2). FIX507.4.1: gates rating on items and
                  the rating column picker (FIX504.2.1.2.2.6.1) — doesn't
                  block anything else on this page. */}
              <label className="setup-checkbox-row">
                <input
                  data-yagu-id="field-enable-rating"
                  type="checkbox"
                  checked={ratingEnabled}
                  onChange={(e) => setRatingEnabled(e.target.checked)}
                />
                Enable item rating
              </label>

              {/* FIX507.2.2 Section 'Rating values'. */}
              <h3>Rating values</h3>
              <div className="setup-selectable-toolbar">
                <button
                  type="button"
                  className="users-remove"
                  onClick={removeSelectedRatingValue}
                  disabled={selectedRatingValueIdx == null}
                  aria-label="Delete rating value"
                  title="Delete selected rating value"
                >
                  <IconDelete size={20} />
                </button>
                <button
                  type="button"
                  className="users-add"
                  onClick={addRatingValue}
                  aria-label="Add rating value"
                  title="Add rating value"
                >
                  <IconAdd size={20} />
                </button>
              </div>
              <table className="setup-items" data-yagu-id="table-rating-values">
                <thead>
                  <tr>
                    <th>Text</th>
                    <th style={{ width: '5rem', textAlign: 'center' }}>Icon</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingValues.length === 0 && (
                    <tr>
                      <td colSpan={2} className="setup-empty">No rating value defined.</td>
                    </tr>
                  )}
                  {ratingValues.map((v, i) => {
                    const RatingIcon = RATING_ICONS[v.icon];
                    return (
                      <tr
                        key={v.id ?? `new-${i}`}
                        className={selectedRatingValueIdx === i ? 'selected' : ''}
                        onClick={() => setSelectedRatingValueIdx(i)}
                      >
                        {/* FIX507.2.2.1.12 Row edition: Inline. */}
                        <td>
                          <input
                            data-yagu-id="rating-text"
                            type="text"
                            value={v.text ?? ''}
                            onChange={(e) => updateRatingValue(i, { text: e.target.value })}
                          />
                        </td>
                        <td className="setup-icon-cell" style={{ textAlign: 'center', position: 'relative' }}>
                          <button
                            type="button"
                            data-yagu-id="rating-icon"
                            className="setup-icon-picker-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRatingValueIdx(i);
                              setOpenIconPickerIdx(openIconPickerIdx === i ? null : i);
                            }}
                            aria-label="Pick icon"
                          >
                            {RatingIcon ? <RatingIcon size={20} /> : '—'}
                          </button>
                          {openIconPickerIdx === i && (
                            <div
                              className="setup-icon-popover"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {RATING_ICON_CHOICES.map(({ key, label }) => {
                                const ChoiceIcon = RATING_ICONS[key];
                                return (
                                  <button
                                    type="button"
                                    key={key}
                                    onClick={() => {
                                      updateRatingValue(i, { icon: key });
                                      setOpenIconPickerIdx(null);
                                    }}
                                    title={label}
                                    aria-label={label}
                                  >
                                    <ChoiceIcon size={20} />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* FIX507.2.3 Section 'Users allow to rate'. */}
              <h3>Users allowed to rate</h3>
              <div className="setup-selectable-toolbar">
                <button
                  type="button"
                  className="users-remove"
                  onClick={removeSelectedRater}
                  disabled={selectedRaterIdx == null}
                  aria-label="Delete rater"
                  title="Delete selected rater"
                >
                  <IconDelete size={20} />
                </button>
                <button
                  type="button"
                  className="users-add"
                  onClick={addRater}
                  aria-label="Add rater"
                  title="Add rater"
                >
                  <IconAdd size={20} />
                </button>
              </div>
              <table className="setup-items" data-yagu-id="table-users-allowed-to-rate">
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{ width: '8rem' }}>Acronym</th>
                    <th style={{ width: '5rem', textAlign: 'center' }}>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {raters.length === 0 && (
                    <tr>
                      <td colSpan={3} className="setup-empty">No user allowed to rate yet.</td>
                    </tr>
                  )}
                  {raters.map((r, i) => (
                    <tr
                      key={r.id ?? `new-${i}`}
                      className={selectedRaterIdx === i ? 'selected' : ''}
                      onClick={() => setSelectedRaterIdx(i)}
                    >
                      <td>
                        {/* FIX507.2.3.1.12.1: picked from users having
                            admin or data-manager rights on this project
                            — already-picked candidates are hidden from
                            every other row's dropdown to avoid a
                            duplicate-user row. */}
                        <select
                          data-yagu-id="rating-user"
                          value={r.user_id ?? ''}
                          onChange={(e) => updateRater(i, { user_id: e.target.value || null })}
                        >
                          <option value="">— pick a user —</option>
                          {(ratingCandidates ?? [])
                            .filter((c) => c.id === r.user_id
                              || !raters.some((rr, ri) => ri !== i && rr.user_id === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          data-yagu-id="rating-user-acronym"
                          type="text"
                          value={r.acronym ?? ''}
                          onChange={(e) => updateRater(i, { acronym: e.target.value })}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          data-yagu-id="rating-user-enabled"
                          type="checkbox"
                          checked={!!r.enabled}
                          onChange={(e) => updateRater(i, { enabled: e.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* FIX507.2.4 <field-show-rating-conflict>: unchecked by
                  default (FIX507.2.4.2). */}
              <label className="setup-checkbox-row">
                <input
                  data-yagu-id="field-show-rating-conflict"
                  type="checkbox"
                  checked={showRatingConflict}
                  onChange={(e) => setShowRatingConflict(e.target.checked)}
                />
                Show conflicts
              </label>
              {/* FIX507.2.5 <field-rating-conflict-threshold>: mandatory,
                  defaulted to 2 (FIX507.2.5.1). Blank/invalid falls back
                  to 2 on blur rather than blocking Save. */}
              <label className="setup-inline-row">
                <span>Conflict threshold</span>
                <input
                  data-yagu-id="field-rating-conflict-threshold"
                  type="text"
                  inputMode="numeric"
                  value={conflictThreshold}
                  onChange={(e) => setConflictThreshold(e.target.value)}
                  onBlur={() => {
                    const n = Number(conflictThreshold);
                    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) setConflictThreshold(2);
                  }}
                />
              </label>
            </section>
          )}
          {/* FIX505.3.5 + FIX509 <panel-language-setup>: provides app
              labels in different languages. */}
          {activeTab === 'language' && <LanguageSetupPanel />}
          {activeTab === 'properties' && (
          /* FIX506.0 <tab-properties-setup>: Properties tab content
             (was <panel-file-explorer-view-setup> pre-FIX506.0). */
          <section className="setup-section" data-yagu-id="tab-properties-setup">
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
                    {/* FIX350.2.2.2.1.1 / .1.1.1: stored id is
                        project_id*1000 + N; display the local part
                        (= id mod 1000) so users see 1, 2, 3… */}
                    <td>{p.id > 0 ? (p.id % 1000) : <span className="setup-new">new</span>}</td>
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

            {/* FIX506.2.3: pick the property whose non-blank value marks
                an item as deleted. Deleted items are hidden from the
                Showcase list/sort/filter/grouping (FIX510.3). */}
            <h3>Property indicating Item is deleted</h3>
            <select
              value={itemFilters.deleted_property_id ?? ''}
              onChange={(e) =>
                setItemFilters({
                  ...itemFilters,
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

            {/* FIX506.2.4 / <setup-date-property>: pick the property
                that holds the item's date. Used by FIX510.5.2 /
                FIX374.2.16 (combined with <show-items-with-no-date>
                on the General tab) to optionally hide items that
                don't have a date. */}
            <h3>Property providing item date</h3>
            <select
              data-yagu-id="setup-date-property"
              value={itemFilters.date_property_id ?? ''}
              onChange={(e) =>
                setItemFilters({
                  ...itemFilters,
                  date_property_id: e.target.value === '' ? null : Number(e.target.value),
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
          {/* Cancel is intentionally NOT disabled while saving, so a
              slow / hanging /api/setup never traps the user inside
              the modal with no way out. */}
          <button type="button" onClick={onCancel}>
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

