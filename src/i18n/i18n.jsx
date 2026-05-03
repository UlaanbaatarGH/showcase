import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { listLanguages } from '../data/backend.js';

// FIX509 <panel-language-setup> runtime:
//   - LanguageProvider loads the language list once on mount, picks
//     an active language (localStorage > browser > server-default),
//     and exposes the t() helper that resolves keys with a chain of
//     fallbacks: active → server-default → hardcoded I18N_KEY_INDEX.
//   - Listens to the 'language:updated' event so the setup panel can
//     refetch after edits without a page reload.
const LanguageContext = createContext(null);

const ACTIVE_LANG_KEY = 'sc-active-lang';

// Browser language can look like 'fr-FR'; normalize to the bare
// primary tag so 'fr-FR' and 'fr-CA' both match a 'fr' language row.
function normalizeBrowserLang() {
  const raw =
    (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages && navigator.languages[0]))) || '';
  return raw.split('-')[0].toLowerCase();
}

function readStoredActive() {
  try {
    return localStorage.getItem(ACTIVE_LANG_KEY) || '';
  } catch {
    return '';
  }
}

export function LanguageProvider({ children }) {
  const [languages, setLanguages] = useState([]);
  const [activeCode, setActiveCodeState] = useState(() => readStoredActive());

  const reload = useCallback(() => {
    listLanguages()
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const onUpdated = () => reload();
    window.addEventListener('language:updated', onUpdated);
    return () => window.removeEventListener('language:updated', onUpdated);
  }, [reload]);

  // Pick an active language once the list arrives. Priority:
  //   1. previous user choice (localStorage)
  //   2. browser language, if a row matches its primary tag
  //   3. server-side default flag
  //   4. first language in the list
  useEffect(() => {
    if (!languages || languages.length === 0) return;
    const has = (c) => c && languages.some((l) => l.code === c);
    if (has(activeCode)) return;
    const browser = normalizeBrowserLang();
    const fallback =
      (has(browser) && browser) ||
      languages.find((l) => l.is_default)?.code ||
      languages[0]?.code ||
      '';
    if (fallback && fallback !== activeCode) {
      setActiveCodeState(fallback);
    }
  }, [languages, activeCode]);

  const setActiveCode = useCallback((code) => {
    setActiveCodeState(code);
    try {
      if (code) localStorage.setItem(ACTIVE_LANG_KEY, code);
      else localStorage.removeItem(ACTIVE_LANG_KEY);
    } catch { /* ignore */ }
  }, []);

  const activeLang = useMemo(
    () => languages.find((l) => l.code === activeCode) || null,
    [languages, activeCode],
  );
  const defaultLang = useMemo(
    () => languages.find((l) => l.is_default) || null,
    [languages],
  );

  // FIX509 resolution order: active → default → key literal.
  // The key itself is the default label by convention — no need to
  // hand-populate the default language with `'Showcase'` -> `'Showcase'`.
  //
  // Two call shapes:
  //   t('Send')                         -> 'Send' (or its translation)
  //   t('Welcome {user}', { user })     -> '{user}' replaced after lookup
  //   t('Send', 'override-fallback')    -> string fallback when no
  //                                        translation exists (rare)
  const t = useCallback((key, varsOrFallback) => {
    const isVars =
      varsOrFallback !== null
      && typeof varsOrFallback === 'object';
    const vars = isVars ? varsOrFallback : null;
    const fallback = !isVars ? varsOrFallback : undefined;

    const a = activeLang?.labels?.[key];
    const d = defaultLang?.labels?.[key];
    let out = a || d || (typeof fallback === 'string' ? fallback : key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        out = out.split(`{${name}}`).join(value == null ? '' : String(value));
      }
    }
    return out;
  }, [activeLang, defaultLang]);

  const value = useMemo(() => ({
    languages,
    activeCode: activeLang?.code || '',
    setActiveCode,
    t,
    reload,
  }), [languages, activeLang, setActiveCode, t, reload]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Outside provider: degrade gracefully — return the key itself
    // (= the default label by convention) with optional {placeholder}
    // substitution still applied so callers don't crash.
    return (key, varsOrFallback) => {
      const isVars =
        varsOrFallback !== null
        && typeof varsOrFallback === 'object';
      const vars = isVars ? varsOrFallback : null;
      const fallback = !isVars ? varsOrFallback : undefined;
      let out = typeof fallback === 'string' ? fallback : key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          out = out.split(`{${name}}`).join(value == null ? '' : String(value));
        }
      }
      return out;
    };
  }
  return ctx.t;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

// Helper for callers (admin UI) that want to broadcast a refresh
// after they POST/PATCH/DELETE a language.
export function notifyLanguageUpdated() {
  window.dispatchEvent(new CustomEvent('language:updated'));
}
