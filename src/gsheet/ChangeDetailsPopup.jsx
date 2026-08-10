// FIX370.4.2.11.1: opened by the import preview's 'Show details' button
// (FIX370.4.2.11). Lists every change-type with a non-0 count, each with
// its comma-separated refs/property names (recap.changeDetails).
const CHANGE_TYPES = [
  ['New item', 'newItem'],
  ['Updated item', 'updatedItem'],
  ['Deleted item', 'deletedItem'],
  ['Updated item Ref', 'updatedItemRef'],
  ['New property', 'newProperty'],
  ['Updated property name', 'updatedPropertyName'],
];

export default function ChangeDetailsPopup({ changeCounts, changeDetails, onOk }) {
  return (
    <div className="modal-backdrop">
      <div className="modal gsheet-dialog" data-yagu-id="popup-change-details">
        <div className="gsheet-stage">
          <h2>Change details</h2>
          <div className="gsheet-preview-lines">
            {CHANGE_TYPES.filter(([, key]) => changeCounts[key] > 0).map(([label, key]) => (
              <p key={key}>- {label} : {changeDetails[key].join(', ')}</p>
            ))}
          </div>
          <div className="gsheet-actions">
            <button type="button" className="btn-primary" onClick={onOk}>
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
