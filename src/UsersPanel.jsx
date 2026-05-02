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

  // FIX311.3.3 / FIX311.5.6: which projects the caller can grant or
  // revoke. Admin can edit any project; a Project Manager only the
  // ones they manage. Drives both the popup's enabled rows and the
  // 'Project access' button visibility.
  const canEditProjectFor = (projectId) =>
    isAdmin || managedProjectIds.has(projectId);
  const canEditAnyProject =
    isAdmin || (projects || []).some((p) => managedProjectIds.has(p.id));
  // FIX311.3.4: editor popup state — open against the currently
  // selected user. Cancel discards; Ok applies the deltas.
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const applyProjectAccess = async (userId, nextIds) => {
    const current = new Set(
      (users?.find((u) => u.id === userId)?.projects || []).map((p) => p.id),
    );
    const target = new Set(nextIds);
    const toGrant = [...target].filter((id) => !current.has(id));
    const toRevoke = [...current].filter((id) => !target.has(id));
    if (toGrant.length === 0 && toRevoke.length === 0) {
      setProjectEditOpen(false);
      return;
    }
    setBusy(true);
    try {
      for (const pid of toGrant) await grantUserProject(userId, pid);
      for (const pid of toRevoke) await revokeUserProject(userId, pid);
      // Reload to re-fetch consolidated state (and let the backend
      // be the source of truth for project ordering).
      await new Promise((r) => {
        listUsers().then((d) => { setUsers(d); r(); }).catch(() => r());
      });
      setError(null);
      setProjectEditOpen(false);
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
        {/* Toolbar: FIX311.5.2 + FIX311.5.3 keep Add/Remove admin-only;
            FIX311.5.6 lets project managers also see the Project access
            button (for the projects they manage). */}
        {(isAdmin || canEditAnyProject) && (
          <div className="users-toolbar">
            {isAdmin && (
              <>
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
              </>
            )}
            {/* FIX311.2.4 + FIX311.2.4.0 + FIX311.3.4 <button-set-user-projects>:
                opens the project-access editor for the selected user. */}
            <button
              type="button"
              className="users-projects-btn"
              data-yagu-id="button-set-user-projects"
              onClick={() => setProjectEditOpen(true)}
              disabled={busy || !selectedId}
              title="Project access"
            >
              Project access
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
                  {/* FIX311.2.1.6 + FIX311.2.1.6.1 + FIX311.2.1.6.1.1
                      <user-projects>: read-only list of project names
                      (no inline edition — use the 'Project access'
                      toolbar button to edit). */}
                  <td data-yagu-id="user-projects">
                    {(u.projects || []).map((p) => p.name).join(', ')}
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
        {/* FIX311.3.4 <button-set-user-projects> action: tick the
            projects the selected user should have access to. */}
        {projectEditOpen && selectedId && (
          <ProjectAccessDialog
            busy={busy}
            user={users?.find((u) => u.id === selectedId)}
            projects={projects}
            canEditProjectFor={canEditProjectFor}
            onCancel={() => setProjectEditOpen(false)}
            onSubmit={(ids) => applyProjectAccess(selectedId, ids)}
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

// FIX311.3.4 + FIX311.5.6 <button-set-user-projects> action: popup
// editor with one tick per existing project. Pre-ticked from the
// user's current <user-projects>. Rows the caller can't grant/revoke
// (PM with no manager rights for that project) are shown disabled so
// the read-only state is visible. On Ok, the parent computes the
// grant/revoke deltas and applies them.
function ProjectAccessDialog({
  busy,
  user,
  projects,
  canEditProjectFor,
  onCancel,
  onSubmit,
}) {
  const initial = useMemo(
    () => new Set((user?.projects || []).map((p) => p.id)),
    [user],
  );
  const [picked, setPicked] = useState(() => new Set(initial));
  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  if (!user) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal managers-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Project access — {user.name}</h2>
        </header>
        {projects.length === 0 ? (
          <div className="visits-empty">No project yet.</div>
        ) : (
          <ul
            className="managers-picker-list"
            data-yagu-id="user-projects-editor"
          >
            {projects.map((p) => {
              const editable = canEditProjectFor(p.id);
              return (
                <li key={p.id}>
                  <label className={editable ? '' : 'is-disabled'}>
                    <input
                      type="checkbox"
                      checked={picked.has(p.id)}
                      disabled={!editable}
                      onChange={() => toggle(p.id)}
                    />
                    {p.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="users-add-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSubmit([...picked])}
            disabled={busy}
          >
            {busy ? '…' : 'Ok'}
          </button>
        </div>
      </div>
    </div>
  );
}
