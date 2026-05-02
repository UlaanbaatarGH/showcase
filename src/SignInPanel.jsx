import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

// FIX316: the Sign-in popup hosts both the sign-in form and the
// Create-Account flows. FIX316.2.1 / .2.2: two entry buttons
// (<button-new-visitor>, <button-new-manager>) swap the form for
// <panel-create-account>. Visitor flow is self-service (no access
// code); manager flow requires the admin-issued <user-access-code>.
export default function SignInPanel({ onClose }) {
  const { signIn, redeem, signUpVisitor, configured } = useAuth();
  // 'signin' | 'create-visitor' | 'create-manager'
  const [mode, setMode] = useState('signin');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  // Create-account-only fields:
  const [accessCode, setAccessCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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

  const isCreate = mode === 'create-visitor' || mode === 'create-manager';

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
      } else if (mode === 'create-manager') {
        await redeem({ loginName, accessCode, password, email: email.trim() });
      } else {
        await signUpVisitor({ loginName, password, email: email.trim() });
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

  const title = mode === 'signin'
    ? 'Sign in'
    : mode === 'create-visitor'
    ? 'New Visitor'
    : 'New Manager';

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
      {/* FIX316.2.1 + FIX316.2.2: two entry buttons that switch into
          the create-account flow. FIX316.2 (updated): clicking either
          turns this panel into <panel-create-account>. */}
      {mode === 'signin' ? (
        <div className="signin-toggle-row">
          <button
            type="button"
            className="signin-toggle"
            data-yagu-id="button-new-visitor"
            onClick={() => switchMode('create-visitor')}
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
    </form>
  );
}
