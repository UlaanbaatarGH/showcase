import { useMemo, useState } from 'react';
import {
  createLanguage,
  updateLanguage,
  deleteLanguage,
} from './data/backend.js';
import { useLanguage, notifyLanguageUpdated } from './i18n/i18n.jsx';
import { I18N_KEYS } from './i18n/keys.js';
import { IconAdd, IconDelete } from './Icons.jsx';

// FIX509 <panel-language-setup>: admin UI for the i18n storage.
//
// Two subtabs:
//   1. 'Languages' — list of (code, name, active). EN is the
//      implicit baseline (the keys themselves are English by the
//      FIX509 convention) and is hidden from the list. Add / delete
//      from this tab.
//   2. 'Translated Labels' — two-column editor (label, {language-name})
//      for the currently active language. Auto-saves each cell on
//      blur — no Save / Discard buttons.
export default function LanguageSetupPanel() {
  const { languages, activeCode, setActiveCode, reload } = useLanguage();
  const [tab, setTab] = useState('languages');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // EN is the implicit fallback ("default is EN when the expected
  // lang is not found"); the admin doesn't manage it as a row.
  const visibleLanguages = useMemo(
    () => languages.filter((l) => l.code.toLowerCase() !== 'en'),
    [languages],
  );
  const activeLang = useMemo(
    () => languages.find((l) => l.code === activeCode) || null,
    [languages, activeCode],
  );

  // Inline 'add language' form state.
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const onMakeActive = (code) => {
    setActiveCode(code);
  };

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
      const created = await createLanguage({ code, name });
      setNewCode('');
      setNewName('');
      setAddOpen(false);
      // New language doesn't become active automatically — admin
      // chooses when to switch.
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Per-cell autosave on the Translated Labels tab. We PATCH the
  // whole labels object each time but only send the merged payload
  // — the panel never holds a "dirty draft" pile of edits.
  const saveLabel = async (code, key, value) => {
    const lang = languages.find((l) => l.code === code);
    if (!lang) return;
    const cleaned = String(value || '').trim();
    const stored = (lang.labels || {})[key] || '';
    if (cleaned === stored) return; // no change
    setError(null);
    try {
      const merged = { ...(lang.labels || {}) };
      if (cleaned === '') delete merged[key];
      else merged[key] = cleaned;
      await updateLanguage(code, { labels: merged });
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  return (
    <section
      className="setup-section panel-language-setup"
      data-yagu-id="panel-language-setup"
    >
      <h3>Languages</h3>
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

      {tab === 'languages' && (
        <div className="lang-setup-list" data-yagu-id="list-languages">
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
                    No language defined yet — add one below to start translating.
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
          {addOpen ? (
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
          ) : (
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
                {I18N_KEYS.length === 0 && (
                  <tr>
                    <td colSpan={2} className="setup-empty">
                      No translatable key declared yet.
                    </td>
                  </tr>
                )}
                {I18N_KEYS.map((entry) => (
                  <LabelRow
                    key={entry.key}
                    entryKey={entry.key}
                    activeCode={activeLang.code}
                    storedValue={activeLang.labels?.[entry.key] || ''}
                    onSave={saveLabel}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

// One row of the Translated Labels editor. Holds a local draft so
// the cell stays editable while the parent reload() refreshes the
// full language list. Saves on blur via the parent's onSave.
function LabelRow({ entryKey, activeCode, storedValue, onSave }) {
  const [draft, setDraft] = useState(storedValue);
  // Re-sync the draft when the active language changes (so we don't
  // carry over the previous language's draft).
  const [bound, setBound] = useState(activeCode);
  if (bound !== activeCode) {
    setBound(activeCode);
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
          onBlur={() => onSave(activeCode, entryKey, draft)}
          placeholder={entryKey}
        />
      </td>
    </tr>
  );
}
