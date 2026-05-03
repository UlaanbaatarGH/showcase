import { useCallback, useEffect, useState } from 'react';
import { listContactMessages, listIpStats } from './data/backend.js';

// FIX421 <panel-message-list>: list of contact messages.
// Columns + order per FIX421.2.1.11: Date/time, IP Addr, Project,
// Sender, Subject, Message, Reply addr, Valid addr.
// Sorted by descending Date/time (FIX421.2.1.10).
// projectId, when provided, scopes the listing to a single project
// (panel opened from a project's Admin menu — FIX421.1).
export default function MessagesPanel({ onClose, projectId = null }) {
  const [rows, setRows] = useState(null);
  const [ipNames, setIpNames] = useState({});
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    // Pull both lists in parallel — FIX421.4.1 needs the IP-name map
    // from <panel-ip-address-and-stats> (FIX413) to render the IP
    // column.
    Promise.all([listContactMessages(projectId), listIpStats()])
      .then(([msgs, stats]) => {
        setRows(msgs);
        const map = {};
        for (const r of stats?.rows || []) {
          if (r.name) map[r.ip] = r.name;
        }
        setIpNames(map);
        setError(null);
      })
      .catch((e) => setError(e.message || String(e)));
  }, [projectId]);

  useEffect(() => { reload(); }, [reload]);

  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      + ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  };

  // FIX421.4.1: show the friendly name when one is defined for the
  // visitor's IP, otherwise show the IP itself.
  const ipDisplay = (ip) => (ip ? (ipNames[ip] || ip) : '');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal panel-message-list-modal"
        data-yagu-id="panel-message-list"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Messages</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {error && <div className="visits-err">{error}</div>}
        {rows === null && !error && (
          <div className="visits-loading">Loading…</div>
        )}
        {rows && rows.length === 0 && (
          <div className="visits-empty">No message yet.</div>
        )}
        {rows && rows.length > 0 && (
          <div className="panel-message-list-scroll">
            <table className="visits-table panel-message-list-table">
              <thead>
                <tr>
                  {/* FIX421.2.1.11 column order. */}
                  {/* FIX421.2.1.1 / .1.0 <msg-date-time> */}
                  <th>Date / time</th>
                  {/* FIX421.2.1.8 / .8.0 <visitor-ip-addr> */}
                  <th>IP Addr</th>
                  {/* FIX421.2.1.2 / .2.0 <msg-project> */}
                  <th>Project</th>
                  {/* FIX421.2.1.3 / .3.0 <msg-sender> */}
                  <th>Sender</th>
                  {/* FIX421.2.1.4 / .4.0 <msg-subject> */}
                  <th>Subject</th>
                  {/* FIX421.2.1.5 / .5.0 <msg-message> */}
                  <th>Message</th>
                  {/* FIX421.2.1.6 / .6.0 <msg-reply-addr> */}
                  <th>Reply addr</th>
                  {/* FIX421.2.1.7 / .7.0 <msg-valid-reply-addr> */}
                  <th>Valid addr</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-yagu-id="msg-date-time">{fmt(r.ts)}</td>
                    {/* FIX421.4.1: friendly name (when set in
                        <panel-ip-address-and-stats>) or raw IP. */}
                    <td data-yagu-id="visitor-ip-addr">{ipDisplay(r.ip)}</td>
                    <td data-yagu-id="msg-project">{r.project_name || ''}</td>
                    <td data-yagu-id="msg-sender">{r.sender_email}</td>
                    <td data-yagu-id="msg-subject">{r.subject}</td>
                    <td
                      data-yagu-id="msg-message"
                      className="panel-message-list-body"
                    >
                      {r.body}
                    </td>
                    <td data-yagu-id="msg-reply-addr">{r.sender_email}</td>
                    {/* FIX421.2.1.7 + FIX420.4.2.3 <msg-reply-validity>:
                        ticked when the auto-reply went through (=
                        email_invalid is false). Flipped to false
                        asynchronously by the bounce/complaint webhook
                        on /api/webhooks/resend. */}
                    <td className="users-check" data-yagu-id="msg-valid-reply-addr">
                      <input
                        type="checkbox"
                        data-yagu-id="msg-reply-validity"
                        checked={!r.email_invalid}
                        readOnly
                        tabIndex={-1}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
