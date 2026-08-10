// FIX379 <popup-gsheet-format-err>: shown when <gsheet-format-checks>
// (FIX370.2 / FIX370.2.0) finds errors. Used by the import dialog
// (FIX370.4.1.3) -- <panel-set-gsheet>'s own check (FIX377.3.2.1) is not
// wired up yet.
export default function GsheetFormatErrorPopup({ errors, onOk }) {
  return (
    <div className="modal-backdrop">
      <div className="modal gsheet-dialog" data-yagu-id="popup-gsheet-format-err">
        <div className="gsheet-stage">
          <h2>Google sheet format errors</h2>
          <p>Format errors to be fixed before importing:</p>
          <ul className="gsheet-errors">
            {errors.map((e, i) => (
              <li key={i}><strong>Error: </strong>{e}</li>
            ))}
          </ul>
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
