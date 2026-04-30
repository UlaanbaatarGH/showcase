import { useState, useRef } from 'react';
import {
  getExistingImages,
  signUpload,
  confirmImage,
  deleteOrphanImage,
} from '../data/backend.js';
import { scanFiles, buildImportPlan } from './importImages.js';

// FIX371: image import dialog. Stages: 'pick' → 'scanning' → 'recap' →
// 'uploading' → 'done' | 'errors'.
export default function ImportImagesDialog({ project, onClose, onDone }) {
  const [stage, setStage] = useState('pick');
  const [plan, setPlan] = useState(null);          // array of item records
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fatal, setFatal] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFolderPicked(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setStage('scanning');
    setFatal(null);
    try {
      const scanned = await scanFiles(files);
      const existing = await getExistingImages(project.id);
      const planItems = buildImportPlan(scanned, existing.items || {});
      setPlan(planItems);
      setStage('recap');
    } catch (ex) {
      setFatal(ex.message || String(ex));
      setStage('errors');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleImport() {
    if (!plan) return;
    const toUpload = [];
    for (const it of plan) {
      for (const f of it.newFiles) toUpload.push({ itemName: it.name, ...f });
      for (const f of it.updateFiles) toUpload.push({ itemName: it.name, ...f });
    }
    setProgress({ done: 0, total: toUpload.length });
    setStage('uploading');
    setFatal(null);
    let done = 0;
    let sort_order = 0;
    let stopReason = null;
    for (const u of toUpload) {
      // Track per-file progress so we know whether we need to clean up
      // an orphan in the bucket (PUT succeeded but confirm didn't).
      let storageKey = null;
      let bucketUploaded = false;
      try {
        const sign = await signUpload({
          project_id: project.id,
          item_name: u.itemName,
          filename: u.filename,
        });
        storageKey = sign.storage_key;
        const putRes = await fetch(sign.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': u.file.type || 'application/octet-stream' },
          body: u.file,
        });
        if (!putRes.ok) {
          throw new Error(`Supabase upload ${putRes.status}: ${await putRes.text().catch(() => '')}`.slice(0, 200));
        }
        bucketUploaded = true;
        await confirmImage({
          project_id: project.id,
          item_name: u.itemName,
          storage_key: storageKey,
          sort_order: sort_order++,
          replaces_image_id: u.replaces_image_id ?? null,
        });
        done += 1;
        setProgress({ done, total: toUpload.length });
      } catch (ex) {
        // FIX371: stop on the first failure and clean up the bucket
        // orphan if PUT succeeded but confirm didn't, so that resuming
        // the import in a new session starts from a clean state (no
        // dangling files, no half-registered items).
        if (bucketUploaded && storageKey) {
          try {
            await deleteOrphanImage({
              project_id: project.id,
              storage_key: storageKey,
            });
          } catch (cleanupErr) {
            // Cleanup failed — the orphan stays in the bucket. Surface
            // it so the user knows manual cleanup may be needed.
            console.warn('Orphan cleanup failed:', cleanupErr);
            stopReason = `${u.itemName}/${u.filename}: ${ex.message || ex} ` +
              `(orphan cleanup also failed: ${cleanupErr.message || cleanupErr})`;
            break;
          }
        }
        stopReason = `${u.itemName}/${u.filename}: ${ex.message || ex}`;
        break;
      }
    }
    setResult({
      uploaded: done,
      total: toUpload.length,
      stopReason,
    });
    // FIX371.6.3: refresh current view so new images show up.
    onDone?.();
    setStage('done');
  }

  const totalNew = plan?.reduce((s, it) => s + it.newCount, 0) ?? 0;
  const totalUpd = plan?.reduce((s, it) => s + it.updateCount, 0) ?? 0;
  const totalIgn = plan?.reduce((s, it) => s + it.ignoreCount, 0) ?? 0;
  const nothingToDo = totalNew === 0 && totalUpd === 0;

  return (
    <div className="modal-backdrop">
      <div className="modal gsheet-dialog">
        {stage === 'pick' && (
          <div className="gsheet-stage">
            <h2>Import images from disk</h2>
            <p className="gsheet-hint">
              Pick one folder. It can be either an Item Folder
              containing images directly (its name is the item's <b>#</b>),
              or a common parent folder whose immediate children are Item
              Folders. Accepted file types: jpg, jpeg, png, webp.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              // eslint-disable-next-line react/no-unknown-property
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderPicked}
              style={{ display: 'none' }}
            />
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Pick folder…
              </button>
            </div>
          </div>
        )}

        {stage === 'scanning' && (
          <div className="gsheet-stage">
            <h2>Scanning…</h2>
            <div className="gsheet-busy">Reading files and comparing with the project…</div>
          </div>
        )}

        {stage === 'recap' && plan && (
          <div className="gsheet-stage">
            <h2>Image import recap</h2>
            <div className="gsheet-hint">
              New: {totalNew} &nbsp;·&nbsp; Updated: {totalUpd} &nbsp;·&nbsp; Ignored: {totalIgn}
            </div>
            {plan.length === 0 ? (
              <div className="gsheet-empty">No image files found in the picked folder.</div>
            ) : (
              <table className="gsheet-recap-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>New</th>
                    <th>Updated</th>
                    <th>Ignored</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((it) => (
                    <tr key={it.name}>
                      <td>{it.name}</td>
                      <td>{it.newCount}</td>
                      <td>{it.updateCount}</td>
                      <td>{it.ignoreCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="gsheet-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleImport}
                disabled={nothingToDo}
              >
                Import
              </button>
            </div>
          </div>
        )}

        {stage === 'uploading' && (
          <div className="gsheet-stage">
            <h2>Uploading images…</h2>
            <div className="gsheet-busy">
              {progress.done} / {progress.total}
            </div>
            <div className="gsheet-progress">
              <div
                className="gsheet-progress-fill"
                style={{
                  width:
                    progress.total === 0
                      ? '0%'
                      : `${Math.round((100 * progress.done) / progress.total)}%`,
                }}
              />
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="gsheet-stage">
            <h2>{result.stopReason ? 'Import stopped' : 'Import done'}</h2>
            <ul className="gsheet-result">
              <li>Uploaded: {result.uploaded} / {result.total}</li>
              {result.stopReason && <li>Stopped on first error.</li>}
            </ul>
            {result.stopReason && (
              <ul className="gsheet-errors">
                <li>{result.stopReason}</li>
              </ul>
            )}
            <div className="gsheet-actions">
              <button type="button" className="btn-primary" onClick={onClose}>
                OK
              </button>
            </div>
          </div>
        )}

        {stage === 'errors' && (
          <div className="gsheet-stage">
            <h2>Import cannot proceed</h2>
            {fatal && <div className="gsheet-err-fatal">{fatal}</div>}
            <div className="gsheet-actions">
              <button type="button" className="btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
