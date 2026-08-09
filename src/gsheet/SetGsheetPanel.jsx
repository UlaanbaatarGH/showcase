import { useState } from 'react';
import { parseGsheetUrl } from './gsheetImport.js';
import CreateGsheetPanel from './CreateGsheetPanel.jsx';

// FIX377 <panel-set-gsheet>: opened by <cmd-set-properties-gsheet>
// (FIX376.1, updated from the old plain Title/Message popup). Lets the
// user paste an existing gsheet url directly, or launch the guided
// creation wizard (FIX378 <panel-create-gsheet>) via 'Create new sheet'.
// A successful Finish there (FIX378.3.4.11) already saves the url and
// closes both panels — onFinished just bubbles the url to the same
// onDone this panel's own Done button uses, so the caller only needs
// one save path.
export default function SetGsheetPanel({ initialUrl, projectName, onCancel, onDone }) {
  const [url, setUrl] = useState(initialUrl || '');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="modal-backdrop" onMouseDown={onCancel}>
        <div
          className="modal gsheet-dialog"
          data-yagu-id="panel-set-gsheet"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="gsheet-stage">
            <h2>Set the project's Google sheet</h2>
            <label className="setup-inline-row">
              <span>Gsheet url</span>
              <input
                type="text"
                data-yagu-id="input-set-gsheet-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                autoFocus
              />
            </label>
            <div className="gsheet-actions gsheet-actions-split">
              {/* FIX377.3.1 */}
              <button type="button" data-yagu-id="cmd-create-gsheet" onClick={() => setCreateOpen(true)}>
                Create new sheet
              </button>
              <div className="gsheet-actions-right">
                <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
                {/* FIX377.3.2: enabled only once a syntactically valid url is entered. */}
                <button
                  type="button"
                  className="btn-primary"
                  data-yagu-id="cmd-set-gsheet-done"
                  onClick={() => onDone(url.trim())}
                  disabled={!parseGsheetUrl(url.trim())}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {createOpen && (
        <CreateGsheetPanel
          projectName={projectName}
          onCancel={() => setCreateOpen(false)}
          onFinished={(finishedUrl) => { setCreateOpen(false); onDone(finishedUrl); }}
        />
      )}
    </>
  );
}
