import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseConfigured, loginNameToEmail } from './supabaseClient.js';
import {
  setAuthToken,
  redeemAccount,
  getSignInLockStatus,
  signupVisitor,
  getAppStatus,
} from './data/backend.js';

// FIX412.5.1 + FIX412.5.1.1 + FIX412.5.1.2: log a sign-in attempt.
//   page: 'login_ok' or 'login_failed' depending on outcome
//   login_name: whatever the user typed (so the User column can
//     display it even when the attempt failed and there's no
//     app_user row to join with)
//   token (optional): only set on success — backend resolves user_id
//     from it so we can also show the canonical login_name later.
// FIX405.4: the response also carries { lockout: { locked_out,
// attempts_remaining } } for 'login_failed' — the backend maintains
// the counter (FIX310.12 <user-is-locked-out>), this just relays it.
async function trackLogin({ ok, loginName, token }) {
  try {
    const res = await fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        page: ok ? 'login_ok' : 'login_failed',
        login_name: loginName,
      }),
    });
    return await res.json();
  } catch {
    /* fire-and-forget — never break the sign-in UI */
    return null;
  }
}

// FIX405.4.1.2: shown verbatim whenever <process-sign-in> finds
// <user-is-locked-out> already true — replaces FIX315.3's silent
// same-as-wrong-password denial, now FIX315.3(removed).
const ACCOUNT_LOCKED_MESSAGE =
  'Your account has been locked. Please contact your administrator for an access code.';

// 19-july-2026: Commented out on Hervé's request
// FIX315.2 / FIX315.2.1: idle-timeout configuration + a persisted
// "last activity" stamp. The in-memory setTimeout below only counts
// time while the JS context is alive — when the user closes the tab
// or shuts down the PC, only this localStorage stamp tells us, on
// return, that the inactivity gap exceeded the limit.
// const IDLE_MS = 15 * 60 * 1000;
// const LAST_ACTIVITY_KEY = 'sc-last-activity';
// function readLastActivity() {
//   try {
//     const v = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
//     return Number.isFinite(v) && v > 0 ? v : 0;
//   } catch { return 0; }
// }
// function stampActivity() {
//   try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())); } catch { /* ignore */ }
// }
// function clearLastActivity() {
//   try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch { /* ignore */ }
// }

// FIX310: holds the current session token and the app_user profile row.
const AuthContext = createContext(null);


export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  // FIX410.1.1.6 <website-In-maintenance>: fetched independently of
  // sign-in state — an anonymous visitor still needs to see the
  // FIX410.1.1.6.2 home-page banner.
  const [inMaintenance, setInMaintenance] = useState(false);

  const refreshMaintenance = useCallback(() => {
    getAppStatus()
      .then((s) => setInMaintenance(!!s?.in_maintenance))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMaintenance();
  }, [refreshMaintenance]);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      let s = data.session ?? null;
      if (s) {
        // 19-july-2026: Commented out on Hervé's request
        // FIX315.2 / FIX315.2.1: sign out if the inactivity gap
        // exceeded the idle limit while the tab was closed.
        // const last = readLastActivity();
        // if (last && Date.now() - last > IDLE_MS) {
        //   await supabase.auth.signOut();
        //   s = null;
        //   clearLastActivity();
        // } else {
        //   stampActivity();
        // }
      }
      if (cancelled) return;
      // Set the module-scope auth token synchronously with the session state
      // update so child effects that depend on `token` never see a window
      // where the token is stale relative to the React state.
      setAuthToken(s?.access_token ?? null);
      setSession(s);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setAuthToken(s?.access_token ?? null);
      setSession(s ?? null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // Whenever we have a fresh session, ensure the app_user row exists
  // (self-heals if it was never created) and cache the profile for the UI.
  //
  // TECH2: this fetch is hand-rolled (predates the token existing, so it
  // can't go through backendCloud.js's call() wrapper) and so was missing
  // the 401 recovery every other backend call gets — a stale/invalid
  // token at startup just left `session` set with `profile` silently
  // null forever (Edit button gone, no visible reason, only fixed by a
  // manual sign-out/in). Detect it here the same way call() does: clear
  // the token and dispatch 'auth:invalid' so AuthContext's own listener
  // below signs out and the UI falls back to the working anonymous state.
  useEffect(() => {
    if (!session) { setProfile(null); return undefined; }
    let cancelled = false;
    const { access_token, user } = session;
    const loginName =
      (user?.email || '').replace(/@showcase\.(app|local)$/, '') || user?.id || 'user';
    fetch('/api/users/me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({ login_name: loginName }),
    })
      .then((r) => {
        if (cancelled) return null;
        if (r.status === 401) {
          setAuthToken(null);
          window.dispatchEvent(new CustomEvent('auth:invalid', {
            detail: { reason: 'stale session at startup' },
          }));
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [session]);

  const signIn = useCallback(async (loginName, password) => {
    if (!supabaseConfigured) throw new Error('auth not configured');
    // FIX405.3.1 <process-sign-in>: a locked-out account (FIX310.12)
    // is rejected before the Supabase credential check even runs.
    const status = await getSignInLockStatus(loginName).catch(() => null);
    if (status?.locked_out) {
      trackLogin({ ok: false, loginName });
      throw new Error(ACCOUNT_LOCKED_MESSAGE);
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginNameToEmail(loginName),
      password,
    });
    if (error) {
      // FIX412.5.1.1: log the typed name so the User column shows it
      // even though there's no matching app_user row. FIX405.4.1: the
      // response carries the updated lockout state for this attempt.
      const result = await trackLogin({ ok: false, loginName });
      const lockout = result?.lockout;
      if (lockout?.locked_out) {
        throw new Error(ACCOUNT_LOCKED_MESSAGE);
      }
      // FIX405.4.1.1: "Invalid credentials." + remaining-attempts count.
      const remaining = lockout?.attempts_remaining;
      throw new Error(
        Number.isFinite(remaining)
          ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before your account is locked out.`
          : 'Invalid credentials.',
      );
    }
    // FIX412.5.1.2: success → 'Login OK' page; pass the freshly-issued
    // token so the backend can also record user_id and reset the
    // failed-attempt counter (FIX405.4).
    trackLogin({ ok: true, loginName, token: data.session?.access_token });
    return data;
  }, []);

  // FIX317: redeem an admin-issued access code to set the user's
  // password. Backend creates the Supabase auth row and links it to
  // the existing app_user; we then sign in normally so the session
  // pipeline is identical to a regular login.
  const redeem = useCallback(async ({ loginName, accessCode, password, email }) => {
    if (!supabaseConfigured) throw new Error('auth not configured');
    await redeemAccount({
      name: loginName,
      access_code: accessCode,
      password,
      email,
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginNameToEmail(loginName),
      password,
    });
    if (error) throw error;
    // FIX412.5.1.{1,2}: log the auto-login that follows a successful
    // redemption. Same shape as the normal signIn() success path —
    // pass the freshly-issued token so user_id is recorded.
    trackLogin({ ok: true, loginName, token: data.session?.access_token });
    return data;
  }, []);

  // FIX316.2.1 + FIX317 (Visitor flow): self-signup with no access
  // code. Creates the visitor account + signs in immediately.
  const signUpVisitor = useCallback(async ({ loginName, password, email }) => {
    if (!supabaseConfigured) throw new Error('auth not configured');
    await signupVisitor({ name: loginName, password, email });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginNameToEmail(loginName),
      password,
    });
    if (error) throw error;
    trackLogin({ ok: true, loginName, token: data.session?.access_token });
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    // Clear the backend auth token eagerly so any in-flight effect refiring
    // on the session change doesn't replay a request with a now-invalid JWT.
    setAuthToken(null);
    // 19-july-2026: Commented out on Hervé's request
    // FIX315.2 / FIX315.2.1: clearLastActivity();
    await supabase.auth.signOut();
  }, []);

  // 19-july-2026: Commented out on Hervé's request
  // FIX315.2 / FIX315.2.1: automatic sign-out after 15 minutes of inactivity.
  // Only armed while a session exists. Any mouse/keyboard/touch/scroll event
  // counts as activity and resets the timer; the timestamp is also persisted
  // so an across-shutdown gap is caught on next mount (see effect above).
  // useEffect(() => {
  //   if (!session) return undefined;
  //   let timer = null;
  //   const reset = () => {
  //     stampActivity();
  //     if (timer) clearTimeout(timer);
  //     timer = setTimeout(() => { signOut(); }, IDLE_MS);
  //   };
  //   const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
  //   events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  //   reset();
  //   return () => {
  //     if (timer) clearTimeout(timer);
  //     events.forEach((e) => window.removeEventListener(e, reset));
  //   };
  // }, [session, signOut]);

  // Auto-recover from a stale Supabase JWT. The data layer dispatches
  // 'auth:invalid' when any backend call returns 401 while a token is
  // attached (typically: server-side session no longer exists because
  // the user signed out from another tab / Supabase rotated keys /
  // the session was revoked). We respond by clearing the local
  // session so the UI falls back to the anonymous state and the user
  // can sign back in.
  useEffect(() => {
    const onInvalid = () => { signOut(); };
    window.addEventListener('auth:invalid', onInvalid);
    return () => window.removeEventListener('auth:invalid', onInvalid);
  }, [signOut]);

  const value = {
    session,
    profile,
    token: session?.access_token ?? null,
    loading,
    configured: supabaseConfigured,
    signIn,
    redeem,
    signUpVisitor,
    signOut,
    inMaintenance,
    refreshMaintenance,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
