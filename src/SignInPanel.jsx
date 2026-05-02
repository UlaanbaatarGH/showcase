import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

// FIX316 + FIX317: the sign-in popup also exposes a Create Account
// option that swaps the form for <panel-create-account>. Self-signup
// is replaced by admin-issued access codes — the user redeems by
// entering Login Name + Access Code + Password (twice).
export default function SignInPanel({ onClose }) {
  const { signIn, redeem, configured } = useAuth();
  // 'signin' | 'create'
  const [mode, setMode] = useState('signin');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  // Create-account-only fields:
  const [accessCode, setAccessCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (mode === 'create') {
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
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(loginName, password);
      } else {
        await redeem({ loginName, accessCode, password });
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
  };

  return (
    <form
      className="signin-panel"
      data-yagu-id={mode === 'create' ? 'panel-create-account' : undefined}
      onSubmit={submit}
    >
      <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
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
      {/* FIX317.2.2: access code, only in create mode. */}
      {mode === 'create' && (
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
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'create' ? 8 : 6}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
        />
      </label>
      {/* FIX317.2.4: confirm password, only in create mode. */}
      {mode === 'create' && (
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
      {err && <div className="signin-err">{err}</div>}
      <div className="signin-actions">
        <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create'}
        </button>
      </div>
      {/* FIX316.1: toggle to and from the create-account view. */}
      <button
        type="button"
        className="signin-toggle"
        onClick={() => switchMode(mode === 'signin' ? 'create' : 'signin')}
        disabled={busy}
      >
        {mode === 'signin'
          ? 'Have an access code? Create your account'
          : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}
