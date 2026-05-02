import { useCallback, useEffect, useState } from 'react';
import { listContactMessages } from './data/backend.js';

// FIX421 <panel-message-list>: list of contact messages.
// Columns per FIX421.2.1.x: Date/time, Project, Sender, Subject,
// Message, Reply addr, Valid addr. Sorted by descending Date/time
// (FIX421.2.1.10).
// projectId, when provided, scopes the listing to a single project
// (panel opened from a project's Admin menu — FIX421.1).
export default function MessagesPanel({ onClose, projectId = null }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    listContactMessages(projectId)
      .then((d) => { setRows(d); setError(null); })
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
                  {/* FIX421.2.1.1 */}
                  <th>Date / time</th>
                  {/* FIX421.2.1.2 */}
                  <th>Project</th>
                  {/* FIX421.2.1.3 */}
                  <th>Sender</th>
                  {/* FIX421.2.1.4 */}
                  <th>Subject</th>
                  {/* FIX421.2.1.5 */}
                  <th>Message</th>
                  {/* FIX421.2.1.6 */}
                  <th>Reply addr</th>
                  {/* FIX421.2.1.7 */}
                  <th>Valid addr</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmt(r.ts)}</td>
                    <td>{r.project_name || ''}</td>
                    <td>{r.sender_email}</td>
                    <td>{r.subject}</td>
                    <td className="panel-message-list-body">{r.body}</td>
                    <td>{r.sender_email}</td>
                    {/* FIX421.2.1.7 + FIX420.4.2.3 <msg-reply-validity>:
                        ticked when the auto-reply went through (=
                        email_invalid is false). Flipped to false
                        asynchronously by the bounce/complaint webhook
                        on /api/webhooks/resend. */}
                    <td className="users-check">
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
