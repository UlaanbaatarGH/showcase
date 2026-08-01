import { useEffect, useState } from 'react';
import { planFromUrl } from './gsheetImport.js';
import { importGsheet } from '../data/backend.js';

// FIX370 / FIX370.0 <cmd-import-properties-gsheet>: Google Sheet import
// dialog. FIX370.3.2.1/.1.1/.2.2 (removed): no more URL-entry popup or
// last-URL Local Storage memory — FIX370.3.2.2.1 now reads the URL straight
// from <setup-properties-gsheet> (FIX508.2.5), so the dialog jumps directly
// to consistency checks → recap → apply → done.
export default function GsheetImportDialog({ project, onClose, onDone }) {
  const hasUrl = !!(project.properties_gsheet_url || '').trim();
  const [stage, setStage] = useState(hasUrl ? 'fetching' : 'errors');
  const [errors, setErrors] = useState([]);
  const [fatal, setFatal] = useState(hasUrl ? null : 'No Properties Google sheet is set up for this project (Setup > General).');
  const [recap, setRecap] = useState(null);
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);

  async function runImportCheck() {
    setStage('fetching');
    setErrors([]);
    setFatal(null);
    try {
      const res = await planFromUrl(project.properties_gsheet_url, project);
      if (res.errors && res.errors.length > 0) {
        setErrors(res.errors);
        setStage('errors');
      } else {
        setRecap(res.recap);
        setPlan(res.plan);
        setStage('recap');
      }
    } catch (ex) {
      setFatal(ex.message || String(ex));
      setStage('errors');
    }
  }

  // FIX370.3.2.2.1: starts the read + consistency checks the moment the
  // dialog opens, no separate confirmation step (FIX370.3.2.2 removed).
  useEffect(() => {
    if (hasUrl) runImportCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImport() {
    setStage('importing');
    setFatal(null);
    try {
      const r = await importGsheet(project.id, plan);
      setResult(r);
      // FIX370.3.2.2.3.5: refresh the current view before the Done popup
      // so the user sees the imported data behind it.
      onDone?.();
      setStage('done');
    } catch (ex) {
      setFatal(ex.message || String(ex));
      setStage('errors');
    }
  }

  function handleDone() {
    onClose?.();
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal gsheet-dialog"
      >
        {stage === 'fetching' && (
          <div className="gsheet-stage">
            <h2>Reading the sheet…</h2>
            <div className="gsheet-busy">Fetching and validating…</div>
          </div>
        )}

        {stage === 'importing' && (
          <div className="gsheet-stage">
            <h2>Importing…</h2>
            <div className="gsheet-busy">Applying changes on the server…</div>
          </div>
        )}

        {stage === 'errors' && (
          <div className="gsheet-stage">
            <h2>Import cannot proceed</h2>
            {fatal && <div className="gsheet-err-fatal">{fatal}</div>}
            {errors.length > 0 && (
              <ul className="gsheet-errors">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Close
              </button>
              {hasUrl && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={runImportCheck}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {stage === 'recap' && recap && (
          <div className="gsheet-stage">
            <h2>Import recap</h2>
            <RecapList title="New properties" items={recap.newProperties} />
            <RecapList
              title="Renamed properties"
              items={recap.renames.map((r) => `${r.from} → ${r.to}`)}
            />
            <RecapList title="New items" items={recap.newFolders} />
            <RecapList title="Updated items" items={recap.updatedFolders} />
            <RecapList title="Deleted items" items={recap.deletedFolders} />
            <RecapList
              title="Renamed items"
              items={recap.renamedFolders.map((r) => `${r.from} → ${r.to}`)}
            />
            {recap.newProperties.length === 0 &&
              recap.renames.length === 0 &&
              recap.newFolders.length === 0 &&
              recap.updatedFolders.length === 0 &&
              recap.deletedFolders.length === 0 &&
              recap.renamedFolders.length === 0 && (
                <div className="gsheet-empty">Nothing to import.</div>
              )}
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleImport}
                disabled={
                  recap.newProperties.length === 0 &&
                  recap.renames.length === 0 &&
                  recap.newFolders.length === 0 &&
                  recap.updatedFolders.length === 0 &&
                  recap.deletedFolders.length === 0 &&
                  recap.renamedFolders.length === 0
                }
              >
                Import
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="gsheet-stage">
            <h2>Import done</h2>
            <ul className="gsheet-result">
              <li>New properties: {result.new_properties_count ?? 0}</li>
              <li>Renames: {result.renames_count ?? 0}</li>
              <li>New items: {result.new_folders_count ?? 0}</li>
              <li>Updated items: {result.updated_folders_count ?? 0}</li>
              <li>Renamed items: {result.folder_renames_count ?? 0}</li>
            </ul>
            <div className="gsheet-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleDone}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecapList({ title, items }) {
  return (
    <div className="gsheet-recap-section">
      <div className="gsheet-recap-title">
        {title} <span className="gsheet-recap-count">({items.length})</span>
      </div>
      {items.length > 0 && (
        <ul className="gsheet-recap-items">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
