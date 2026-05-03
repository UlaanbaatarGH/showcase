import { useState } from 'react';
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
// Layout:
//   - left column: list of languages with a 'default' radio + delete
//   - bottom of left: 'Add language' inline form
//   - right column: per-key value editor for the selected language,
//     sourced from src/i18n/keys.js so the admin only fills in keys
//     the app actually uses
export default function LanguageSetupPanel() {
  const { languages, activeCode, setActiveCode, reload } = useLanguage();
  const [selectedCode, setSelectedCode] = useState(
    () => activeCode || languages[0]?.code || '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Inline 'add language' form state.
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  // Pending edits to the selected language's labels — flushed on
  // 'Save labels' so we don't fire a PATCH per keystroke.
  const [draftLabels, setDraftLabels] = useState({});

  const selected = languages.find((l) => l.code === selectedCode) || null;

  const startEditingValue = (key, currentValue) => {
    setDraftLabels((prev) => (
      prev[key] !== undefined ? prev : { ...prev, [key]: currentValue || '' }
    ));
  };
  const setDraftValue = (key, value) => {
    setDraftLabels((prev) => ({ ...prev, [key]: value }));
  };

  const onSelectLanguage = (code) => {
    setSelectedCode(code);
    setDraftLabels({});
    setError(null);
  };

  const onSaveLabels = async () => {
    if (!selected) return;
    if (Object.keys(draftLabels).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const merged = { ...(selected.labels || {}) };
      for (const [k, v] of Object.entries(draftLabels)) {
        if (v == null || v === '') {
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      await updateLanguage(selected.code, { labels: merged });
      setDraftLabels({});
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onMakeDefault = async (code) => {
    setBusy(true);
    setError(null);
    try {
      await updateLanguage(code, { is_default: true });
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (lang) => {
    if (!lang || lang.is_default) return;
    const ok = window.confirm(
      `Delete language "${lang.name}" (${lang.code})? Translations will be lost.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLanguage(lang.code);
      // If we were viewing the deleted one, hop to the next available.
      if (selectedCode === lang.code) {
        const next = languages.find((l) => l.code !== lang.code);
        setSelectedCode(next?.code || '');
        setDraftLabels({});
      }
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
      setSelectedCode(created.code);
      setDraftLabels({});
      notifyLanguageUpdated();
      reload();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="setup-section panel-language-setup"
      data-yagu-id="panel-language-setup"
    >
      <h3>Languages</h3>
      <p className="setup-hint">
        Translate labels the app exposes via the FIX509 i18n keys
        (declared in <code>src/i18n/keys.js</code>). The key itself is
        the default English label — leave a translation blank to fall
        back to the key (or to the default language when set on
        another language).
      </p>
      {error && <div className="setup-error">{error}</div>}
      <div className="lang-setup-grid">
        <div className="lang-setup-list" data-yagu-id="list-languages">
          <table className="setup-items">
            <thead>
              <tr>
                <th style={{ width: '4rem' }}>Code</th>
                <th>Name</th>
                <th style={{ width: '4rem', textAlign: 'center' }}>Default</th>
                <th style={{ width: '4rem' }}>Active</th>
                <th style={{ width: '3rem' }} />
              </tr>
            </thead>
            <tbody>
              {languages.length === 0 && (
                <tr>
                  <td colSpan={5} className="setup-empty">
                    No language defined yet.
                  </td>
                </tr>
              )}
              {languages.map((l) => (
                <tr
                  key={l.code}
                  className={l.code === selectedCode ? 'selected' : ''}
                  onClick={() => onSelectLanguage(l.code)}
                >
                  <td>{l.code}</td>
                  <td>{l.name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="lang-default"
                      checked={l.is_default}
                      onChange={() => onMakeDefault(l.code)}
                      disabled={busy || l.is_default}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCode(l.code);
                      }}
                      disabled={l.code === activeCode}
                      title={
                        l.code === activeCode
                          ? 'Currently active'
                          : 'Use this language now'
                      }
                    >
                      {l.code === activeCode ? '●' : '○'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="users-remove"
                      onClick={(e) => { e.stopPropagation(); onDelete(l); }}
                      disabled={busy || l.is_default}
                      aria-label="Delete language"
                      title={
                        l.is_default
                          ? 'Cannot delete the default language'
                          : 'Delete language'
                      }
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
              <IconAdd size={18} />
            </button>
          )}
        </div>

        <div className="lang-setup-keys">
          {!selected && (
            <div className="setup-empty">Select a language to edit its labels.</div>
          )}
          {selected && (
            <>
              <h4>Labels for {selected.name}</h4>
              <table className="setup-items">
                <thead>
                  <tr>
                    <th style={{ width: '14rem' }}>Key</th>
                    <th>Translation</th>
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
                  {I18N_KEYS.map((entry) => {
                    const stored = selected.labels?.[entry.key] || '';
                    const draft =
                      draftLabels[entry.key] !== undefined
                        ? draftLabels[entry.key]
                        : stored;
                    return (
                      <tr key={entry.key}>
                        <td>
                          <code>{entry.key}</code>
                          {entry.description && (
                            <div className="setup-hint">{entry.description}</div>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={draft}
                            onFocus={() => startEditingValue(entry.key, stored)}
                            onChange={(e) =>
                              setDraftValue(entry.key, e.target.value)
                            }
                            placeholder={entry.key}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="lang-setup-actions">
                <button
                  type="button"
                  onClick={() => setDraftLabels({})}
                  disabled={busy || Object.keys(draftLabels).length === 0}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onSaveLabels}
                  disabled={busy || Object.keys(draftLabels).length === 0}
                >
                  {busy ? 'Saving…' : 'Save labels'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
