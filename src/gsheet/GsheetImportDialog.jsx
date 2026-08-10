import { useEffect, useState } from 'react';
import { planFromUrl } from './gsheetImport.js';
import { importGsheet, getShowcase } from '../data/backend.js';
import GsheetFormatErrorPopup from './GsheetFormatErrorPopup.jsx';
import ChangeDetailsPopup from './ChangeDetailsPopup.jsx';

// FIX370 / FIX370.0 <cmd-import-properties-gsheet>: Google Sheet import
// dialog. FIX370.3.2.1 (removed), FIX370.3.2.1.1 (removed), and FIX370.4
// (removed): no more URL-entry popup or last-URL Local Storage memory —
// FIX370.4.1 now reads the URL straight from <setup-properties-gsheet>
// (FIX508.2.5), so the dialog jumps directly to format checks → recap →
// apply → done.
export default function GsheetImportDialog({ project, slug, onClose, onDone }) {
  const hasUrl = !!(project.properties_gsheet_url || '').trim();
  const [stage, setStage] = useState(hasUrl ? 'fetching' : 'errors');
  const [errors, setErrors] = useState([]);
  const [fatal, setFatal] = useState(hasUrl ? null : 'No Properties Google sheet is set up for this project (Setup > General).');
  const [recap, setRecap] = useState(null);
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);
  // FIX370.4.3.10.1: deletion is logical (a property flag), so there's no
  // backend delete count to compare against -- instead, re-read each
  // predicted-deleted item's actual state after the import and count how
  // many really ended up tagged. null = not checked yet (own fetch, not
  // reliant on onDone's reload / this dialog's own project prop refreshing).
  const [deletedCheckCount, setDeletedCheckCount] = useState(null);
  // FIX370.4.2.11: 'Show details' popup, open/closed.
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        // FIX370.2.1.6.1 (updated): no longer a hard error — with no setup
        // sheet, an unmatched column header is dropped but must first be
        // confirmed by the user before the normal recap shows.
        setStage(res.recap.droppedColumns?.length > 0 ? 'confirm-dropped' : 'recap');
      }
    } catch (ex) {
      setFatal(ex.message || String(ex));
      setStage('errors');
    }
  }

  // FIX370.4.1: starts the read + checks the moment the dialog opens, no
  // separate confirmation step (FIX370.4 removed). FIX370.4.1.3: format
  // errors (errors state below) surface via <popup-gsheet-format-err>
  // (FIX379); fatal state is an unspecified fetch/setup failure, shown
  // inline instead since FIX379 only covers the format-checks list.
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
      // FIX370.4.3.5: refresh the current view before the Done popup
      // so the user sees the imported data behind it.
      onDone?.();
      setStage('done');
    } catch (ex) {
      setFatal(ex.message || String(ex));
      setStage('errors');
    }
  }

  // FIX370.4.3.10.1: runs once the done stage is reached, independent of
  // onDone's own reload timing/prop refresh.
  useEffect(() => {
    if (stage !== 'done' || !slug || !recap) return;
    let cancelled = false;
    getShowcase(slug).then((d) => {
      if (cancelled) return;
      const folders = d?.folders || [];
      const count = recap.deletedFolderNames.filter((name) => {
        const f = folders.find((x) => x.name === name);
        return !!(f?.properties?.[String(project.deleted_property_id)] ?? '').toString().trim();
      }).length;
      setDeletedCheckCount(count);
    }).catch(() => { /* best-effort — the other counts still get checked */ });
    return () => { cancelled = true; };
  }, [stage, slug, recap, project.deleted_property_id]);

  function handleDone() {
    onClose?.();
  }

  // FIX370.4.1.3: format-check errors stop the import and surface via the
  // dedicated FIX379 popup, rendered on its own rather than nested inside
  // this dialog's own modal-backdrop/modal wrapper below.
  if (stage === 'errors' && errors.length > 0) {
    return <GsheetFormatErrorPopup errors={errors} onOk={onClose} />;
  }

  // FIX370.4.3.10.1: compare the preview's counts against what the backend
  // actually reports it did. 'Deleted item' has no backend count to compare
  // against (deletion is logical, folded into updated_folders_count like
  // every other property-value change) -- deletedCheckCount re-reads each
  // predicted-deleted item instead, added once that resolves (see effect
  // above).
  const countMismatches = recap && result ? [
    ['New item', recap.changeCounts.newItem, result.new_folders_count ?? 0],
    ['Updated item', recap.changeCounts.updatedItem, result.updated_folders_count ?? 0],
    ['Updated item Ref', recap.changeCounts.updatedItemRef, result.folder_renames_count ?? 0],
    ['New property', recap.changeCounts.newProperty, result.new_properties_count ?? 0],
    ['Updated property name', recap.changeCounts.updatedPropertyName, result.renames_count ?? 0],
    ...(deletedCheckCount != null ? [['Deleted item', recap.changeCounts.deletedItem, deletedCheckCount]] : []),
  ].filter(([, expected, actual]) => expected !== actual) : [];

  return (
    <>
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

          {/* FIX370.2.1.6.1 (updated): only reached when no setup sheet was
              provided and at least one main-sheet header doesn't match an
              existing property. Cancel aborts the whole import (same as the
              recap stage's own Cancel); Import proceeds to the normal recap
              with those columns already excluded (gsheetImport.js dropped
              them from importedPropHeaders). */}
          {stage === 'confirm-dropped' && recap && (
            <div className="gsheet-stage">
              <h2>Confirm dropped columns</h2>
              <p>The gsheet columns below are not defined as properties. They won't be uploaded.</p>
              <RecapList title="Dropped columns" items={recap.droppedColumns} />
              <p>Create a 2nd sheet 'setup' to exclude these columns and skip this confirmation step.</p>
              <div className="gsheet-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={() => setStage('recap')}>
                  Import
                </button>
              </div>
            </div>
          )}

          {/* FIX370.4.2.2(deep-old) family retired: 2-column layout, left
              (FIX370.4.2.2.2) listing every gsheet property column with a
              read/not-read flag -- this is what surfaces a column silently
              dropped by the setup-sheet allowlist (FIX370.2.2.1), instead of
              it just failing silently -- right (FIX370.4.2.2.1) the
              change-type counts. */}
          {stage === 'recap' && recap && (
            <div className="gsheet-stage" data-yagu-id="popup-import-preview">
              <h2>Import preview</h2>
              <div className="gsheet-preview-columns">
                <div className="gsheet-preview-col">
                  {/* FIX370.4.2.2.2.1: spec's literal title text (typo and all). */}
                  <div className="gsheet-preview-col-title">Ghseet columns:</div>
                  <ul className="gsheet-columns-list">
                    {recap.gsheetColumns.map((c, i) => (
                      <li key={i}>
                        <span className={c.read ? 'gsheet-col-read' : 'gsheet-col-unread'}>
                          {c.read ? '✓' : '✗'}
                        </span>{' '}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="gsheet-preview-col">
                  <div className="gsheet-preview-col-title">Changes</div>
                  <div className="gsheet-preview-lines">
                    <p>- New item : {recap.changeCounts.newItem}</p>
                    <p>- Updated item : {recap.changeCounts.updatedItem}</p>
                    <p>- Deleted item : {recap.changeCounts.deletedItem}</p>
                    <p className="gsheet-preview-gap">- Updated item Ref : {recap.changeCounts.updatedItemRef}</p>
                    <p>- New property : {recap.changeCounts.newProperty}</p>
                    <p>- Updated property name : {recap.changeCounts.updatedPropertyName}</p>
                  </div>
                </div>
              </div>
              <div className="gsheet-actions gsheet-actions-split">
                {/* FIX370.4.2.11: far left, alongside Cancel/Import. */}
                <button type="button" onClick={() => setDetailsOpen(true)}>
                  Show details
                </button>
                <div className="gsheet-actions-right">
                  <button type="button" className="btn-cancel" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleImport}
                    disabled={Object.values(recap.changeCounts).every((n) => n === 0)}
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FIX370.4.3.10: no details -- the import preview (FIX370.4.2)
              already gave them. FIX370.4.3.10.1: unless the effective
              import's counts don't match what the preview promised, in
              which case that mismatch is the one thing worth raising here. */}
          {stage === 'done' && result && (
            <div className="gsheet-stage">
              <h2>Import done</h2>
              {countMismatches.length > 0 && (
                <div className="gsheet-err-fatal">
                  <p>Effective import counts don't match the preview:</p>
                  <ul>
                    {countMismatches.map(([label, expected, actual]) => (
                      <li key={label}>{label}: preview {expected}, import {actual}</li>
                    ))}
                  </ul>
                </div>
              )}
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
      {detailsOpen && recap && (
        <ChangeDetailsPopup
          changeCounts={recap.changeCounts}
          changeDetails={recap.changeDetails}
          onOk={() => setDetailsOpen(false)}
        />
      )}
    </>
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
