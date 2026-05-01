import { useEffect, useState } from 'react';
import { listVisits } from './data/backend.js';

// FIX411 <panel-visits>: tabbed panel grouping the visit views.
// FIX411.2: two tabs — <panel-visits-history> (FIX412) and
// <panel-ip-address-and-stats> (FIX413). The IP-name map referenced
// in FIX412.2.1.2 is wired through `ipNames` so the History tab can
// display friendly names once FIX413 lands; today it stays empty and
// the column falls back to the IP address.
export default function VisitsPanel({ onClose }) {
  const [tab, setTab] = useState('history');
  // Empty until FIX413 / <panel-ip-address-and-stats> persists names.
  const ipNames = {};

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal visits-panel"
        data-yagu-id="panel-visits"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Visits</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {/* FIX411.2: tab strip. */}
        <div className="visits-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ip'}
            className={tab === 'ip' ? 'active' : ''}
            onClick={() => setTab('ip')}
          >
            IP Address &amp; stats
          </button>
        </div>
        <div className="visits-body">
          {tab === 'history' ? (
            <VisitsHistoryTab ipNames={ipNames} />
          ) : (
            <IpStatsTab />
          )}
        </div>
      </div>
    </div>
  );
}

// FIX412 <panel-visits-history>: table of consultations sorted most
// recent first. Columns per FIX412.2.1.{1..4}: User, IP (with name
// fallback), Page, Date/time.
function VisitsHistoryTab({ ipNames }) {
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
  // FIX412.2.1.1.1: page label — only 'home' and 'project' are tracked
  // today. Capitalize for display; future multi-project support will
  // resolve project ids to names.
  const pageLabel = (p) => {
    if (p === 'home') return 'Home';
    if (p === 'project') return 'Project';
    return p || '';
  };
  // FIX412.2.1.2: prefer the friendly name when one is mapped; fall
  // back to the raw IP otherwise.
  const ipLabel = (ip) => (ip && ipNames[ip]) || ip || '';

  if (error) return <div className="visits-err">{error}</div>;
  if (visits === null) return <div className="visits-loading">Loading…</div>;
  if (visits.length === 0) {
    return <div className="visits-empty">No visit recorded yet.</div>;
  }
  return (
    <table className="visits-table" data-yagu-id="panel-visits-history">
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
            <td>{ipLabel(v.ip)}</td>
            <td>{pageLabel(v.page)}</td>
            <td>{fmt(v.ts)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// FIX413 <panel-ip-address-and-stats>: placeholder until storage and
// per-IP aggregation land. Keeps the tab visible so the layout is
// stable; the body fills in when FIX413 is implemented.
function IpStatsTab() {
  return (
    <div
      className="visits-empty"
      data-yagu-id="panel-ip-address-and-stats"
    >
      Coming with FIX413 — IP names and per-page consultation counts.
    </div>
  );
}
