import { Fragment, useMemo, useState } from 'react';
import {
  createLanguage,
  updateLanguage,
  deleteLanguage,
} from './data/backend.js';
import { useLanguage, notifyLanguageUpdated } from './i18n/i18n.jsx';
import { I18N_KEYS } from './i18n/keys.js';
import { IconAdd, IconDelete } from './Icons.jsx';

// FIX509 <panel-language-setup>: admin UI for the i18n storage.
// Two subtabs:
//   1. 'Languages' — list of (code, name, active). EN is the
//      implicit fallback (the keys are English by convention) and
//      isn't shown. Add at top-right, delete per-row, no Default.
//   2. 'Translated Labels' — two-column editor (label, active
//      language name) grouped by section, sorted alphabetically
//      within. Each cell autosaves on blur — no Save / Discard
//      buttons.
// Both subtabs reserve the same min-height so switching tabs
// doesn't make the popup jump.
export default function LanguageSetupPanel() {
  const { languages, activeCode, setActiveCode, reload } = useLanguage();
  const [tab, setTab] = useState('languages');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const visibleLanguages = useMemo(
    () => languages.filter((l) => l.code.toLowerCase() !== 'en'),
    [languages],
  );
  const activeLang = useMemo(
    () => languages.find((l) => l.code === activeCode) || null,
    [languages, activeCode],
  );

  // Keys grouped by section, alphabetised inside each. Sections
  // appear in first-seen order from the registry array so the
  // admin gets a stable layout.
  const groupedKeys = useMemo(() => {
    const sections = new Map();
    for (const entry of I18N_KEYS) {
      const sec = entry.section || '(other)';
      if (!sections.has(sec)) sections.set(sec, []);
      sections.get(sec).push(entry);
    }
    for (const [, list] of sections) {
      list.sort((a, b) => a.key.localeCompare(b.key));
    }
    return [...sections.entries()];
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const onMakeActive = (code) => setActiveCode(code);

  const onDelete = async (lang) => {
    if (!lang) return;
    const ok = window.confirm(
      `Delete language "${lang.name}" (${lang.code})? Translations will be lost.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLanguage(lang.code);
      if (activeCode === lang.code) setActiveCode('');
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const code = newCode.trim();
      const name = newName.trim();
      if (!code || !name) {
        setError('Code and name are required.');
        setBusy(false);
        return;
      }
      await createLanguage({ code, name });
      setNewCode('');
      setNewName('');
      setAddOpen(false);
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Section-scoped storage: labels JSONB looks like
  //   { '420. Contact panel': { 'Cancel': 'Annuler', … }, … }
  // so the same English text can carry a different translation in
  // different FIX sections.
  const saveLabel = async (code, section, key, value) => {
    console.log('[saveLabel] enter', { code, section, key, value });
    const lang = languages.find((l) => l.code === code);
    if (!lang) {
      console.log('[saveLabel] no language found for code', code, 'languages=', languages);
      return;
    }
    const cleaned = String(value || '').trim();
    const stored = (lang.labels || {})[section]?.[key] || '';
    console.log('[saveLabel] cleaned=', cleaned, 'stored=', stored, 'lang.labels=', lang.labels);
    if (cleaned === stored) {
      console.log('[saveLabel] no change, skipping');
      return;
    }
    setError(null);
    try {
      const merged = { ...(lang.labels || {}) };
      const sectionLabels = { ...(merged[section] || {}) };
      if (cleaned === '') delete sectionLabels[key];
      else sectionLabels[key] = cleaned;
      // Drop the section entirely when it ends up empty — keeps the
      // JSONB compact and avoids stale section keys forever.
      if (Object.keys(sectionLabels).length === 0) {
        delete merged[section];
      } else {
        merged[section] = sectionLabels;
      }
      console.log('[saveLabel] sending merged=', merged);
      const t0 = performance.now();
      const resp = await updateLanguage(code, { labels: merged });
      const dt = (performance.now() - t0).toFixed(0);
      console.log(`[saveLabel] PATCH ok in ${dt}ms, response=`, resp);
      notifyLanguageUpdated();
      reload();
      console.log('[saveLabel] reload triggered');
    } catch (e) {
      console.error('[saveLabel] ERROR', e);
      setError(e.message || String(e));
    }
  };

  return (
    <section
      className="setup-section panel-language-setup"
      data-yagu-id="panel-language-setup"
    >
      {/* No 'Languages' h3 — we're already inside the parent
          'Language' tab, so a second title would be redundant. */}
      <div className="lang-setup-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'languages'}
          className={tab === 'languages' ? 'is-active' : ''}
          onClick={() => setTab('languages')}
        >
          Languages
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'labels'}
          className={tab === 'labels' ? 'is-active' : ''}
          onClick={() => setTab('labels')}
        >
          Translated Labels
        </button>
      </div>
      {error && <div className="setup-error">{error}</div>}

      {/* Both subtab panels share the same min-height so switching
          tabs never resizes the parent Setup popup. */}
      <div className="lang-setup-tabpanel">
        {tab === 'languages' && (
          <div className="lang-setup-list" data-yagu-id="list-languages">
            {/* Toolbar above the table — Add button sits on the
                right, in the same column as the per-row delete. */}
            <div className="lang-setup-toolbar">
              <span className="lang-setup-toolbar-spacer" />
              {addOpen ? null : (
                <button
                  type="button"
                  className="users-add"
                  onClick={() => setAddOpen(true)}
                  disabled={busy}
                  aria-label="Add language"
                  title="Add language"
                >
                  <IconAdd size={20} />
                </button>
              )}
            </div>
            {addOpen && (
              <form className="lang-setup-add" onSubmit={onAdd}>
                <input
                  type="text"
                  placeholder="Code (fr, de, …)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  autoFocus
                  style={{ width: '6rem' }}
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-primary" disabled={busy}>
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddOpen(false); setNewCode(''); setNewName(''); }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </form>
            )}
            <table className="setup-items lang-setup-table">
              <thead>
                <tr>
                  <th style={{ width: '6rem' }}>Code</th>
                  <th>Name</th>
                  <th style={{ width: '4rem', textAlign: 'center' }}>Active</th>
                  <th style={{ width: '3rem' }} />
                </tr>
              </thead>
              <tbody>
                {visibleLanguages.length === 0 && (
                  <tr>
                    <td colSpan={4} className="setup-empty">
                      No language defined yet — add one to start translating.
                    </td>
                  </tr>
                )}
                {visibleLanguages.map((l) => (
                  <tr key={l.code}>
                    <td>{l.code}</td>
                    <td>{l.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="radio"
                        name="lang-active"
                        checked={l.code === activeCode}
                        onChange={() => onMakeActive(l.code)}
                        title={
                          l.code === activeCode
                            ? 'Currently active'
                            : 'Use this language now'
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="users-remove"
                        onClick={() => onDelete(l)}
                        disabled={busy}
                        aria-label="Delete language"
                        title="Delete language"
                      >
                        <IconDelete size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'labels' && (
          <div className="lang-setup-labels">
            {!activeLang ? (
              <div className="setup-empty">
                Pick an active language on the Languages tab first.
              </div>
            ) : (
              <table className="setup-items lang-setup-table lang-setup-labels-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Label</th>
                    <th>{activeLang.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedKeys.length === 0 && (
                    <tr>
                      <td colSpan={2} className="setup-empty">
                        No translatable key declared yet.
                      </td>
                    </tr>
                  )}
                  {groupedKeys.map(([section, entries]) => (
                    <Fragment key={section}>
                      <tr className="lang-setup-section-row">
                        <td colSpan={2}>{section}</td>
                      </tr>
                      {entries.map((entry) => (
                        <LabelRow
                          key={entry.key}
                          section={section}
                          entryKey={entry.key}
                          activeCode={activeLang.code}
                          storedValue={
                            activeLang.labels?.[section]?.[entry.key] || ''
                          }
                          onSave={saveLabel}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LabelRow({ section, entryKey, activeCode, storedValue, onSave }) {
  const [draft, setDraft] = useState(storedValue);
  const [bound, setBound] = useState(`${activeCode}|${section}|${entryKey}`);
  // Re-sync the draft when the active language, section or key
  // changes so we never carry stale text into a different cell.
  const expected = `${activeCode}|${section}|${entryKey}`;
  if (bound !== expected) {
    setBound(expected);
    setDraft(storedValue);
  }
  return (
    <tr>
      <td className="lang-setup-key-cell">
        <code>{entryKey}</code>
      </td>
      <td>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            console.log('[LabelRow] blur', { section, entryKey, activeCode, draft, storedValue });
            onSave(activeCode, section, entryKey, draft);
          }}
          placeholder={entryKey}
        />
      </td>
    </tr>
  );
}
