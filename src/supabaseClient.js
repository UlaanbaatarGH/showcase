import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// FIX310: expose a single Supabase client. Returns null when env is unset so
// the app can still render (Home page list remains usable anonymously).
export const supabase = url && anon ? createClient(url, anon) : null;

export const supabaseConfigured = Boolean(supabase);

// Users type a login name of their choice (FIX310.1.1). Supabase Auth requires
// an email, so we synthesize one. Non-ASCII (é, ñ…) and whitespace are stripped
// because Supabase's validator rejects them; the original display name is still
// stored on app_user.login_name.
export function loginNameToEmail(loginName) {
  const normalized = loginName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '_');
  return `${normalized}@showcase.app`;
}
