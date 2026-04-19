import { useState, useRef } from 'react';
import {
  getExistingImages,
  signUpload,
  confirmImage,
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
      const scanned = scanFiles(files);
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
    const errors = [];
    let done = 0;
    let sort_order = 0;
    for (const u of toUpload) {
      try {
        const sign = await signUpload({
          project_id: project.id,
          item_name: u.itemName,
          filename: u.filename,
        });
        const putRes = await fetch(sign.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': u.file.type || 'application/octet-stream' },
          body: u.file,
        });
        if (!putRes.ok) {
          throw new Error(`Supabase upload ${putRes.status}: ${await putRes.text().catch(() => '')}`.slice(0, 200));
        }
        await confirmImage({
          project_id: project.id,
          item_name: u.itemName,
          storage_key: sign.storage_key,
          sort_order: sort_order++,
          replaces_image_id: u.replaces_image_id ?? null,
        });
      } catch (ex) {
        errors.push(`${u.itemName}/${u.filename}: ${ex.message || ex}`);
      }
      done += 1;
      setProgress({ done, total: toUpload.length });
    }
    setResult({
      uploaded: toUpload.length - errors.length,
      total: toUpload.length,
      errors,
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal gsheet-dialog" onClick={(e) => e.stopPropagation()}>
        {stage === 'pick' && (
          <div className="gsheet-stage">
            <h2>Import images from disk</h2>
            <p className="gsheet-hint">
              Pick a folder that contains one or more item folders (each
              subfolder name is the item's <b>#</b>). Accepted file types:
              jpg, jpeg, png, webp.
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
            <h2>Import done</h2>
            <ul className="gsheet-result">
              <li>Uploaded: {result.uploaded} / {result.total}</li>
              {result.errors.length > 0 && <li>Errors: {result.errors.length}</li>}
            </ul>
            {result.errors.length > 0 && (
              <ul className="gsheet-errors">
                {result.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
                {result.errors.length > 50 && (
                  <li>…and {result.errors.length - 50} more</li>
                )}
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
