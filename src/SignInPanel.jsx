import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

// FIX316: the Sign-in popup hosts both the sign-in form and the
// Create-Account flows. FIX316.2.1 / .2.2: two entry buttons.
// <button-new-manager> swaps the form for <panel-create-account>;
// <button-new-visitor> shows an info popup since visitor self-signup
// isn't released yet (FIX316.2 updated).
export default function SignInPanel({ onClose }) {
  const { signIn, redeem, configured } = useAuth();
  // 'signin' | 'create-manager'
  const [mode, setMode] = useState('signin');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  // Create-account-only fields:
  const [accessCode, setAccessCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // FIX316.2: 'New Visitor Access' opens an info popup until the
  // visitor flow is released.
  const [visitorInfoOpen, setVisitorInfoOpen] = useState(false);

  if (!configured) {
    return (
      <div className="signin-panel">
        <div className="signin-err">
          Sign-in is not configured. Set VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY, then reload.
        </div>
        <button className="btn-cancel" type="button" onClick={onClose}>Close</button>
      </div>
    );
  }

  const isCreate = mode === 'create-manager';

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (isCreate) {
      // FIX317.3.1.3: passwords match, ≥ 8 chars (frontend gate; the
      // server re-checks).
      if (password !== confirmPassword) {
        setErr('Passwords do not match.');
        return;
      }
      if (password.length < 8) {
        setErr('Password must be at least 8 characters.');
        return;
      }
      // FIX317.3.1.4: email shape check on the client too.
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setErr('Email is not valid.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(loginName, password);
      } else {
        await redeem({ loginName, accessCode, password, email: email.trim() });
      }
      onClose?.();
    } catch (e2) {
      // Supabase speaks in terms of "email"; users see "login name" in the UI.
      // Rewrite the wording so the message matches what they typed.
      const raw = e2.message || String(e2);
      setErr(
        raw
          .replace(/email address/gi, 'login name')
          .replace(/\bemail\b/gi, 'login name')
      );
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (next) => {
    setErr(null);
    setMode(next);
    // Clear sensitive fields when toggling so a partially-typed
    // password doesn't leak from one mode to the other.
    setPassword('');
    setConfirmPassword('');
    setAccessCode('');
    setEmail('');
  };

  const title = mode === 'signin' ? 'Sign in' : 'New Manager';

  return (
    <form
      className="signin-panel"
      data-yagu-id={isCreate ? 'panel-create-account' : undefined}
      onSubmit={submit}
    >
      <h2>{title}</h2>
      {/* FIX317.2.1 Login Name. */}
      <label>
        Login name
        <input
          type="text"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          autoFocus
          required
          minLength={3}
          autoComplete="username"
        />
      </label>
      {/* FIX317.2.2 + FIX317.2.2.1: Access Code is visible only for
          the Manager flow. */}
      {mode === 'create-manager' && (
        <label>
          Access code
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            placeholder="6 digits"
            autoComplete="one-time-code"
          />
        </label>
      )}
      {/* FIX317.2.3 Password. */}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={isCreate ? 8 : 6}
          autoComplete={isCreate ? 'new-password' : 'current-password'}
        />
      </label>
      {/* FIX317.2.4 Confirm Password — only in the create flows. */}
      {isCreate && (
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      )}
      {/* FIX317.2.5 Email — required in both create flows. */}
      {isCreate && (
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
      )}
      {err && <div className="signin-err">{err}</div>}
      <div className="signin-actions">
        <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create'}
        </button>
      </div>
      {/* FIX316.2.1 + FIX316.2.2: two entry buttons. New Manager
          Access switches into the create-account flow; New Visitor
          Access opens the info popup until the visitor flow is
          released (FIX316.2 updated). */}
      {mode === 'signin' ? (
        <div className="signin-toggle-row">
          <button
            type="button"
            className="signin-toggle"
            data-yagu-id="button-new-visitor"
            onClick={() => setVisitorInfoOpen(true)}
            disabled={busy}
          >
            New Visitor Access
          </button>
          <button
            type="button"
            className="signin-toggle"
            data-yagu-id="button-new-manager"
            onClick={() => switchMode('create-manager')}
            disabled={busy}
          >
            New Manager Access
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="signin-toggle"
          onClick={() => switchMode('signin')}
          disabled={busy}
        >
          Already have an account? Sign in
        </button>
      )}
      {visitorInfoOpen && (
        <VisitorInfoPopup onClose={() => setVisitorInfoOpen(false)} />
      )}
    </form>
  );
}

// FIX316.2: clicking <button-new-visitor> shows this small info
// popup until the visitor self-signup flow is released.
function VisitorInfoPopup({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal panel-visitor-info"
        onClick={(e) => e.stopPropagation()}
      >
        <p>
          Visitor accounts are coming soon. You'll be able to mark
          items of interest and keep your own private comments.
        </p>
        <div className="panel-contact-actions">
          <button type="button" className="sc-menu-trigger" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
