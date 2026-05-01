import { useCallback, useEffect, useState } from 'react';
import { listVisits, listIpStats, setIpName } from './data/backend.js';

// FIX411 <panel-visits>: tabbed panel grouping the visit views.
// FIX411.2: two tabs — <panel-visits-history> (FIX412) and
// <panel-ip-address-and-stats> (FIX413). The IP-name map referenced
// in FIX412.2.1.2 lives here and is shared across tabs so editing a
// name on the IP tab reflects on the History tab without a refetch.
export default function VisitsPanel({ onClose }) {
  const [tab, setTab] = useState('history');
  const [ipStats, setIpStats] = useState(null);
  const [ipError, setIpError] = useState(null);

  const reloadIpStats = useCallback(() => {
    listIpStats()
      .then((d) => { setIpStats(d); setIpError(null); })
      .catch((e) => setIpError(e.message || String(e)));
  }, []);

  useEffect(() => { reloadIpStats(); }, [reloadIpStats]);

  // FIX412.2.1.2: lookup map { ip → name } shared with the History tab.
  const ipNames = {};
  if (ipStats?.rows) {
    for (const r of ipStats.rows) {
      if (r.name) ipNames[r.ip] = r.name;
    }
  }

  // Optimistic update: when the user edits a name on the IP tab, update
  // local state immediately so the History column refreshes; the server
  // round-trip happens in the background and reload syncs counts after.
  const onSetIpName = async (ip, name) => {
    setIpStats((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => (r.ip === ip ? { ...r, name } : r)),
      };
    });
    try {
      await setIpName(ip, name);
    } catch (e) {
      setIpError(e.message || String(e));
    }
  };

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
            <IpStatsTab
              ipStats={ipStats}
              error={ipError}
              onSetName={onSetIpName}
            />
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
  // FIX412.2.1.1.1: page label — 'home', 'project' and (FIX412.5.1)
  // 'login' for sign-in attempts. Capitalize for display; future
  // multi-project support will resolve project ids to names.
  const pageLabel = (p) => {
    if (p === 'home') return 'Home';
    if (p === 'project') return 'Project';
    if (p === 'login') return 'Login';
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

// FIX413 <panel-ip-address-and-stats>: per-IP friendly name + counts of
// consultations of the App home page and the 1st project's home page.
// The name is editable inline; saved on blur, optimistically reflected
// on the History tab via the parent's ipNames map.
function IpStatsTab({ ipStats, error, onSetName }) {
  // Local input buffer so typing is responsive; the parent only sees
  // the value on blur (when we both commit locally and call the API).
  const [drafts, setDrafts] = useState({});

  if (error) return <div className="visits-err">{error}</div>;
  if (ipStats === null) return <div className="visits-loading">Loading…</div>;

  const projectName = ipStats.projects?.[0]?.name || 'Project';
  const valueFor = (row) =>
    Object.prototype.hasOwnProperty.call(drafts, row.ip) ? drafts[row.ip] : row.name;

  const onBlur = (row) => {
    const next = (drafts[row.ip] ?? row.name).trim();
    setDrafts((d) => {
      const c = { ...d };
      delete c[row.ip];
      return c;
    });
    if (next !== row.name) onSetName(row.ip, next);
  };

  if (!ipStats.rows || ipStats.rows.length === 0) {
    return <div className="visits-empty">No IP recorded yet.</div>;
  }
  return (
    <table className="visits-table" data-yagu-id="panel-ip-address-and-stats">
      <thead>
        <tr>
          <th>IP Addr</th>
          <th>IP Name</th>
          <th>Home</th>
          <th>{projectName}</th>
        </tr>
      </thead>
      <tbody>
        {ipStats.rows.map((r) => (
          <tr key={r.ip}>
            <td>{r.ip}</td>
            <td>
              <input
                type="text"
                data-yagu-id="ip-name"
                className="ip-name-input"
                value={valueFor(r)}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [r.ip]: e.target.value }))
                }
                onBlur={() => onBlur(r)}
                placeholder="(unnamed)"
              />
            </td>
            <td className="visits-num">{r.home_count}</td>
            <td className="visits-num">{r.project_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
