import { useEffect, useState } from 'react';
import { listVisits } from './data/backend.js';

// FIX410.1.1.1.1: consultation log of <panel-app-home> and
// <panel-project-home>, most recent first. Anonymous rows have a null
// login_name and surface their IP only.
//   GET /api/admin/visits → [{ login_name, ip, page, ts }, ...]
export default function VisitsPanel({ onClose }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listVisits()
      .then(setVisits)
      .catch((e) => setError(e.message || String(e)));
  }, []);

  const fmt = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal visits-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Visits</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {error && <div className="visits-err">{error}</div>}
        {!error && visits === null && <div className="visits-loading">Loading…</div>}
        {!error && visits && visits.length === 0 && (
          <div className="visits-empty">No visit recorded yet.</div>
        )}
        {!error && visits && visits.length > 0 && (
          <table className="visits-table">
            <thead>
              <tr>
                <th>User</th>
                <th>IP</th>
                <th>Page</th>
                <th>Date / time</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v, i) => (
                <tr key={i}>
                  <td>{v.login_name || <span className="visits-anon">—</span>}</td>
                  <td>{v.ip || ''}</td>
                  <td>{v.page || ''}</td>
                  <td>{fmt(v.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
