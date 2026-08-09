import { computePropertyValue } from './properties/formulas.js';

// FIX518 <panel-item-details>: an item's property list. FIX518.2.1
// view-mode is read-only; FIX518.2.2 edition-mode (CatalogueView.jsx
// only — MyRatingsView.jsx has no edit affordance, FIX702 defines
// none) swaps values to inputs (except derived properties, FIX518.4.6)
// and adds a Cancel/Save footer. Extracted out of CatalogueView.jsx's
// Details tab (FIX515.2.1.2) so FIX702.2.3's "Existing <panel-item-
// details>" can genuinely reuse it rather than duplicate ~170 lines.
//
// Edit-mode props (editionMode/detailDraft/onDraftChange/onSave/
// onCancelEdit) are all optional — a caller that omits them (MyRatings)
// gets pure view-mode rendering, no wiring needed on its side.
export default function ItemDetailsPanel({
  folder,
  folders,
  properties,
  propertiesByLabel,
  deletedPropertyId,
  folderColumnName,
  editionMode = false,
  detailDraft = {},
  onDraftChange,
  onSave,
  onCancelEdit,
}) {
  if (!folder) {
    return <div className="sc-viewer-empty" data-yagu-id="panel-item-details">No item selected.</div>;
  }
  // FIX518.4.4: hide the property used as the deleted-marker.
  // FIX518.4.2: order follows the sort order set in
  // <tab-properties-setup>.
  const ordered = [...(properties ?? [])]
    .filter((p) => p.id !== deletedPropertyId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // FIX518.4.5: a property is rendered as a checkbox when every
  // non-blank value across all items is 'x' (case-insensitive,
  // trimmed). Only applies to stored properties — derived ones
  // (FIX506.5.3.2) always render as their computed value. Needs the
  // *whole* project's folders, not just the selected one.
  const isBooleanProperty = (p) => {
    if (p.formula) return false;
    const key = String(p.id);
    let sawAny = false;
    for (const f of folders ?? []) {
      const v = (f.properties || {})[key];
      if (v == null) continue;
      const s = String(v).trim();
      if (s === '') continue;
      sawAny = true;
      if (s.toLowerCase() !== 'x') return false;
    }
    return sawAny;
  };
  const storedValue = (p) => {
    const key = String(p.id);
    if (Object.prototype.hasOwnProperty.call(detailDraft, key)) {
      return detailDraft[key];
    }
    const raw = (folder.properties || {})[key];
    return raw == null ? '' : String(raw);
  };
  const renderValue = (p) => {
    // FIX518.4.6: derived properties are always auto-recalculated and
    // never editable.
    if (editionMode && !p.formula) {
      if (isBooleanProperty(p)) {
        const checked = String(storedValue(p)).trim().toLowerCase() === 'x';
        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onDraftChange?.(p, e.target.checked ? 'x' : '')}
          />
        );
      }
      const draft = storedValue(p);
      // FIX518.4.8: a multi-line value stays multi-line when edited
      // too, otherwise the single-line input would silently lose its
      // newlines on save.
      if (typeof draft === 'string' && draft.includes('\n')) {
        const rows = Math.min(8, draft.split('\n').length + 1);
        return (
          <textarea
            value={draft}
            rows={rows}
            onChange={(e) => onDraftChange?.(p, e.target.value)}
          />
        );
      }
      return (
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange?.(p, e.target.value)}
        />
      );
    }
    const raw = computePropertyValue(folder, p, propertiesByLabel);
    if (isBooleanProperty(p)) {
      const checked = String(raw).trim().toLowerCase() === 'x';
      return <input type="checkbox" checked={checked} readOnly tabIndex={-1} />;
    }
    // FIX518.4.8: preserve newlines on display so values imported as
    // multi-line text render across multiple lines (CSS white-space:
    // pre-line on the wrapper).
    if (typeof raw === 'string' && raw.includes('\n')) {
      return <span className="sc-details-multiline">{raw}</span>;
    }
    return raw;
  };
  // FIX518.4.3 / <item-id-new-name>: the '#' row uses the custom label
  // from view_setup.showcase.folder_column_name if set.
  const idLabel = folderColumnName;
  return (
    // FIX518.0 / FIX702.2.3.0 <panel-item-details>: wasn't previously
    // tagged anywhere in code (CatalogueView's inline version didn't
    // carry this id either) — added here so both callers get it.
    <div className={`sc-details${editionMode ? ' editing' : ''}`} data-yagu-id="panel-item-details">
      <table className="sc-details-list">
        <tbody>
          <tr>
            <th>{idLabel}</th>
            <td>{folder.name ?? ''}</td>
          </tr>
          {ordered.map((p) => (
            <tr key={`prop_${p.id}`}>
              <th>{p.label}</th>
              <td>{renderValue(p)}</td>
            </tr>
          ))}
          {/* FIX518.4.1: derived properties listed after the regular
              ones. <derived-property-img> doesn't relate to a specific
              property, so it goes at the end. */}
          <tr>
            <th>Img</th>
            <td>
              <input type="checkbox" checked={!!folder.has_image} readOnly tabIndex={-1} />
            </td>
          </tr>
        </tbody>
      </table>
      {editionMode && (
        <footer className="sc-viewer-edit-footer">
          <button type="button" onClick={onCancelEdit}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={onSave}
            title="Saved locally only — backend write endpoint pending"
          >
            Save
          </button>
        </footer>
      )}
    </div>
  );
}
