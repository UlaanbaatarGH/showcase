import { useState } from 'react';
import { contactAdmin } from './data/backend.js';

// FIX420 <panel-contact-admin>: anonymous Contact form.
// Layout per FIX420.2: Subject input, Message textarea, Email input,
// Cancel/Send buttons. Send posts to /api/contact which records the
// message and (when the backend is configured) emails the admin.
// FIX420.4.1: the same IP gets a 60-second cooldown enforced on the
// backend; on a 429 we surface the message back into the form.
export default function ContactPanel({ onClose }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    // FIX420.3.1.1: non-blank fields. FIX420.3.1.2: email shape check.
    if (!subject.trim()) { setErr('Subject is required.'); return; }
    if (!message.trim()) { setErr('Message is required.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr('Email is not valid.');
      return;
    }
    setBusy(true);
    try {
      await contactAdmin({
        subject: subject.trim(),
        message: message.trim(),
        email: email.trim(),
      });
      setSent(true);
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal panel-contact-modal"
        data-yagu-id="panel-contact-admin"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="visits-header">
          <h2>Contact</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {sent ? (
          <div className="panel-contact-sent">
            Message sent. Thanks — we'll reply to {email}.
            <div className="panel-contact-actions">
              <button type="button" className="sc-menu-trigger" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="panel-contact-row">
              <span>Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="panel-contact-row panel-contact-row-textarea">
              <span>Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                required
              />
            </label>
            <label className="panel-contact-row">
              <span>Email addr for reply</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {err && <div className="visits-err">{err}</div>}
            <div className="panel-contact-actions">
              <button
                type="button"
                className="sc-menu-trigger"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="sc-menu-trigger"
                disabled={busy}
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
