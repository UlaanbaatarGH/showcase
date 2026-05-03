import { useEffect, useState } from 'react';
import { listAppVersions } from './data/backend.js';

// FIX414 <panel-app-versions>: deploy history for both halves of the
// stack (Render backend + Vercel frontend). Currently-live row is
// highlighted; failed/building rows show their status badge.
//
// FIX410.1.1.5.1 — opened from the Admin menu's 'App versions' item.

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // FIX412.2.1.1.1: dd/mm/yyyy hh:mm format (project-wide convention).
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function StatusPill({ status }) {
  return (
    <span className={`versions-pill versions-pill-${status || 'unknown'}`}>
      {status || 'unknown'}
    </span>
  );
}

function DeployTable({ deploys, note, title }) {
  // The first 'live' row is the currently effective deploy; older
  // 'live' rows are kept in history but not highlighted.
  let liveSeen = false;
  return (
    <section className="versions-section">
      <h3>{title}</h3>
      {note && <div className="versions-note">{note}</div>}
      {!note && deploys.length === 0 && (
        <div className="versions-empty">No deploys returned.</div>
      )}
      {deploys.length > 0 && (
        <table className="visits-table">
          <thead>
            <tr>
              <th>SHA</th>
              <th>Effective at</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {deploys.map((d, i) => {
              const isLive = d.status === 'live' && !liveSeen;
              if (isLive) liveSeen = true;
              return (
                <tr
                  key={`${d.sha_full || d.sha || ''}-${i}`}
                  className={isLive ? 'selected' : ''}
                >
                  <td>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        {d.sha || '—'}
                      </a>
                    ) : (
                      d.sha || '—'
                    )}
                  </td>
                  <td>{fmtDate(d.effective_at)}</td>
                  <td><StatusPill status={d.status} /></td>
                  <td className="versions-msg">{d.message || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function VersionsPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listAppVersions()
      .then(setData)
      .catch((e) => setError(e.message || String(e)));
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal versions-panel"
        data-yagu-id="panel-app-versions"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>App versions</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {error && <div className="visits-err">{error}</div>}
        {data === null && !error && (
          <div className="visits-loading">Loading…</div>
        )}
        {data && (
          <>
            <DeployTable
              title="Backend (Render)"
              deploys={data.backend?.deploys || []}
              note={data.backend?.note}
            />
            <DeployTable
              title="Frontend (Vercel)"
              deploys={data.frontend?.deploys || []}
              note={data.frontend?.note}
            />
          </>
        )}
      </div>
    </div>
  );
}
