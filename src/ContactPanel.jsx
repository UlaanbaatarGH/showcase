import { useState } from 'react';
import { contactAdmin } from './data/backend.js';

// FIX420 <panel-contact-admin>: anonymous Contact form.
// Layout per the updated FIX420.2:
//   Subject [______]
//   [x] {selected-item1}
//   [x] {selected-item2} ...
//   Message [______]
//   Email addr for reply [______]
//   [Cancel][Send]
// FIX420.4.1: same IP gets a 60-second cooldown enforced on the
// backend; on a 429 we surface the message back into the form.
//
// Props:
//   selectedItems: [{ id, label }]  — items currently selected in
//                                     the Showcase List (FIX420.2.2 +
//                                     FIX420.4.2.4); checkboxes are
//                                     ticked by default and the user
//                                     can untick before sending.
//   defaultEmail:  string           — pre-fills <msg-reply-addr>
//                                     when the visitor is signed in
//                                     (FIX420.4.2.5).
export default function ContactPanel({
  onClose,
  projectId = null,
  selectedItems = [],
  defaultEmail = '',
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail || '');
  // FIX420.2.2.1 <msg-item-is-selected> + FIX420.4.2.4: every
  // currently-selected Showcase row is listed and ticked by default.
  const [pickedItemIds, setPickedItemIds] = useState(
    () => new Set(selectedItems.map((it) => it.id)),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);

  const toggleItem = (id) => {
    setPickedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      // Send the labels of the items the visitor kept ticked so the
      // backend can prepend them to the stored body and the echo email.
      const items = selectedItems
        .filter((it) => pickedItemIds.has(it.id))
        .map((it) => it.label)
        .filter((l) => l && l.length > 0);
      await contactAdmin({
        subject: subject.trim(),
        message: message.trim(),
        email: email.trim(),
        ...(projectId != null ? { project_id: projectId } : {}),
        ...(items.length > 0 ? { items } : {}),
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
            {/* FIX420.2.1 Field 'Subject', as <msg-subject>. */}
            <label className="panel-contact-row">
              <span>Subject</span>
              <input
                type="text"
                data-yagu-id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                autoFocus
                required
              />
            </label>
            {/* FIX420.2.2 + FIX420.2.2.0 + FIX420.4.2.4 <item-selection>:
                checklist of the items currently selected on the
                Showcase List, all ticked by default. Each row's label
                is the FIX508.2.4 item-short-label (FIX420.2.2.2). */}
            {selectedItems.length > 0 && (
              <div
                className="panel-contact-items"
                data-yagu-id="item-selection"
              >
                {selectedItems.map((it) => (
                  <label key={it.id} className="panel-contact-item-row">
                    <input
                      type="checkbox"
                      data-yagu-id="msg-item-is-selected"
                      checked={pickedItemIds.has(it.id)}
                      onChange={() => toggleItem(it.id)}
                    />
                    <span>{it.label || `Item ${it.id}`}</span>
                  </label>
                ))}
              </div>
            )}
            {/* FIX420.2.3 Field 'Message', as <msg-message>. */}
            <label className="panel-contact-row panel-contact-row-textarea">
              <span>Message</span>
              <textarea
                data-yagu-id="msg-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                required
              />
            </label>
            {/* FIX420.2.4 Field 'Email addr for reply', as <msg-reply-addr>.
                FIX420.4.2.5: pre-filled with the signed-in user's email
                when one is known. */}
            <label className="panel-contact-row">
              <span>Email addr for reply</span>
              <input
                type="email"
                data-yagu-id="msg-reply-addr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {err && <div className="visits-err">{err}</div>}
            <div className="panel-contact-actions">
              {/* FIX420.2.10 [Cancel] */}
              <button
                type="button"
                className="sc-menu-trigger"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              {/* FIX420.2.11 [Send] */}
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
