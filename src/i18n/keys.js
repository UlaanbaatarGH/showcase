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
export const I18N_KEYS = [
  {
    key: 'Showcase',
    description: 'Big centred title on the home page (FIX400.2.11)',
  },

  // FIX420.2 <panel-contact-admin>
  { key: 'Contact', description: 'Contact panel header + Contact button title' },
  { key: 'Close',   description: 'Close link in modal headers' },
  { key: 'Subject', description: 'FIX420.2.1 contact form subject field label' },
  { key: 'Message', description: 'FIX420.2.3 contact form message field label' },
  { key: 'Email addr for reply', description: 'FIX420.2.4 reply-address field label' },
  { key: 'Cancel',  description: 'FIX420.2.10 / generic cancel button' },
  { key: 'Send',    description: 'FIX420.2.11 contact send button' },
  { key: 'Subject is required.', description: 'FIX420.3.1.1 validation' },
  { key: 'Message is required.', description: 'FIX420.3.1.1 validation' },
  { key: 'Email is not valid.',  description: 'FIX420.3.1.2 validation' },
  {
    key: 'Message sent. Thanks — we will reply to {email}.',
    description: 'FIX420 contact send confirmation',
  },
];

export const I18N_KEY_INDEX = Object.fromEntries(
  I18N_KEYS.map((k) => [k.key, k]),
);
