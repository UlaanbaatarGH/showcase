import { useState } from 'react';
import { planFromUrl } from './gsheetImport.js';
import { importGsheet } from '../data/backend.js';

const STORAGE_KEY = 'gsheet-import-last-url';

// FIX370: Google Sheet import dialog. Walks the user through URL →
// consistency checks → recap → apply → done.
export default function GsheetImportDialog({ project, onClose, onDone }) {
  const [stage, setStage] = useState('url');
  const [url, setUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [errors, setErrors] = useState([]);
  const [fatal, setFatal] = useState(null);
  const [recap, setRecap] = useState(null);
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);

  async function handleFetch(e) {
    e.preventDefault();
    setStage('fetching');
    setErrors([]);
    setFatal(null);
    try {
      const res = await planFromUrl(url, project);
      localStorage.setItem(STORAGE_KEY, url);
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal gsheet-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {stage === 'url' && (
          <form className="gsheet-stage" onSubmit={handleFetch}>
            <h2>Import from Google Sheet</h2>
            <p className="gsheet-hint">
              The sheet must be shared as <b>Anyone with the link can view</b>.
              If you want to import a specific tab, open it first and copy the
              URL from the address bar.
            </p>
            <label>
              Google Sheet URL
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                required
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
            </label>
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={!url.trim()}>
                Next
              </button>
            </div>
          </form>
        )}

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
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStage('url')}
              >
                Back
              </button>
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
            {recap.newProperties.length === 0 &&
              recap.renames.length === 0 &&
              recap.newFolders.length === 0 &&
              recap.updatedFolders.length === 0 && (
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
                  recap.updatedFolders.length === 0
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
          {items.slice(0, 20).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
          {items.length > 20 && <li className="gsheet-recap-more">…and {items.length - 20} more</li>}
        </ul>
      )}
    </div>
  );
}
