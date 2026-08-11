import { computePropertyValue } from './properties/formulas.js';

// FIX518 <panel-item-details>: an item's property list, always read-only.
// FIX515.3.2.2: Properties can only be changed via <cmd-import-properties-
// gsheet> -- clicking <cmd-edit-item-page> on the Details tab no longer
// switches this panel into an edition mode (the old FIX515.3.2.2 did; the
// inline Cancel/Save editor it drove never had a real backend write behind
// it anyway). Extracted out of CatalogueView.jsx's Details tab (FIX515.2.1.2)
// so FIX702.2.3's "Existing <panel-item-details>" can genuinely reuse it
// rather than duplicate ~170 lines.
export default function ItemDetailsPanel({
  folder,
  folders,
  properties,
  propertiesByLabel,
  deletedPropertyId,
  folderColumnName,
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
  const renderValue = (p) => {
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
    <div className="sc-details" data-yagu-id="panel-item-details">
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
    </div>
  );
}
