import { useEffect, useState } from 'react';
import { listVisits } from './data/backend.js';

// FIX410.1.1.1.1: list of users that logged in with date/time, most
// recent first. Backend endpoint contract:
//   GET /api/admin/visits → [{ login_name, ts (ISO string) }, ...]
// already sorted desc by ts.
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
          <div className="visits-empty">No login recorded yet.</div>
        )}
        {!error && visits && visits.length > 0 && (
          <table className="visits-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Date / time</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v, i) => (
                <tr key={i}>
                  <td>{v.login_name}</td>
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
