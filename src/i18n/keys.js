// FIX509: registry of i18n keys used in the app.
//
// Convention (mirrors the spec):
//   - The KEY is also the default English label.
//     `t('Cancel')` returns 'Cancel' until a language overrides it.
//   - Each key is scoped to a section. The section name follows the
//     'n. title' convention picked from the parent FIX entry, e.g.
//     'FIX420 Contact panel' → section '420. Contact panel'.
//   - Keys are unique *within their section*. Two `{Cancel}` in
//     different FIX sections are two separate registry entries
//     (and two separate translation cells in the language panel).
//   - Keys read like displayed phrases (sentence case, spaces).
//     This is also how they appear in the spec inside `{}`:
//       `{Subject}`, `{Send}`, `{Email addr for reply}`.
//     Runtime data placeholders (e.g. `{user}`, `{selected-item1}`)
//     are visually distinct because they're kebab-case identifiers.
//
// Add a new key here whenever you wire `t('...')` somewhere — the
// Language setup panel reads this list to surface the keys to the
// admin.
export const I18N_KEYS = [
  // FIX420 Contact panel
  { key: 'Cancel',                    section: '420. Contact panel' },
  { key: 'Contact',                   section: '420. Contact panel' },
  { key: 'Email addr for reply',      section: '420. Contact panel' },
  { key: 'Email is not valid.',       section: '420. Contact panel' },
  { key: 'Message',                   section: '420. Contact panel' },
  { key: 'Message is required.',      section: '420. Contact panel' },
  { key: 'Message sent. Thanks — we will reply to {email}.', section: '420. Contact panel' },
  { key: 'Send',                      section: '420. Contact panel' },
  { key: 'Subject',                   section: '420. Contact panel' },
  { key: 'Subject is required.',      section: '420. Contact panel' },
];
