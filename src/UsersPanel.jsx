import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listAdminProjects,
  grantUserProject,
  revokeUserProject,
} from './data/backend.js';
import { useAuth } from './AuthContext.jsx';

// FIX311 <panel-users>: admin user management. Lists every app_user
// row with their flags + project access summary. Lets the admin add
// new users (FIX311.3.1) and remove them (FIX311.3.2). One row is
// always selected (FIX311.5.1).
export default function UsersPanel({ onClose }) {
  const { profile } = useAuth();
  // FIX311.5.2 / .3 / .4 / .5: every editing affordance is gated on
  // the caller being admin. The backend already enforces this; the
  // UI just hides the controls so non-admins (theoretically — they
  // can't open the panel today) see a read-only list.
  const isAdmin = profile?.profile === 'admin';
  // FIX311.5.6: <user-projects> is editable by admins AND project
  // managers (the latter only for projects they themselves manage).
  const managedProjectIds = useMemo(
    () => new Set(profile?.managed_project_ids || []),
    [profile?.managed_project_ids],
  );
  const [users, setUsers] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Per-user inline edit drafts: { [userId]: { name?, email? } }.
  const [drafts, setDrafts] = useState({});

  const reload = useCallback(() => {
    Promise.all([listUsers(), listAdminProjects().catch(() => [])])
      .then(([u, p]) => { setUsers(u); setProjects(p || []); setError(null); })
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

  // FIX311.5.4 / .5.5: inline name/email edits. Save on blur or
  // Enter — backend re-checks uniqueness and emptiness. We pre-empt
  // the most common errors locally so the user gets feedback without
  // a network round-trip.
  const draftFor = (id, field) => drafts[id]?.[field];
  const setDraft = (id, field, value) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [field]: value } }));
  const dropDraft = (id, field) =>
    setDrafts((d) => {
      const next = { ...(d[id] || {}) };
      delete next[field];
      const c = { ...d };
      if (Object.keys(next).length === 0) delete c[id];
      else c[id] = next;
      return c;
    });

  const saveField = async (user, field) => {
    const draft = draftFor(user.id, field);
    if (draft === undefined) return;
    const value = draft.trim();
    dropDraft(user.id, field);
    if (!value) {
      setError(`${field === 'name' ? 'Name' : 'Email'} cannot be empty.`);
      return;
    }
    if (value === (user[field] || '')) return;
    const dup = (users || []).some(
      (u) => u.id !== user.id && (u[field] || '').toLowerCase() === value.toLowerCase(),
    );
    if (dup) {
      setError(`${field === 'name' ? 'Name' : 'Email'} already in use.`);
      return;
    }
    try {
      await updateUser(user.id, { [field]: value });
      setUsers((prev) =>
        prev?.map((u) => (u.id === user.id ? { ...u, [field]: value } : u)),
      );
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  // FIX311.3.3 / FIX311.5.6: add or remove a project from a user's
  // <user-projects>. Permission is admin OR PM-of-this-project; the
  // dropdown is filtered for non-admins so non-pickable rows don't
  // appear.
  const canEditProjectFor = (projectId) =>
    isAdmin || managedProjectIds.has(projectId);
  const grantProject = async (userId, projectId) => {
    setBusy(true);
    try {
      await grantUserProject(userId, projectId);
      const proj = projects.find((p) => p.id === projectId);
      setUsers((prev) =>
        prev?.map((u) =>
          u.id === userId
            ? {
                ...u,
                projects: [
                  ...(u.projects || []),
                  { id: projectId, name: proj?.name ?? '?' },
                ],
              }
            : u,
        ),
      );
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const revokeProject = async (userId, projectId) => {
    setBusy(true);
    try {
      await revokeUserProject(userId, projectId);
      // FIX311.5.7: removing the project from <user-projects> is the
      // same row that drives <project-managers>, so the user is also
      // implicitly dropped from the project's manager list.
      setUsers((prev) =>
        prev?.map((u) =>
          u.id === userId
            ? {
                ...u,
                projects: (u.projects || []).filter((p) => p.id !== projectId),
              }
            : u,
        ),
      );
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
        {/* FIX311.5.2 + FIX311.5.3: Add and Remove are admin-only. */}
        {isAdmin && (
          <div className="users-toolbar">
            {/* FIX311.2.2 + FIX311.2.2.0 <admin-add-user>: green '+' icon. */}
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
            {/* FIX311.2.3 + FIX311.2.3.0 <admin-remove-user>: red cross icon. */}
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
        )}
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
                  {/* FIX311.5.4 <user-name>: admin-editable, otherwise
                      a plain text cell. Same pattern for the email
                      column below (FIX311.5.5). */}
                  <td>
                    {isAdmin ? (
                      <input
                        type="text"
                        data-yagu-id="user-name"
                        className="ip-name-input"
                        value={draftFor(u.id, 'name') ?? u.name}
                        onChange={(e) => setDraft(u.id, 'name', e.target.value)}
                        onBlur={() => saveField(u, 'name')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.target.blur();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      u.name
                    )}
                  </td>
                  <td>
                    {isAdmin ? (
                      <input
                        type="text"
                        data-yagu-id="user-email"
                        className="ip-name-input"
                        value={draftFor(u.id, 'email') ?? (u.email || '')}
                        onChange={(e) => setDraft(u.id, 'email', e.target.value)}
                        onBlur={() => saveField(u, 'email')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.target.blur();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      u.email || ''
                    )}
                  </td>
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
                    {/* FIX311.2.1.5 + .5.1 + .5.2 <user-is-admin>:
                        green tick when checked, read-only. */}
                    <input
                      type="checkbox"
                      data-yagu-id="user-is-admin"
                      className="users-admin-check"
                      checked={!!u.is_admin}
                      readOnly
                      tabIndex={-1}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {/* FIX311.2.1.6 + FIX311.3.3 + FIX311.5.6 + FIX311.5.7
                      <user-projects>: editable list of projects the user
                      has access to. Each chip can be removed; the picker
                      shows projects not yet linked, filtered by what the
                      caller is allowed to grant (admin: any project; PM:
                      only their managed projects). */}
                  <UserProjectsCell
                    user={u}
                    allProjects={projects}
                    canEditProjectFor={canEditProjectFor}
                    onGrant={(pid) => grantProject(u.id, pid)}
                    onRevoke={(pid) => revokeProject(u.id, pid)}
                    busy={busy}
                  />
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

// FIX311.2.1.6 + FIX311.3.3 <user-projects>: editable list cell.
// Shows one chip per linked project (with × when the caller can
// revoke it) and a dropdown of pickable projects the caller can grant.
// Read-only when the caller has no edit rights for any of the user's
// linked projects nor permission to add a new one.
function UserProjectsCell({
  user,
  allProjects,
  canEditProjectFor,
  onGrant,
  onRevoke,
  busy,
}) {
  const linked = user.projects || [];
  const linkedIds = new Set(linked.map((p) => p.id));
  const pickable = allProjects.filter(
    (p) => !linkedIds.has(p.id) && canEditProjectFor(p.id),
  );
  return (
    <td data-yagu-id="user-projects" className="users-projects">
      <div className="users-projects-chips">
        {linked.map((p) => {
          const removable = canEditProjectFor(p.id);
          return (
            <span key={p.id} className="users-projects-chip">
              {p.name}
              {removable && (
                <button
                  type="button"
                  className="users-projects-chip-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevoke(p.id);
                  }}
                  disabled={busy}
                  aria-label={`Remove ${p.name}`}
                  title={`Remove ${p.name}`}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {pickable.length > 0 && (
          <select
            className="users-projects-add"
            value=""
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const pid = Number(e.target.value);
              if (!Number.isFinite(pid)) return;
              onGrant(pid);
              e.target.value = '';
            }}
            disabled={busy}
          >
            <option value="">+ Add…</option>
            {pickable.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>
    </td>
  );
}
