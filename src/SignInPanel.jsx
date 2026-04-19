import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

// FIX400.2.2 + FIX310: login name + password form with sign-in / create-account modes.
export default function SignInPanel({ onClose }) {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
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
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(loginName, password);
      else await signUp(loginName, password);
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

  return (
    <form className="signin-panel" onSubmit={submit}>
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
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </label>
      {err && <div className="signin-err">{err}</div>}
      <div className="signin-actions">
        <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create'}
        </button>
      </div>
      <button
        type="button"
        className="signin-toggle"
        onClick={() => { setErr(null); setMode(mode === 'signin' ? 'signup' : 'signin'); }}
        disabled={busy}
      >
        {mode === 'signin' ? 'No account? Create one' : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}
