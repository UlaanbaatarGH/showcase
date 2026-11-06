import { useEffect, useState } from 'react';
import {
  listSharedData,
  createSharedProperty,
  renameSharedProperty,
  deleteSharedProperty,
  createSharedValue,
  updateSharedValue,
  deleteSharedValue,
} from './data/backend.js';
import { IconAdd, IconDelete } from './Icons.jsx';

// FIX415 <panel-shared-data>: admin-defined global properties, each
// with a list of values. Left: properties; right: values of the
// selected property. Rows edit inline and save on blur / Enter
// (Escape reverts), like <panel-language-setup>.
// FIX415.1: names unique, values unique within a property
// (case-insensitive) — the backend rejects duplicates with 409 and
// the row reverts, showing the error.

function EditableRow({ text, selected, onSelect, onSave, onDelete, deleteTitle }) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === text) { setDraft(text); return; }
    const ok = await onSave(next);
    if (!ok) setDraft(text);
  };

  return (
    <li
      className={`shared-row${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <input
        type="text"
        value={draft}
        onFocus={onSelect}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setDraft(text); e.currentTarget.blur(); }
        }}
      />
      <button
        type="button"
        className="shared-icon-btn"
        title={deleteTitle}
        aria-label={deleteTitle}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <IconDelete size={14} />
      </button>
    </li>
  );
}

function AddRow({ placeholder, onAdd, disabled }) {
  const [text, setText] = useState('');
  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    if (await onAdd(v)) setText('');
  };
  return (
    <div className="shared-add">
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button
        type="button"
        className="shared-icon-btn"
        title="Add"
        aria-label="Add"
        disabled={disabled || !text.trim()}
        onClick={submit}
      >
        <IconAdd size={16} />
      </button>
    </div>
  );
}

export default function SharedDataPanel({ onClose }) {
  const [items, setItems] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listSharedData()
      .then((list) => {
        setItems(list);
        if (list.length) setSelectedId(list[0].id);
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  // Runs a write; on success swaps in the refreshed list. Returns
  // true/false so rows can revert their draft on failure.
  const run = async (fn) => {
    setError(null);
    try {
      const res = await fn();
      setItems(res.items);
      return res;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    }
  };

  const selected = items?.find((p) => p.id === selectedId) || null;

  const addProperty = async (name) => {
    const res = await run(() => createSharedProperty(name));
    if (res) setSelectedId(res.id);
    return !!res;
  };
  const removeProperty = async (p) => {
    const n = p.values.length;
    const ok = window.confirm(
      `Delete property "${p.name}"${n ? ` and its ${n} value${n > 1 ? 's' : ''}` : ''}?`,
    );
    if (!ok) return;
    const res = await run(() => deleteSharedProperty(p.id));
    if (res && selectedId === p.id) setSelectedId(res.items[0]?.id ?? null);
  };
  const removeValue = async (v) => {
    if (!window.confirm(`Delete value "${v.value}"?`)) return;
    await run(() => deleteSharedValue(v.id));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal shared-panel"
        data-yagu-id="panel-shared-data"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Shared data</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {error && <div className="visits-err">{error}</div>}
        {items === null && !error && <div className="visits-loading">Loading…</div>}
        {items !== null && (
          <div className="shared-body">
            <section className="shared-col">
              <h3>Properties</h3>
              <AddRow placeholder="New property" onAdd={addProperty} />
              {items.length === 0 && <div className="visits-empty">No properties yet.</div>}
              <ul className="shared-list">
                {items.map((p) => (
                  <EditableRow
                    key={p.id}
                    text={p.name}
                    selected={p.id === selectedId}
                    onSelect={() => setSelectedId(p.id)}
                    onSave={async (name) => !!(await run(() => renameSharedProperty(p.id, name)))}
                    onDelete={() => removeProperty(p)}
                    deleteTitle="Delete property"
                  />
                ))}
              </ul>
            </section>
            <section className="shared-col">
              <h3>{selected ? `Values of ${selected.name}` : 'Values'}</h3>
              <AddRow
                placeholder="New value"
                disabled={!selected}
                onAdd={async (value) => !!(await run(() => createSharedValue(selected.id, value)))}
              />
              {selected && selected.values.length === 0 && (
                <div className="visits-empty">No values yet.</div>
              )}
              <ul className="shared-list">
                {(selected?.values || []).map((v) => (
                  <EditableRow
                    key={v.id}
                    text={v.value}
                    onSave={async (value) => !!(await run(() => updateSharedValue(v.id, value)))}
                    onDelete={() => removeValue(v)}
                    deleteTitle="Delete value"
                  />
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
