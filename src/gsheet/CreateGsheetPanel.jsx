import { useState } from 'react';
import { parseGsheetUrl, parseCsv, fetchMainCsv } from './gsheetImport.js';
import { fetchGsheetTitle } from '../data/backend.js';

// FIX378 <panel-create-gsheet>: 4-step wizard that walks the user through
// creating, naming, structuring and sharing a fresh Google sheet, then
// verifies all of it (FIX378.3.4) before handing the url back up.
//
// FIX378.3.1 ('Clicking <btn-create> creates a new Google sheet') can only
// open Google's blank-sheet page in the user's own browser tab/session --
// there's no way for this app to provision or own a sheet on the user's
// behalf (no assumption can be made about their Google account type: no
// Workspace service account can reliably own a Drive file for an arbitrary
// personal account). window.open also can't hand the resulting sheet's url
// back to us (cross-origin navigation), and the spec's 4-step layout has no
// url field of its own -- so Step 4 gets one added here: the user pastes
// the finished sheet's url right before Finish, which is what FIX378.3.4's
// checks run against.
export default function CreateGsheetPanel({ projectName, onCancel, onFinished }) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [failures, setFailures] = useState([]);

  const expectedTitle = `Showcase ${projectName || ''}`.trim();

  // FIX378.3.1.
  const handleCreate = () => {
    window.open('https://docs.google.com/spreadsheets/create', '_blank', 'noopener');
    setStep(2);
  };

  // FIX378.3.4: Is the url shared? / Has the gsheet the expected name? /
  // Has A1 the value '#'? FIX378.3.4.10: every failing point is raised
  // together, not just the first one hit.
  const handleFinish = async () => {
    const parsed = parseGsheetUrl(url.trim());
    if (!parsed) {
      setFailures(['Enter a valid Google sheet url']);
      return;
    }
    setChecking(true);
    setFailures([]);
    const found = [];
    // FIX378.3.4.1 + FIX378.3.4.3: one fetch covers both -- a failed fetch
    // means "not shared / not readable", a successful one lets us look at
    // A1 directly, same fetchMainCsv() FIX370's import already relies on.
    let csvText = null;
    try {
      csvText = await fetchMainCsv(parsed.sheetId, parsed.gid);
    } catch (e) {
      found.push(e.message || 'The sheet could not be read.');
    }
    if (csvText != null) {
      const rows = parseCsv(csvText);
      const a1 = (rows[0]?.[0] ?? '').trim();
      if (a1 !== '#') {
        found.push(`Cell A1 must contain '#' (found ${a1 ? `"${a1}"` : 'nothing'}).`);
      }
    }
    // FIX378.3.4.2: document title, fetched server-side (see backend
    // /api/gsheet-title -- the /edit page isn't CORS-fetchable client-side).
    let title = null;
    try {
      const res = await fetchGsheetTitle(url.trim());
      title = res?.title || null;
    } catch {
      // best-effort — folds into the name-mismatch failure below
    }
    if (!title || title.trim().toLowerCase() !== expectedTitle.toLowerCase()) {
      found.push(`The sheet should be named "${expectedTitle}" (found ${title ? `"${title}"` : 'nothing readable'}).`);
    }
    setChecking(false);
    if (found.length > 0) {
      setFailures(found);
      return;
    }
    // FIX378.3.4.11.1 + .11.2: the caller sets <setup-properties-gsheet>
    // and closes both panels.
    onFinished(url.trim());
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal gsheet-dialog"
        data-yagu-id="panel-create-gsheet"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {step === 1 && (
          <div className="gsheet-stage">
            <h2>Create the project's Google sheet</h2>
            <p>Step 1: Google sheet creation.</p>
            <p>Click 'Create' to start the process.</p>
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn-primary" data-yagu-id="btn-create" onClick={handleCreate}>
                Create
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="gsheet-stage">
            <h2>Create the project's Google sheet</h2>
            <p>A Google sheet was added as a new tab in your browser.</p>
            <p>Step 2: Name the Google sheet.</p>
            <p>At the top left, enter the name '{expectedTitle}', and click Next.</p>
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn-primary" data-yagu-id="btn-next" onClick={() => setStep(3)}>
                Next
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="gsheet-stage">
            <h2>Create the project's Google sheet</h2>
            <p>Step 3: Add '#' in A1 as the column to enter the reference (Ref) of each item.</p>
            <p>This is a mandatory column.</p>
            <p>Then the label of each item property can be added later as the next columns.</p>
            <p>Click Next.</p>
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
              <button type="button" data-yagu-id="btn-prev" onClick={() => setStep(2)}>Previous</button>
              <button type="button" className="btn-primary" data-yagu-id="btn-next" onClick={() => setStep(4)}>
                Next
              </button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="gsheet-stage">
            <h2>Create the project's Google sheet</h2>
            <p>Step 4: Share the Google sheet.</p>
            <p>This will enable Showcase to read it.</p>
            <p>1- Click the 'Share' button at the top right</p>
            <p>2- In 'General access', select 'Anyone with the link' and keep 'Viewer'</p>
            <p>3- Click 'Done'</p>
            <p>4- Paste the sheet's url below, then click 'Finish'.</p>
            <input
              type="text"
              data-yagu-id="input-create-gsheet-url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setFailures([]); }}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              autoFocus
            />
            {failures.length > 0 && (
              <ul className="gsheet-errors">
                {failures.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onCancel} disabled={checking}>
                Cancel
              </button>
              <button type="button" data-yagu-id="btn-prev" onClick={() => setStep(3)} disabled={checking}>
                Previous
              </button>
              <button
                type="button"
                className="btn-primary"
                data-yagu-id="btn-finish"
                onClick={handleFinish}
                disabled={checking || !parseGsheetUrl(url.trim())}
              >
                {checking ? '…' : 'Finish'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
