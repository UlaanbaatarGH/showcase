import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseConfigured, loginNameToEmail } from './supabaseClient.js';
import { setAuthToken } from './data/backend.js';

// FIX310 + FIX300: holds the current session token and the app_user profile row.
const AuthContext = createContext(null);

async function upsertAppUser(loginName, token) {
  const res = await fetch('/api/users/me', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ login_name: loginName }),
  });
  if (!res.ok) throw new Error(`POST /api/users/me failed: ${res.status}`);
  return res.json();
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Whenever we have a fresh session, ensure the app_user row exists
  // (self-heals if it was never created) and cache the profile for the UI.
  useEffect(() => {
    setAuthToken(session?.access_token ?? null);
    if (!session) { setProfile(null); return; }
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
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [session]);

  const signIn = useCallback(async (loginName, password) => {
    if (!supabaseConfigured) throw new Error('auth not configured');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginNameToEmail(loginName),
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (loginName, password) => {
    if (!supabaseConfigured) throw new Error('auth not configured');
    const { data, error } = await supabase.auth.signUp({
      email: loginNameToEmail(loginName),
      password,
    });
    if (error) throw error;
    // With email confirmation OFF in Supabase, signUp returns a session directly.
    // Upsert the app_user row immediately so the backend knows about the user.
    if (data.session) {
      await upsertAppUser(loginName, data.session.access_token);
    }
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) return;
    await supabase.auth.signOut();
  }, []);

  // FIX315.2 / FIX315.2.1: automatic sign-out after 15 minutes of inactivity.
  // Only armed while a session exists. Any mouse/keyboard/touch/scroll event
  // counts as activity and resets the timer.
  useEffect(() => {
    if (!session) return undefined;
    const IDLE_MS = 15 * 60 * 1000;
    let timer = null;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { signOut(); }, IDLE_MS);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, signOut]);

  const value = {
    session,
    profile,
    token: session?.access_token ?? null,
    loading,
    configured: supabaseConfigured,
    signIn,
    signUp,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
