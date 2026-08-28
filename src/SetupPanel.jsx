import { useMemo, useState } from 'react';
import { saveSetup } from './data/backend.js';
import LanguageSetupPanel from './LanguageSetupPanel.jsx';
import { IconAdd, IconDelete, IconMoveUp, IconMoveDown, RATING_ICONS } from './Icons.jsx';
import { computePropertyValue } from './properties/formulas.js';

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
  // FIX512.2.2.1: the Image Caption rules table's Category column is a
  // dropdown of <setup-category-property>'s distinct values across the
  // project's items -- needs the same (folders, propertiesByLabel) pair
  // ItemDetailsPanel already receives from CatalogueView for the same
  // kind of per-property value lookup (computePropertyValue).
  folders,
  propertiesByLabel,
  onSave,
  onCancel,
}) {
  // FIX505.2.0 (updated): the Setup popup hosts five tabs.
  //   - 'General'        → <panel-general-info-setup>  (FIX508)
  //   - 'Properties'     → <tab-properties-setup>      (FIX506)
  //   - 'Image Captions' → <panel-img-caption-setup>   (FIX512 — content still being defined)
  //   - 'Rating'         → <panel-rating-setup>         (FIX507 — content still being defined)
  //   - 'Language'       → <panel-language-setup>      (FIX509)
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
    // FIX506.2.5 / <setup-category-property>: id of the property that
    // holds the item's category. Feeds the Image Caption rules table's
    // Category column (FIX512.2.2.1) with the distinct values that
    // property takes across the project's items. null = no such property.
    category_property_id: initialViewSetup?.item_filters?.category_property_id ?? null,
    // FIX506.2.6 / <setup-shape-property>: id of the property that holds
    // the item's shape. Feeds the Image Caption rules table's Shape
    // column (FIX512.2.2.3), further filtered by the row's selected
    // Category per FIX512.4.1. null = no such property.
    shape_property_id: initialViewSetup?.item_filters?.shape_property_id ?? null,
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
  // FIX507 <panel-rating-setup>: enable flag + rating values. Raters
  // are FIX507.2.3(removed) -- <role-rater> now lives on <panel-project>
  // like every other role, and saves immediately, not through here.
  // FIX507.4.2: enable flag + rating values still save through this
  // same handleSave.
  const [ratingEnabled, setRatingEnabled] = useState(!!initialRatingSetup?.enabled);
  const [ratingValues, setRatingValues] = useState(
    () => (initialRatingSetup?.values ?? []).map((v) => ({ ...v })),
  );
  const [selectedRatingValueIdx, setSelectedRatingValueIdx] = useState(null);
  const [openIconPickerIdx, setOpenIconPickerIdx] = useState(null);
  // FIX507.2.2.1.14.1: { idx, usage } while the confirmation popup is open
  // for a rating value some items already have. usage is the slice of
  // initialRatingSetup.value_usage for that value's id -- per-user counts,
  // fixed at panel-open time (matches the rest of this panel: everything
  // else here also stages against the initial snapshot until Save).
  const [ratingDeletePopup, setRatingDeletePopup] = useState(null);
  const [nextTempRatingId, setNextTempRatingId] = useState(-1);
  // FIX507.2.4 / FIX507.2.5: unchecked / defaulted to 3.
  const [showRatingConflict, setShowRatingConflict] = useState(!!initialRatingSetup?.show_conflict);
  const [conflictThreshold, setConflictThreshold] = useState(
    initialRatingSetup?.conflict_threshold ?? 3,
  );
  // FIX507.2.6 <field-rating-conflict-comparator>: dropdown {'<', '>'},
  // defaulted to '<'.
  const [conflictComparator, setConflictComparator] = useState(
    initialRatingSetup?.conflict_comparator === '>' ? '>' : '<',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [nextTempId, setNextTempId] = useState(-1);

  // FIX512.2.2 <setup-table-caption-rules>: persisted under
  // view_setup.img_caption_rules -- no dedicated FIX defines the storage
  // shape yet, so it rides the same opaque-JSONB view_setup column every
  // other Setup field already round-trips through (handleSave below),
  // same as e.g. FIX508.2.4's item_short_label stack. FIX512.2.2.10:
  // multiple rows can be selected at once (Click / Ctrl-click /
  // Shift-click), unlike <table-rating-values>'s single-row selection.
  const [imgCaptionRules, setImgCaptionRules] = useState(
    () => (initialViewSetup?.img_caption_rules ?? []).map((r) => ({ ...r })),
  );
  const [selectedRuleIdxs, setSelectedRuleIdxs] = useState(() => new Set());
  const [ruleAnchor, setRuleAnchor] = useState(null);
  // Unlike properties/ratingValues (server-assigned positive ids, so a
  // fresh -1 counter each session never collides), these ids are never
  // remapped by the backend -- a loaded row keeps whatever negative id it
  // was saved with. Start below the lowest loaded id so a new row's id
  // can't collide with one already on disk.
  const [nextTempRuleId, setNextTempRuleId] = useState(() => {
    const loadedIds = (initialViewSetup?.img_caption_rules ?? []).map((r) => Number(r.id) || 0);
    return Math.min(0, ...loadedIds) - 1;
  });
  // FIX512.3.1 (2nd bullet, del) confirmation popup: spec labels both the
  // Add and Del action bullets "FIX512.3.1" -- likely a typo for the Del
  // one (probably meant .3.2); flagging here rather than silently
  // renumbering the spec (NCF).
  const [ruleDeleteConfirm, setRuleDeleteConfirm] = useState(false);

  // FIX512.2.2.1 <img-caption-category>: the Category column's dropdown
  // lists the distinct non-blank values <setup-category-property> takes
  // across the project's items -- same per-property value lookup
  // ItemDetailsPanel already does (computePropertyValue), just collected
  // across every folder instead of rendered for one.
  const categoryProperty = properties.find((p) => p.id === itemFilters.category_property_id) ?? null;
  const categoryValueOptions = useMemo(() => {
    if (!categoryProperty) return [];
    const set = new Set();
    for (const f of folders ?? []) {
      const s = String(computePropertyValue(f, categoryProperty, propertiesByLabel) ?? '').trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryProperty?.id, categoryProperty?.formula, folders, propertiesByLabel]);

  // FIX512.2.2.3 <img-caption-shape> / FIX512.4.1: the Shape column's
  // options "fully depend on the selected <img-caption-category>" -- map
  // each category value to the distinct shape values seen on folders
  // that have that category (a folder missing either value contributes
  // nothing). A row with no category picked yet has no shape options.
  const shapeProperty = properties.find((p) => p.id === itemFilters.shape_property_id) ?? null;
  const shapeOptionsByCategory = useMemo(() => {
    const map = new Map();
    if (!categoryProperty || !shapeProperty) return map;
    for (const f of folders ?? []) {
      const cat = String(computePropertyValue(f, categoryProperty, propertiesByLabel) ?? '').trim();
      const shape = String(computePropertyValue(f, shapeProperty, propertiesByLabel) ?? '').trim();
      if (!cat || !shape) continue;
      if (!map.has(cat)) map.set(cat, new Set());
      map.get(cat).add(shape);
    }
    for (const [k, set] of map) {
      map.set(k, [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryProperty?.id, categoryProperty?.formula, shapeProperty?.id, shapeProperty?.formula, folders, propertiesByLabel]);
  const shapeOptionsFor = (categoryValue) => shapeOptionsByCategory.get(categoryValue) ?? [];

  // FIX512.2.2.10: plain click selects only that row; Ctrl/Cmd-click
  // toggles it into/out of the selection; Shift-click selects the
  // anchor..clicked range. Same conventions as the Image List editor's
  // row multi-select (FIX521.2.1.9), scaled down to what FIX512 asks for.
  const handleRuleRowClick = (e, idx) => {
    if (e.shiftKey && ruleAnchor != null) {
      const lo = Math.min(ruleAnchor, idx);
      const hi = Math.max(ruleAnchor, idx);
      const range = new Set();
      for (let i = lo; i <= hi; i++) range.add(i);
      setSelectedRuleIdxs(range);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedRuleIdxs((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
      setRuleAnchor(idx);
      return;
    }
    setSelectedRuleIdxs(new Set([idx]));
    setRuleAnchor(idx);
  };
  // FIX512.3.1 (1st bullet) <cmd-add-rule>: adds a new rule at the bottom
  // of the table, selected so it's immediately editable.
  const addCaptionRule = () => {
    setImgCaptionRules((prev) => {
      const next = [...prev, { id: nextTempRuleId, category: '', shape: '', op: 'is', rule: '' }];
      setSelectedRuleIdxs(new Set([next.length - 1]));
      setRuleAnchor(next.length - 1);
      return next;
    });
    setNextTempRuleId((n) => n - 1);
  };
  // FIX512.2.11 <cmd-del-rule>: enabled only when 1+ rows selected (gated
  // in the JSX below). FIX512.3.1 (2nd bullet): confirm before removing.
  const confirmRemoveCaptionRules = () => {
    setImgCaptionRules((prev) => prev.filter((_, i) => !selectedRuleIdxs.has(i)));
    setSelectedRuleIdxs(new Set());
    setRuleAnchor(null);
    setRuleDeleteConfirm(false);
  };
  const updateCaptionRule = (i, patch) => {
    setImgCaptionRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  // FIX512.3.3 / FIX512.3.4 <cmd-move-up> / <cmd-move-down>: swap the
  // single selected row with its neighbor. FIX512.2.12 / FIX512.2.13 gate
  // the buttons to exactly one row selected and not already at that edge.
  const moveSelectedRuleBy = (dir) => {
    if (selectedRuleIdxs.size !== 1) return;
    const idx = [...selectedRuleIdxs][0];
    const target = idx + dir;
    if (target < 0 || target >= imgCaptionRules.length) return;
    setImgCaptionRules((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setSelectedRuleIdxs(new Set([target]));
    setRuleAnchor(target);
  };

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
          // FIX512.2.2 <setup-table-caption-rules>: persist only rules
          // with actual caption text, same "drop the blank ones" rule as
          // properties/ratingValues above.
          img_caption_rules: imgCaptionRules
            .filter((r) => (r.rule ?? '').trim())
            .map((r) => ({
              id: r.id,
              category: r.category || '',
              shape: r.shape || '',
              op: r.op || 'is',
              rule: r.rule.trim(),
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
          // FIX507.2.4 / FIX507.2.5.
          show_conflict: showRatingConflict,
          conflict_threshold: Number(conflictThreshold) || 3,
          // FIX507.2.6.
          conflict_comparator: conflictComparator,
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
  // FIX507.2.2.1.14.1: if items were already given this rating, confirm
  // first instead of deleting outright.
  const removeSelectedRatingValue = () => {
    if (selectedRatingValueIdx == null) return;
    const v = ratingValues[selectedRatingValueIdx];
    const usage = (initialRatingSetup?.value_usage ?? [])
      .filter((u) => u.rating_value_id === v.id);
    if (usage.length > 0) {
      setRatingDeletePopup({ idx: selectedRatingValueIdx, usage });
      return;
    }
    setRatingValues((prev) => prev.filter((_, i) => i !== selectedRatingValueIdx));
    setSelectedRatingValueIdx(null);
    setOpenIconPickerIdx(null);
  };
  const confirmRemoveRatingValue = () => {
    if (!ratingDeletePopup) return;
    const { idx } = ratingDeletePopup;
    setRatingValues((prev) => prev.filter((_, i) => i !== idx));
    setSelectedRatingValueIdx(null);
    setOpenIconPickerIdx(null);
    setRatingDeletePopup(null);
  };
  const updateRatingValue = (i, patch) => {
    setRatingValues((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
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
          {/* FIX505.2.5 / FIX505.2.5.0 <tab-img-caption-setup>: opens
              <panel-img-caption-setup> per FIX505.3.6. Sits between
              Properties and Rating per FIX505.2.0's updated tab order. */}
          <button
            type="button"
            className={activeTab === 'imgCaption' ? 'active' : ''}
            data-yagu-id="tab-img-caption-setup"
            onClick={() => setActiveTab('imgCaption')}
          >
            Image Captions
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
          {activeTab === 'imgCaption' && (
            /* FIX512 / FIX512.0 <panel-img-caption-setup>: opened via
               FIX505.3.6. FIX512.1 Purpose: create automatic image
               caption based on item properties. FIX512.2 UI Layout /
               FIX512.2.0[ex-512.2.1] diagram: an Add/Del toolbar above
               <setup-table-caption-rules>. */
            <section className="setup-section" data-yagu-id="panel-img-caption-setup">
              <h3>Image Captions</h3>
              <p className="setup-hint">
                Create automatic image captions based on item properties.
              </p>
              {/* FIX512.2.0[ex-512.2.1] diagram order: Add, Del, Up, Down
                  (left to right), unlike the Rating tab's Del-then-Add
                  toolbar above. */}
              <div className="setup-selectable-toolbar">
                <button
                  type="button"
                  className="users-add"
                  data-yagu-id="cmd-add-rule"
                  onClick={addCaptionRule}
                  aria-label="Add rule"
                  title="Add rule"
                >
                  <IconAdd size={20} />
                </button>
                <button
                  type="button"
                  className="users-remove"
                  data-yagu-id="cmd-del-rule"
                  onClick={() => setRuleDeleteConfirm(true)}
                  disabled={selectedRuleIdxs.size === 0}
                  aria-label="Delete rule"
                  title="Delete selected rule(s)"
                >
                  <IconDelete size={20} />
                </button>
                {/* FIX512.2.12 <cmd-move-up> / FIX512.2.13 <cmd-move-down>:
                    enabled only when exactly one row is selected and it
                    isn't already at that edge (FIX512.3.3 / FIX512.3.4). */}
                <button
                  type="button"
                  className="setup-move-btn"
                  data-yagu-id="cmd-move-up"
                  onClick={() => moveSelectedRuleBy(-1)}
                  disabled={selectedRuleIdxs.size !== 1 || [...selectedRuleIdxs][0] === 0}
                  aria-label="Move rule up"
                  title="Move rule up"
                >
                  <IconMoveUp size={20} />
                </button>
                <button
                  type="button"
                  className="setup-move-btn"
                  data-yagu-id="cmd-move-down"
                  onClick={() => moveSelectedRuleBy(1)}
                  disabled={
                    selectedRuleIdxs.size !== 1 || [...selectedRuleIdxs][0] === imgCaptionRules.length - 1
                  }
                  aria-label="Move rule down"
                  title="Move rule down"
                >
                  <IconMoveDown size={20} />
                </button>
              </div>
              <table className="setup-items" data-yagu-id="setup-table-caption-rules">
                <thead>
                  {/* FIX512.2.0[ex-512.2.1]: column order is Op, Category,
                      Shape, Caption. */}
                  <tr>
                    <th style={{ width: '8rem' }}>Op</th>
                    <th style={{ width: '10rem' }}>Category</th>
                    <th style={{ width: '10rem' }}>Shape</th>
                    {/* FIX512.2.2.2 (updated): header label shortened
                        'Caption rule' -> 'Caption' (id <img-caption-rule>
                        unchanged). Spec has a stray unclosed quote around
                        the new label -- read as 'Caption', matching the
                        FIX512.2.0 diagram's header text. */}
                    <th>Caption</th>
                  </tr>
                </thead>
                <tbody>
                  {imgCaptionRules.length === 0 && (
                    <tr>
                      <td colSpan={4} className="setup-empty">No caption rule defined.</td>
                    </tr>
                  )}
                  {imgCaptionRules.map((r, i) => (
                    <tr
                      key={r.id ?? `new-${i}`}
                      className={selectedRuleIdxs.has(i) ? 'selected' : ''}
                      onClick={(e) => handleRuleRowClick(e, i)}
                    >
                      {/* FIX512.2.2.4 <img-caption-op>: dropdown, fixed
                          {'is', 'starts with'} values. Inline edition. */}
                      <td>
                        <select
                          data-yagu-id="img-caption-op"
                          value={r.op ?? 'is'}
                          onChange={(e) => updateCaptionRule(i, { op: e.target.value })}
                        >
                          <option value="is">is</option>
                          <option value="starts with">starts with</option>
                        </select>
                      </td>
                      {/* FIX512.2.2.1 <img-caption-category>: dropdown of
                          <setup-category-property>'s distinct values.
                          Inline edition. */}
                      <td>
                        <select
                          data-yagu-id="img-caption-category"
                          value={r.category ?? ''}
                          onChange={(e) => {
                            const category = e.target.value;
                            // FIX512.4.1: Shape fully depends on Category --
                            // drop a shape value that doesn't apply anymore.
                            const validShapes = shapeOptionsFor(category);
                            updateCaptionRule(i, {
                              category,
                              shape: validShapes.includes(r.shape) ? r.shape : '',
                            });
                          }}
                        >
                          <option value="">— none —</option>
                          {categoryValueOptions.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      {/* FIX512.2.2.3 <img-caption-shape>: dropdown of
                          <setup-shape-property>'s values for the row's
                          Category (FIX512.4.1). Inline edition. */}
                      <td>
                        <select
                          data-yagu-id="img-caption-shape"
                          value={r.shape ?? ''}
                          onChange={(e) => updateCaptionRule(i, { shape: e.target.value })}
                        >
                          <option value="">— none —</option>
                          {shapeOptionsFor(r.category ?? '').map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      {/* FIX512.2.2.2 <img-caption-rule>: several-line
                          input text. Inline edition. */}
                      <td>
                        <textarea
                          data-yagu-id="img-caption-rule"
                          rows={2}
                          value={r.rule ?? ''}
                          onChange={(e) => updateCaptionRule(i, { rule: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    {/* FIX507.2.2.1.10: Rank first, then Text, then Icon. */}
                    <th style={{ width: '4rem', textAlign: 'center' }}>Rank</th>
                    <th>Text</th>
                    <th style={{ width: '5rem', textAlign: 'center' }}>Icon</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingValues.length === 0 && (
                    <tr>
                      <td colSpan={3} className="setup-empty">No rating value defined.</td>
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
                        {/* FIX507.2.2.1.3 <rating-rank>: automatically
                            assigned, 1-based -- this row's position in
                            the list, not editable. */}
                        <td data-yagu-id="rating-rank" style={{ textAlign: 'center' }}>
                          {i + 1}
                        </td>
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

              {/* FIX507.2.3(removed): the 'Users allowed to rate' table
                  is gone from this panel -- <role-rater> is granted per
                  user from <panel-project> (FIX351.2.1.8), same place
                  as every other role. */}

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
              {/* FIX507.2.0 (updated) layout: 'Conflict when rank
                  {comparator} {threshold}' -- FIX507.2.6
                  <field-rating-conflict-comparator> (dropdown '<'/'>',
                  defaulted to '<') and FIX507.2.5
                  <field-rating-conflict-threshold> (mandatory, defaulted
                  to 3 -- FIX507.2.5.1) share one sentence-style row.
                  Blank/invalid threshold falls back to 3 on blur rather
                  than blocking Save. */}
              <label className="setup-inline-row">
                <span>Conflict when rank</span>
                <select
                  data-yagu-id="field-rating-conflict-comparator"
                  value={conflictComparator}
                  onChange={(e) => setConflictComparator(e.target.value === '>' ? '>' : '<')}
                >
                  <option value="<">&lt;</option>
                  <option value=">">&gt;</option>
                </select>
                <input
                  data-yagu-id="field-rating-conflict-threshold"
                  type="text"
                  inputMode="numeric"
                  value={conflictThreshold}
                  onChange={(e) => setConflictThreshold(e.target.value)}
                  onBlur={() => {
                    const n = Number(conflictThreshold);
                    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) setConflictThreshold(3);
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

            {/* FIX506.2.5 / <setup-category-property>: pick the property
                whose value categorizes an item. Feeds the Image Caption
                rules table's Category column (FIX512.2.2.1) with that
                property's distinct values. */}
            <h3>Property providing item category</h3>
            <select
              data-yagu-id="setup-category-property"
              value={itemFilters.category_property_id ?? ''}
              onChange={(e) =>
                setItemFilters({
                  ...itemFilters,
                  category_property_id: e.target.value === '' ? null : Number(e.target.value),
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

            {/* FIX506.2.6 / <setup-shape-property>: pick the property
                whose value gives an item's shape. Feeds the Image Caption
                rules table's Shape column (FIX512.2.2.3), further scoped
                to the row's Category (FIX512.4.1). */}
            <h3>Property providing item shape</h3>
            <select
              data-yagu-id="setup-shape-property"
              value={itemFilters.shape_property_id ?? ''}
              onChange={(e) =>
                setItemFilters({
                  ...itemFilters,
                  shape_property_id: e.target.value === '' ? null : Number(e.target.value),
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
      {/* FIX507.2.2.1.14.1: Title 'Rating deletion', one "{user} assigned
          this rating to {n} items." line per rater who's used it. */}
      {ratingDeletePopup && (
        <div className="setup-overlay" onMouseDown={() => setRatingDeletePopup(null)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p><strong>Rating deletion</strong></p>
            <p style={{ whiteSpace: 'pre-line' }}>
              {ratingDeletePopup.usage
                .map((u) => `${u.name} assigned this rating to ${u.count} items.`)
                .join('\n')}
            </p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setRatingDeletePopup(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmRemoveRatingValue}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* FIX512.3.1 (2nd bullet): Title 'Rule deletion', message 'Confirm
          rule deletion', buttons Cancel/Delete. */}
      {ruleDeleteConfirm && (
        <div className="setup-overlay" onMouseDown={() => setRuleDeleteConfirm(false)}>
          <div className="sc-shrink-box" onMouseDown={(e) => e.stopPropagation()}>
            <p><strong>Rule deletion</strong></p>
            <p>Confirm rule deletion</p>
            <div className="sc-shrink-actions">
              <button type="button" onClick={() => setRuleDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmRemoveCaptionRules}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

