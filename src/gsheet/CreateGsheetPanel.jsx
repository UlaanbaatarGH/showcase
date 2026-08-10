import { useState } from 'react';
import { parseGsheetUrl, planFromUrl } from './gsheetImport.js';
import GsheetFormatErrorPopup from './GsheetFormatErrorPopup.jsx';

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
export default function CreateGsheetPanel({ project, onCancel, onFinished }) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [urlError, setUrlError] = useState(null);
  // FIX378.3.4.2.1: format-check errors, shown via <popup-gsheet-format-err>
  // (FIX379). FIX378.3.4.2.2: On Ok, the wizard just stays on step 4 --
  // clearing this is the only thing the popup's Ok button does.
  const [formatErrors, setFormatErrors] = useState([]);

  const expectedTitle = `Showcase ${project?.name || ''}`.trim();

  // FIX378.3.1.
  const handleCreate = () => {
    window.open('https://docs.google.com/spreadsheets/create', '_blank', 'noopener');
    setStep(2);
  };

  // FIX378.3.4(deep old) family retired -- the bespoke shared/A1/title
  // checks are replaced by the same <gsheet-format-checks> (FIX370.2 /
  // FIX370.2.0) pipeline the import dialog (FIX370.4.1) and Open gsheet
  // (FIX375.1.1) already run, via planFromUrl().
  const handleFinish = async () => {
    const parsed = parseGsheetUrl(url.trim());
    if (!parsed) {
      setUrlError('Enter a valid Google sheet url');
      return;
    }
    setChecking(true);
    setUrlError(null);
    setFormatErrors([]);
    // FIX378.3.4.1: <gsheet-format-checks> also checks the gsheet title
    // against `expectedTitle`, which is why `project` must carry the right
    // `name` -- same check as FIX370.2.1.8 / FIX378.3.4(deep old).2.
    let res;
    try {
      res = await planFromUrl(url.trim(), project);
    } catch (e) {
      // planFromUrl throws when the sheet can't be fetched at all (not
      // shared, wrong url) -- the same "not readable" condition
      // FIX378.3.4(deep old).1 used to check for. Folds into the same
      // FIX379 popup since there's no separate stage for it here.
      setChecking(false);
      setFormatErrors([e.message || String(e)]);
      return;
    }
    setChecking(false);
    if (res.errors && res.errors.length > 0) {
      // FIX378.3.4.2: keep the panel open -- the caller isn't told.
      setFormatErrors(res.errors);
      return;
    }
    // FIX378.3.4.3: caller sets <setup-properties-gsheet> and closes both
    // panels.
    onFinished(url.trim());
  };

  return (
    <>
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
                onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                autoFocus
              />
              {urlError && <div className="gsheet-err-fatal">{urlError}</div>}
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
      {formatErrors.length > 0 && (
        <GsheetFormatErrorPopup
          errors={formatErrors}
          onOk={() => setFormatErrors([])}
        />
      )}
    </>
  );
}
