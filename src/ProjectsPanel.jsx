import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAdminProjects,
  createAdminProject,
  updateAdminProject,
  clearProjectManagers,
  moveAdminProject,
  listUsers,
} from './data/backend.js';
import { useAuth } from './AuthContext.jsx';

// FIX351 <panel-project-list>: signed-in projects + managers list.
// Columns are read-only displays per FIX351.2.1.x; field edits live
// in the project editor opened by <button-edit-project> (FIX352).
// The Remove button (FIX351.2.2) clears managers — it does NOT
// delete the project.
export default function ProjectsPanel({ onClose }) {
  const { profile } = useAuth();
  const isAdmin = profile?.profile === 'admin';
  const [projects, setProjects] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);

  const reload = useCallback(() => {
    Promise.all([listAdminProjects(), listUsers()])
      .then(([p, u]) => {
        setProjects(p);
        setUsers(u);
        setError(null);
      })
      .catch((e) => setError(e.message || String(e)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // FIX351.5.1: keep one row selected; default to first.
  useEffect(() => {
    if (!projects || projects.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (
      projects.some((p) => p.id === prev) ? prev : projects[0].id
    ));
  }, [projects]);

  // FIX317-aware: only redeemed users can be managers.
  const eligibleUsers = useMemo(
    () => (users || []).filter((u) => u.has_password),
    [users],
  );

  // FIX351.5.7: <button-edit-project> is enabled only for an admin or
  // a manager of the currently selected project.
  const managedProjectIds = useMemo(
    () => new Set(profile?.managed_project_ids || []),
    [profile?.managed_project_ids],
  );
  const canEditSelected =
    selectedId != null && (isAdmin || managedProjectIds.has(selectedId));

  const onAdd = async ({ name, manager_ids }) => {
    setBusy(true);
    try {
      const created = await createAdminProject({ name, manager_ids });
      const refreshed = await listAdminProjects();
      setProjects(refreshed);
      setSelectedId(created.id);
      setAddOpen(false);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async (direction) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await moveAdminProject(selectedId, direction);
      const refreshed = await listAdminProjects();
      setProjects(refreshed);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedIdx = projects?.findIndex((p) => p.id === selectedId) ?? -1;
  const canMoveUp = selectedIdx > 0;
  const canMoveDown =
    projects != null && selectedIdx >= 0 && selectedIdx < projects.length - 1;

  const onRemove = async () => {
    if (!selectedId) return;
    const target = projects?.find((p) => p.id === selectedId);
    if (!target) return;
    const ok = window.confirm(
      `Clear all managers of "${target.name}"? The project itself stays.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await clearProjectManagers(selectedId);
      setProjects((prev) =>
        prev?.map((p) =>
          p.id === selectedId
            ? { ...p, managers: [], data_managers: [], user_managers: [] }
            : p,
        ),
      );
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // FIX352.3.10 Save: persist Name, Data Managers, Is public, and
  // (admin-only per FIX352.3.10.11) User Managers.
  const saveProject = async (projectId, payload) => {
    setBusy(true);
    try {
      await updateAdminProject(projectId, payload);
      const refreshed = await listAdminProjects();
      setProjects(refreshed);
      setEditProjectId(null);
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
        className="modal projects-panel"
        data-yagu-id="panel-project-list"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Projects</h2>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </header>
        {/* Toolbar: FIX351.5.3-.5.6 keep Add/Remove/Move admin-only;
            FIX351.5.7 Edit is rendered for everyone but enabled only
            for admin OR manager of the selected project. */}
        <div className="users-toolbar">
          {isAdmin && (
            <>
              {/* FIX351.2.5 <button-add-project>: green '+'. */}
              <button
                type="button"
                className="users-add"
                data-yagu-id="button-add-project"
                onClick={() => setAddOpen(true)}
                disabled={busy || eligibleUsers.length === 0}
                title={
                  eligibleUsers.length === 0
                    ? 'At least one user with a password is required.'
                    : 'Add project'
                }
                aria-label="Add project"
              >
                +
              </button>
              {/* FIX351.2.6 <button-remove-project>: red '×' (clears managers). */}
              <button
                type="button"
                className="users-remove"
                data-yagu-id="button-remove-project"
                onClick={onRemove}
                disabled={busy || !selectedId}
                aria-label="Remove project managers"
                title="Clear managers of the selected project"
              >
                ×
              </button>
              {/* FIX351.2.7 <button-move-up-project>. */}
              <button
                type="button"
                data-yagu-id="button-move-up-project"
                onClick={() => move('up')}
                disabled={busy || !canMoveUp}
                aria-label="Move project up"
                title="Move up"
              >
                ↑
              </button>
              {/* FIX351.2.8 <button-move-down-project>. */}
              <button
                type="button"
                data-yagu-id="button-move-down-project"
                onClick={() => move('down')}
                disabled={busy || !canMoveDown}
                aria-label="Move project down"
                title="Move down"
              >
                ↓
              </button>
            </>
          )}
          {/* FIX351.2.9 <button-edit-project>: opens <panel-project>
              (FIX352) for the selected row. */}
          <button
            type="button"
            className="users-projects-btn"
            data-yagu-id="button-edit-project"
            onClick={() => setEditProjectId(selectedId)}
            disabled={busy || !canEditSelected}
            title="Edit project"
          >
            Edit
          </button>
        </div>
        {error && <div className="visits-err">{error}</div>}
        {projects === null && <div className="visits-loading">Loading…</div>}
        {projects && projects.length === 0 && (
          <div className="visits-empty">No project yet.</div>
        )}
        {projects && projects.length > 0 && (
          <table className="visits-table users-table">
            <thead>
              <tr>
                {/* FIX351.2.1.1 Column 'Name'. */}
                <th>Name</th>
                {/* FIX351.2.1.2 Column 'Data Managers'. */}
                <th>Data Managers</th>
                {/* FIX351.2.1.5 Column 'User Managers'. */}
                <th>User Managers</th>
                {/* FIX351.2.1.3 Column 'Is public'. */}
                <th>Is public</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className={p.id === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(p.id)}
                >
                  <td data-yagu-id="project-name">{p.name}</td>
                  <td data-yagu-id="project-managers">
                    {(p.data_managers || []).length === 0
                      ? <span className="visits-anon">(none)</span>
                      : (p.data_managers || []).map((m) => m.name).join(', ')}
                  </td>
                  <td data-yagu-id="project-user-managers">
                    {(p.user_managers || []).length === 0
                      ? <span className="visits-anon">(none)</span>
                      : (p.user_managers || []).map((m) => m.name).join(', ')}
                  </td>
                  <td className="users-check">
                    {/* FIX351.2.1.3 <project-is-public>: read-only
                        display. Editing is via <panel-project>. */}
                    <input
                      type="checkbox"
                      data-yagu-id="project-is-public"
                      checked={!!p.is_public}
                      readOnly
                      tabIndex={-1}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {addOpen && (
          <AddProjectDialog
            busy={busy}
            existingNames={new Set((projects || []).map((p) => p.name.toLowerCase()))}
            users={eligibleUsers}
            onCancel={() => setAddOpen(false)}
            onSubmit={onAdd}
          />
        )}
        {editProjectId != null && (
          <ProjectPanel
            busy={busy}
            project={projects?.find((p) => p.id === editProjectId)}
            existingNames={new Set(
              (projects || [])
                .filter((p) => p.id !== editProjectId)
                .map((p) => p.name.toLowerCase()),
            )}
            isAdmin={isAdmin}
            onCancel={() => setEditProjectId(null)}
            onSubmit={(payload) => saveProject(editProjectId, payload)}
          />
        )}
      </div>
    </div>
  );
}

// FIX351.2.1 (updated) Add Project dialog. The dialog itself is
// FIX351.2.1.1 (prompts for a name); FIX351.2.1.2 [ex-.1.1] enforces
// non-blank + uniqueness; FIX351.2.1.3 inserts the row. FIX351.2.1.2
// (removed) — managers are no longer required at create time.
function AddProjectDialog({ busy, existingNames, users, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [err, setErr] = useState(null);

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setErr('Name is required.'); return; }
    if (existingNames.has(n.toLowerCase())) {
      setErr('Project name already in use.');
      return;
    }
    setErr(null);
    onSubmit({ name: n, manager_ids: [...picked] });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal users-add-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="visits-header">
          <h2>Add project</h2>
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
        <div className="users-add-managers">
          <span className="users-add-managers-label">Managers</span>
          {users.length === 0 ? (
            <div className="visits-empty">
              No user with a password set yet.
            </div>
          ) : (
            <ul className="managers-picker-list" data-yagu-id="list-users">
              {users.map((u) => (
                <li key={u.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
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

// FIX352 <panel-project>: edit a project's Name, Data Managers, User
// Managers and Is public. Managers are picked from <list-users>
// having this project in their <user-projects> (FIX352.3.1) — i.e.,
// the union of the project's existing data + user managers. Adding a
// brand-new candidate goes through <panel-user> first.
// FIX352.3.10.11: User Managers checkboxes are admin-only; non-admin
// callers (User Managers of the project per FIX351.5.7) see them
// disabled.
function ProjectPanel({
  busy,
  project,
  existingNames,
  isAdmin,
  onCancel,
  onSubmit,
}) {
  const [name, setName] = useState(project?.name || '');
  const [isPublic, setIsPublic] = useState(!!project?.is_public);
  const [dataManagers, setDataManagers] = useState(
    () => new Set((project?.data_managers || []).map((m) => m.id)),
  );
  const [userManagers, setUserManagers] = useState(
    () => new Set((project?.user_managers || []).map((m) => m.id)),
  );
  const [err, setErr] = useState(null);

  // FIX352.3.1: picker source = users having this project in their
  // <user-projects>, i.e., the existing project_access set (= union
  // of current data + user managers).
  const candidates = useMemo(() => {
    if (!project) return [];
    const seen = new Map();
    for (const m of project.data_managers || []) seen.set(m.id, m);
    for (const m of project.user_managers || []) seen.set(m.id, m);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  if (!project) return null;

  const toggleData = (id) => {
    setDataManagers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleUser = (id) => {
    if (!isAdmin) return; // FIX352.3.10.11: admin-only
    setUserManagers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    const trimmed = name.trim();
    // FIX352.3.10.1 [ex-351.2.3]: non-blank, unique name.
    if (!trimmed) { setErr('Name is required.'); return; }
    if (existingNames.has(trimmed.toLowerCase())) {
      setErr('Project name already in use.');
      return;
    }
    setErr(null);
    const payload = {
      name: trimmed,
      is_public: isPublic,
      data_managers: [...dataManagers],
    };
    if (isAdmin) {
      // FIX352.3.10.11: only admin sends user_managers.
      payload.user_managers = [...userManagers];
    }
    onSubmit(payload);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal users-add-dialog"
        data-yagu-id="panel-project"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Project</h2>
        </header>
        {/* FIX352.2 layout: Name / Data Managers / Users Managers /
            Is public / [Cancel] [Save]. */}
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <div className="users-add-managers">
          <span className="users-add-managers-label">Data Managers</span>
          {candidates.length === 0 ? (
            <div className="visits-empty">
              No candidate — add the user via the Users panel first.
            </div>
          ) : (
            <ul className="managers-picker-list" data-yagu-id="project-managers">
              {candidates.map((u) => (
                <li key={u.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={dataManagers.has(u.id)}
                      onChange={() => toggleData(u.id)}
                    />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="users-add-managers">
          <span className="users-add-managers-label">Users Managers</span>
          {candidates.length === 0 ? (
            <div className="visits-empty">No candidate.</div>
          ) : (
            <ul
              className="managers-picker-list"
              data-yagu-id="project-user-managers"
            >
              {candidates.map((u) => (
                <li key={u.id}>
                  <label className={isAdmin ? '' : 'is-disabled'}>
                    <input
                      type="checkbox"
                      checked={userManagers.has(u.id)}
                      disabled={!isAdmin}
                      onChange={() => toggleUser(u.id)}
                    />
                    {u.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="setup-checkbox-row">
          <input
            type="checkbox"
            data-yagu-id="project-is-public"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Is public
        </label>
        {err && <div className="visits-err">{err}</div>}
        <div className="users-add-actions">
          {/* FIX352.3.10 Cancel / Save. */}
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
