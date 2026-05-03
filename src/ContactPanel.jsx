import { useState } from 'react';
import { contactAdmin } from './data/backend.js';
import { useT } from './i18n/i18n.jsx';

// FIX420 <panel-contact-admin>: anonymous Contact form.
// Layout per the updated FIX420.2:
//   {Subject} [______]
//   [x] {selected-item1}
//   [x] {selected-item2} ...
//   {Message} [______]
//   {Email addr for reply} [______]
//   {error-text} [Cancel][Send]
//
// FIX420.2.20 — only the buttons close the popup (the backdrop is
// no longer click-to-dismiss).
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
  const t = useT();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail || '');
  // FIX420.2.2.1 <msg-item-is-selected> + FIX420.4.2.4: every
  // currently-selected Showcase row is listed and ticked by default.
  const [pickedItemIds, setPickedItemIds] = useState(
    () => new Set(selectedItems.map((it) => it.id)),
  );
  const [busy, setBusy] = useState(false);
  // FIX420.4.2.6 <label-error-text> + FIX420.4.2.7 errField:
  // remember which input the current error relates to so we can
  // frame it in red.
  const [err, setErr] = useState('');
  const [errField, setErrField] = useState(null); // 'subject' | 'message' | 'email' | null
  const [sent, setSent] = useState(false);

  const toggleItem = (id) => {
    setPickedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // FIX420.4.2.8: clicking anywhere in the panel clears the error
  // text and the red frame. Wired on mousedown so it fires *before*
  // the Send button's click handler — if validation then re-fails,
  // the new error is set after this clear, so it stays visible.
  const clearError = () => {
    if (err || errField) {
      setErr('');
      setErrField(null);
    }
  };

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setErrField(null);
    // FIX420.3.1.1: non-blank fields. FIX420.3.1.2: email shape check.
    if (!subject.trim()) {
      setErr(t('Subject is required.'));
      setErrField('subject');
      return;
    }
    if (!message.trim()) {
      setErr(t('Message is required.'));
      setErrField('message');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr(t('Email is not valid.'));
      setErrField('email');
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
      // (14) Auto-close the popup ~2s after the success message
      // appears, so we don't need a Close button on the success state.
      setTimeout(() => onClose(), 2000);
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  const errorClass = (field) =>
    errField === field ? 'panel-contact-input-error' : '';

  return (
    /* FIX420.2.20: backdrop no longer dismisses the popup — only
       the explicit Cancel / Close buttons do. */
    <div className="modal-backdrop">
      <form
        className="modal panel-contact-modal"
        data-yagu-id="panel-contact-admin"
        onSubmit={submit}
        /* FIX420.4.2.8: clicking anywhere in the panel clears the
           current error. mousedown fires before the Send-button
           click → submit, so a freshly-set validation error is
           NOT wiped by this handler when the user clicks Send. */
        onMouseDown={clearError}
        /* Disable browser HTML5 validation popups (which would
           render in the browser's UI language and bypass our
           submit handler entirely). */
        noValidate
      >
        {/* (14) No 'Close' link in the header — the panel exposes
            only Cancel / Send. After a successful Send the popup
            auto-closes. */}
        <header className="visits-header">
          <h2>{t('Contact')}</h2>
        </header>
        {sent ? (
          <div className="panel-contact-sent">
            {t('Message sent. Thanks — we will reply to {email}.', { email })}
          </div>
        ) : (
          <>
            {/* FIX420.2.1 Field 'Subject', as <msg-subject>. */}
            <label className="panel-contact-row">
              <span>{t('Subject')}</span>
              <input
                type="text"
                data-yagu-id="msg-subject"
                className={errorClass('subject')}
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
              <span>{t('Message')}</span>
              <textarea
                data-yagu-id="msg-message"
                className={errorClass('message')}
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
              <span>{t('Email addr for reply')}</span>
              <input
                type="email"
                data-yagu-id="msg-reply-addr"
                className={errorClass('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            {/* FIX420.2.12 + FIX420.2.12.0 + FIX420.2.12.1 +
                FIX420.4.2.6 <label-error-text>: bright-red error
                message that sits next to the action buttons; empty
                when there's no error. */}
            <div className="panel-contact-action-row">
              <span
                className="panel-contact-error-text"
                data-yagu-id="label-error-text"
              >
                {err}
              </span>
              <div className="panel-contact-actions">
                {/* FIX420.2.10 [Cancel] */}
                <button
                  type="button"
                  className="sc-menu-trigger"
                  onClick={onClose}
                  disabled={busy}
                >
                  {t('Cancel')}
                </button>
                {/* FIX420.2.11 [Send] — key 'Msg-send' is scoped to
                    the contact form per the spec. */}
                <button
                  type="submit"
                  className="sc-menu-trigger"
                  disabled={busy}
                >
                  {busy ? '…' : t('Msg-send')}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
