// FIX509: registry of i18n keys used in the app.
//
// Each entry declares one translatable label:
//   key:         the lookup string (also what shows up as `{key}` in the
//                spec — see FIX509 conventions)
//   default:     the English fallback rendered when no language has the key
//   description: optional, helps the admin understand context in
//                <panel-language-setup>
//
// Add a new key here whenever you wire `t('xxx')` somewhere in the UI
// — the Language setup panel reads this list to know what to surface.
export const I18N_KEYS = [
  {
    key: 'app.title',
    default: 'Showcase',
    description: 'Big centred title on the home page (FIX400.2.11)',
  },
];

export const I18N_KEY_INDEX = Object.fromEntries(
  I18N_KEYS.map((k) => [k.key, k]),
);
