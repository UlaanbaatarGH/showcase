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

function AddRow({ placeholder, onAdd, disabled, multiline }) {
  const [text, setText] = useState('');
  const submit = async () => {
    const v = multiline ? text : text.trim();
    if (!v.trim()) return;
    const rest = await onAdd(v);
    // multiline: onAdd returns the lines that failed (kept for retry)
    if (multiline) setText(rest || '');
    else if (rest) setText('');
  };
  const lines = text.split('\n').length;
  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="shared-add">
      <Field
        type={multiline ? undefined : 'text'}
        rows={multiline ? Math.min(Math.max(lines, 1), 8) : undefined}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        title={multiline ? 'One value per line — Ctrl+Enter or + adds them all' : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (!multiline || e.ctrlKey || e.metaKey) { e.preventDefault(); submit(); }
        }}
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
  // FIX415.1 bulk add: the value box takes a multi-line text; each
  // non-empty line becomes one value. Duplicates (within the text or
  // vs. existing values, case-insensitive) are skipped; lines the
  // backend rejects stay in the box. Returns the remaining text.
  const addValues = async (text) => {
    const pid = selected.id;
    const seen = new Set(selected.values.map((v) => v.value.toLowerCase()));
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      const v = raw.trim();
      const k = v.toLowerCase();
      if (!v || seen.has(k)) continue;
      seen.add(k);
      lines.push(v);
    }
    setError(null);
    const failed = [];
    let firstErr = null;
    for (const v of lines) {
      try {
        const res = await createSharedValue(pid, v);
        setItems(res.items);
      } catch (e) {
        failed.push(v);
        firstErr ??= e.message || String(e);
      }
    }
    if (failed.length) setError(`${failed.length} value(s) not added: ${firstErr}`);
    return failed.join('\n');
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
            {/* FIX415.2.1 <list-shared-property>: shared properties. */}
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
                placeholder="New value(s), one per line"
                disabled={!selected}
                multiline
                onAdd={addValues}
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
