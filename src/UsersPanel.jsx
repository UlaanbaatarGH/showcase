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

// FIX311 <panel-users-list>: admin user-list management. Lists every
// app_user row with their flags + project access summary. Lets the
// admin add new users (FIX311.3.1) and remove them (FIX311.3.2). One
// row is always selected (FIX311.5.1). Editing a row's fields is
// done via a separate <panel-user> opened with <button-edit-user>
// (FIX311.3.5 + FIX312).
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

  // FIX311.5.6 + FIX312.5.1: which projects the caller can grant or
  // revoke. Admin can edit any project; a Project Manager only the
  // ones they manage. Drives the panel's enabled rows and the Edit
  // button visibility for non-admins.
  const canEditProjectFor = (projectId) =>
    isAdmin || managedProjectIds.has(projectId);
  const canEditAnyProject =
    isAdmin || (projects || []).some((p) => managedProjectIds.has(p.id));

  // FIX311.3.5 + FIX312: <panel-user> editor state. Cancel discards;
  // Save commits name/email/projects in one batch.
  const [userEditOpen, setUserEditOpen] = useState(false);
  const applyUserEdits = async (userId, { name, email, projectIds }) => {
    const target = users?.find((u) => u.id === userId);
    if (!target) return;
    const patch = {};
    // FIX311.5.4 / .5.5: name & email are admin-only — non-admin
    // callers receive the existing values back from the panel and
    // shouldn't trigger updates here.
    if (isAdmin) {
      const trimmedName = (name ?? '').trim();
      const trimmedEmail = (email ?? '').trim();
      if (!trimmedName) { setError('Name cannot be empty.'); return; }
      if (!trimmedEmail) { setError('Email cannot be empty.'); return; }
      if (trimmedName !== target.name) patch.name = trimmedName;
      if (trimmedEmail !== (target.email || '')) patch.email = trimmedEmail;
      const dupName = (users || []).some(
        (u) => u.id !== userId && u.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (dupName) { setError('Name already in use.'); return; }
      const dupEmail = (users || []).some(
        (u) => u.id !== userId
          && (u.email || '').toLowerCase() === trimmedEmail.toLowerCase(),
      );
      if (dupEmail) { setError('Email already in use.'); return; }
    }
    const current = new Set((target.projects || []).map((p) => p.id));
    const desired = new Set(projectIds);
    const toGrant = [...desired].filter((id) => !current.has(id));
    const toRevoke = [...current].filter((id) => !desired.has(id));
    if (
      Object.keys(patch).length === 0
      && toGrant.length === 0
      && toRevoke.length === 0
    ) {
      setUserEditOpen(false);
      return;
    }
    setBusy(true);
    try {
      if (Object.keys(patch).length > 0) await updateUser(userId, patch);
      for (const pid of toGrant) await grantUserProject(userId, pid);
      for (const pid of toRevoke) await revokeUserProject(userId, pid);
      // Reload to pick up server-side consolidated state.
      await new Promise((r) => {
        listUsers().then((d) => { setUsers(d); r(); }).catch(() => r());
      });
      setError(null);
      setUserEditOpen(false);
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
        data-yagu-id="panel-users-list"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Users</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {/* Toolbar: FIX311.5.2 + FIX311.5.3 keep Add/Remove admin-only;
            FIX311.5.6 also lets project managers open the Edit panel
            (only the projects they manage are editable inside it). */}
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
            {/* FIX311.2.4 + FIX311.2.4.0 + FIX311.3.5 <button-edit-user>:
                opens <panel-user> against the selected user. */}
            <button
              type="button"
              className="users-projects-btn"
              data-yagu-id="button-edit-user"
              onClick={() => setUserEditOpen(true)}
              disabled={busy || !selectedId}
              title="Edit user"
            >
              Edit
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
                  {/* FIX311.2.1.1 <user-name>: read-only display.
                      Editing happens through <panel-user>
                      (FIX311.3.5 / FIX312.1.1). */}
                  <td data-yagu-id="user-name">{u.name}</td>
                  {/* FIX311.2.1.2 <user-email>: read-only display.
                      Editing through <panel-user> (FIX312.1.2). */}
                  <td data-yagu-id="user-email">{u.email || ''}</td>
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
        {/* FIX311.3.5 + FIX312 <panel-user>: full-user editor opened
            against the currently selected row. */}
        {userEditOpen && selectedId && (
          <UserPanel
            busy={busy}
            user={users?.find((u) => u.id === selectedId)}
            projects={projects}
            isAdmin={isAdmin}
            canEditProjectFor={canEditProjectFor}
            onCancel={() => setUserEditOpen(false)}
            onSubmit={(payload) => applyUserEdits(selectedId, payload)}
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

// FIX312 <panel-user>: full-user editor. Reached via <button-edit-user>
// (FIX311.3.5). Edits the user's Name (FIX312.1.1), Email (FIX312.1.2)
// and Projects (FIX312.1.3) — Save commits them in one batch
// (FIX312.1.11), Cancel discards (FIX312.1.10). Name and Email are
// admin-only fields per FIX311.5.4 / .5.5 — for non-admin callers
// (Project Managers) those inputs render disabled. The project list
// follows FIX312.5.1: admins see every project, others only the ones
// they themselves manage.
function UserPanel({
  busy,
  user,
  projects,
  isAdmin,
  canEditProjectFor,
  onCancel,
  onSubmit,
}) {
  const initialPicked = useMemo(
    () => new Set((user?.projects || []).map((p) => p.id)),
    [user],
  );
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [picked, setPicked] = useState(() => new Set(initialPicked));
  const visibleProjects = useMemo(
    () => (isAdmin ? projects : projects.filter((p) => canEditProjectFor(p.id))),
    [isAdmin, projects, canEditProjectFor],
  );
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
        className="modal users-add-dialog"
        data-yagu-id="panel-user"
        onClick={(e) => e.stopPropagation()}
      >
        {/* FIX312.1 layout: header reads 'User {user-name}'. */}
        <header className="visits-header">
          <h2>User {user.name}</h2>
        </header>
        {/* FIX312.1.1 Field 'Name'. */}
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
          />
        </label>
        {/* FIX312.1.2 Field 'Email'. */}
        <label>
          Email
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!isAdmin}
          />
        </label>
        {/* FIX312.1.3 + FIX312.5.1 Field 'Projects': checkbox per
            project. Admins see all; others only their own managed
            projects. */}
        <div className="users-add-managers">
          <span className="users-add-managers-label">Projects</span>
          {visibleProjects.length === 0 ? (
            <div className="visits-empty">No project to grant.</div>
          ) : (
            <ul
              className="managers-picker-list"
              data-yagu-id="user-projects-editor"
            >
              {visibleProjects.map((p) => (
                <li key={p.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="users-add-actions">
          {/* FIX312.1.10 Button Cancel. */}
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {/* FIX312.1.11 Button Save: name + email + projects. */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSubmit({ name, email, projectIds: [...picked] })}
            disabled={busy}
          >
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
