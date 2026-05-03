// FIX509: registry of i18n keys used in the app.
//
// Convention (mirrors the spec):
//   - The KEY is also the default English label.
//     `t('Showcase')` returns 'Showcase' until a language overrides it.
//   - Keys read like displayed phrases (sentence case, spaces).
//     This is also how they're written in the spec inside `{}`:
//       `{Subject}`, `{Send}`, `{Email addr for reply}`.
//     Runtime data placeholders (e.g. `{user}`, `{selected-item1}`)
//     are visually distinct because they're kebab-case identifiers.
//
// Each entry just declares one translatable key:
//   key:         the lookup string AND the default label
//   description: optional, helps the admin understand context in
//                <panel-language-setup>
//
// Add a new key here whenever you wire `t('...')` somewhere — the
// Language setup panel reads this list to surface the keys to the
// admin. (Keys not listed here still work at runtime — they just
// won't show up as a row in the panel until added.)
// `section` groups the key in the Translated Labels editor so the
// admin sees related labels together. Within each section the panel
// sorts keys alphabetically.
export const I18N_KEYS = [
  // Contact panel (FIX420.2)
  { key: 'Cancel',                    section: 'Contact panel' },
  { key: 'Contact',                   section: 'Contact panel' },
  { key: 'Email addr for reply',      section: 'Contact panel' },
  { key: 'Email is not valid.',       section: 'Contact panel' },
  { key: 'Message',                   section: 'Contact panel' },
  { key: 'Message is required.',      section: 'Contact panel' },
  { key: 'Message sent. Thanks — we will reply to {email}.', section: 'Contact panel' },
  // FIX420.2.11: scoped key — won't collide with a future generic 'Send'.
  { key: 'Msg-send',                  section: 'Contact panel' },
  { key: 'Subject',                   section: 'Contact panel' },
  { key: 'Subject is required.',      section: 'Contact panel' },
];

export const I18N_KEY_INDEX = Object.fromEntries(
  I18N_KEYS.map((k) => [k.key, k]),
);
