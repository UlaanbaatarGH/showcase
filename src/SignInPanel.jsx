import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { getUserHasEmail } from './data/backend.js';

// FIX405 <panel-sign-in> + FIX406 <panel-sign-in-with access-code>:
// one component hosts both panels, toggled by <cmd-sign-in-with-code>
// (FIX405.2.8 / FIX405.3.2). Replaces the former FIX316/FIX317
// Create-Account flow's two-button entry (New Visitor / New Manager
// Access) — visitor self-signup was never released past its 'coming
// soon' popup, so it's dropped rather than carried over.
export default function SignInPanel({ onClose }) {
  const { signIn, redeem, configured } = useAuth();
  // 'signin' | 'signin-with-code'
  const [mode, setMode] = useState('signin');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  // Sign-in-with-code-only fields:
  const [accessCode, setAccessCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  // FIX406.2.5: whether <record-user> for the typed username already
  // has an email on file — when true the Email field stays hidden.
  const [hasEmailOnFile, setHasEmailOnFile] = useState(false);
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

  const isCreate = mode === 'signin-with-code';

  const checkHasEmail = async (name) => {
    const trimmed = (name ?? loginName).trim();
    if (!trimmed) { setHasEmailOnFile(false); return; }
    try {
      const r = await getUserHasEmail(trimmed);
      setHasEmailOnFile(!!r?.has_email);
    } catch {
      setHasEmailOnFile(false);
    }
  };

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
      // FIX406.2.5: email shape check only when the field is actually
      // shown — a user who already has one on file never re-enters it.
      if (!hasEmailOnFile && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setErr('Email is not valid.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        // FIX405.3.1 <cmd-sign-in> runs <process-sign-in>.
        await signIn(loginName, password);
      } else {
        await redeem({
          loginName,
          accessCode,
          password,
          ...(hasEmailOnFile ? {} : { email: email.trim() }),
        });
      }
      onClose?.();
    } catch (e2) {
      // Supabase speaks in terms of "email"; users see "username" in the UI.
      // Rewrite the wording so the message matches what they typed.
      const raw = e2.message || String(e2);
      setErr(
        raw
          .replace(/email address/gi, 'username')
          .replace(/\bemail\b/gi, 'username')
      );
    } finally {
      setBusy(false);
    }
  }

  const switchToSignInWithCode = () => {
    setErr(null);
    setMode('signin-with-code');
    setPassword('');
    setConfirmPassword('');
    setAccessCode('');
    setEmail('');
    // FIX405.3.2: the username already typed on the plain sign-in
    // panel carries over, so check it right away.
    checkHasEmail();
  };

  return (
    <form
      className="signin-panel"
      data-yagu-id={isCreate ? 'panel-sign-in-with-access-code' : 'panel-sign-in'}
      onSubmit={submit}
    >
      <h2>Sign in</h2>
      {/* FIX405.2.1 / FIX406.2.1 Field 'Username', mapped to <user-username>. */}
      <label>
        Username
        <input
          type="text"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          onBlur={() => { if (isCreate) checkHasEmail(); }}
          autoFocus
          required
          minLength={3}
          autoComplete="username"
        />
      </label>
      {/* FIX406.2.2 Field 'Access code', mapped to <user-access-code>. */}
      {isCreate && (
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
      {/* FIX405.2.2 / FIX406.2.3 Field 'Password', mapped to <user-password>. */}
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
      {/* FIX406.2.4 Field 'Confirm password', as <user-password-confirm>. */}
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
      {/* FIX406.2.5 Field 'Email', mapped to <user-email> — displayed
          only when <record-user> doesn't already have one. */}
      {isCreate && !hasEmailOnFile && (
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
        {/* FIX405.2.7 / FIX406.2.6 Button 'Cancel'. */}
        <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {/* FIX405.2.6 / FIX406.2.6 Button 'Sign in', as <cmd-sign-in>.
            Enabled when <user-username> and <user-password> are entered
            (native `required` on both inputs). */}
        <button type="submit" className="btn-primary" data-yagu-id="cmd-sign-in" disabled={busy}>
          {busy ? '…' : 'Sign in'}
        </button>
      </div>
      {/* FIX405.2.8 / FIX405.3.2: <cmd-sign-in-with-code> replaces this
          panel with <panel-sign-in-with access-code>. */}
      {mode === 'signin' && (
        <button
          type="button"
          className="signin-toggle"
          data-yagu-id="cmd-sign-in-with-code"
          onClick={switchToSignInWithCode}
          disabled={busy}
        >
          Sign in with code
        </button>
      )}
    </form>
  );
}
