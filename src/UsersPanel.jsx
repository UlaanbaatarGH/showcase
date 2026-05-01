import { useCallback, useEffect, useState } from 'react';
import { listUsers, createUser, deleteUser } from './data/backend.js';

// FIX311 <panel-users>: admin user management. Lists every app_user
// row with their flags + project access summary. Lets the admin add
// new users (FIX311.3.1) and remove them (FIX311.3.2). One row is
// always selected (FIX311.5.1).
export default function UsersPanel({ onClose }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listUsers()
      .then((d) => { setUsers(d); setError(null); })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // FIX311.5.1: pin a selected row at all times. Default to the first;
  // jump to first when the current selection disappears.
  useEffect(() => {
    if (!users || users.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (
      users.some((u) => u.id === prev) ? prev : users[0].id
    ));
  }, [users]);

  const onAdd = async ({ name, email }) => {
    setBusy(true);
    try {
      const created = await createUser({ name, email });
      setUsers((prev) => (prev ? [...prev, created] : [created]));
      setSelectedId(created.id);
      setAddOpen(false);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!selectedId) return;
    const target = users?.find((u) => u.id === selectedId);
    if (!target) return;
    // FIX311.3.2: confirm before removing.
    const ok = window.confirm(`Remove user "${target.name}"?`);
    if (!ok) return;
    setBusy(true);
    try {
      await deleteUser(selectedId);
      setUsers((prev) => (prev ? prev.filter((u) => u.id !== selectedId) : prev));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal users-panel"
        data-yagu-id="panel-users"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Users</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="users-toolbar">
          {/* FIX311.2.1 / <admin-add-user>: green '+' icon. */}
          <button
            type="button"
            className="users-add"
            data-yagu-id="admin-add-user"
            onClick={() => setAddOpen(true)}
            disabled={busy}
            aria-label="Add user"
            title="Add user"
          >
            +
          </button>
          {/* FIX311.2.2 / <admin-remove-user>: red 'x' icon. */}
          <button
            type="button"
            className="users-remove"
            data-yagu-id="admin-remove-user"
            onClick={onRemove}
            disabled={busy || !selectedId}
            aria-label="Remove user"
            title="Remove user"
          >
            ×
          </button>
        </div>
        {error && <div className="visits-err">{error}</div>}
        {users === null && <div className="visits-loading">Loading…</div>}
        {users && users.length === 0 && (
          <div className="visits-empty">No user yet.</div>
        )}
        {users && users.length > 0 && (
          <table className="visits-table users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Password</th>
                <th>Access code</th>
                <th>Admin</th>
                <th>Projects</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={u.id === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(u.id)}
                >
                  <td>{u.name}</td>
                  <td>{u.email || ''}</td>
                  <td className="users-check">
                    {/* FIX311.2.1.3 <user-has-password>: read-only. */}
                    <input
                      type="checkbox"
                      data-yagu-id="user-has-password"
                      checked={!!u.has_password}
                      readOnly
                      tabIndex={-1}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {/* FIX311.2.1.4 <user-access-code>: read-only 6 digits. */}
                  <td data-yagu-id="user-access-code" className="users-code">
                    {u.access_code || ''}
                  </td>
                  <td className="users-check">
                    {/* FIX311.2.1.5 <user-is-admin>: hardcoded; read-only. */}
                    <input
                      type="checkbox"
                      data-yagu-id="user-is-admin"
                      checked={!!u.is_admin}
                      readOnly
                      tabIndex={-1}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {/* FIX311.2.1.6 <user-projects>: comma-separated. */}
                  <td data-yagu-id="user-projects">
                    {(u.projects || []).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {addOpen && (
          <AddUserDialog
            busy={busy}
            existingNames={new Set((users || []).map((u) => u.name.toLowerCase()))}
            existingEmails={new Set((users || []).map((u) => (u.email || '').toLowerCase()).filter(Boolean))}
            onCancel={() => setAddOpen(false)}
            onSubmit={onAdd}
          />
        )}
      </div>
    </div>
  );
}

// FIX311.3.1: prompt for Name + Email, with Ok/Cancel. Client-side
// duplicate check (FIX311.3.1.1.1) feeds back into the dialog before
// the network round-trip; the backend re-checks on insert.
function AddUserDialog({ busy, existingNames, existingEmails, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    const m = email.trim();
    if (!n) { setErr('Name is required.'); return; }
    if (!m) { setErr('Email is required.'); return; }
    if (existingNames.has(n.toLowerCase())) {
      setErr('Name already in use.');
      return;
    }
    if (existingEmails.has(m.toLowerCase())) {
      setErr('Email already in use.');
      return;
    }
    setErr(null);
    onSubmit({ name: n, email: m });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal users-add-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="visits-header">
          <h2>Add user</h2>
        </header>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {err && <div className="visits-err">{err}</div>}
        <div className="users-add-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '…' : 'Ok'}
          </button>
        </div>
      </form>
    </div>
  );
}
