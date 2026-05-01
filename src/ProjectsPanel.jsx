import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAdminProjects,
  createAdminProject,
  updateAdminProject,
  clearProjectManagers,
  listUsers,
} from './data/backend.js';

// FIX351 <panel-project-list>: admin-only projects + managers list.
// Spec quirk: the Remove button (FIX351.2.2) clears managers — it
// does NOT delete the project. Deletion would be a separate flow.
export default function ProjectsPanel({ onClose }) {
  const [projects, setProjects] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [managersEditId, setManagersEditId] = useState(null);
  const [nameDraft, setNameDraft] = useState({}); // projectId → text

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

  // FIX351.2.1 + FIX317-aware: only redeemed users can be managers.
  const eligibleUsers = useMemo(
    () => (users || []).filter((u) => u.has_password),
    [users],
  );

  const onAdd = async ({ name, manager_id }) => {
    setBusy(true);
    try {
      const created = await createAdminProject({ name, manager_id });
      // Refetch so managers come back populated (created returns no
      // managers — server inserts the row but the join happens on
      // list).
      await new Promise((r) => Promise.all([listAdminProjects()])
        .then(([p]) => { setProjects(p); r(); })
        .catch(() => r()));
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
        prev?.map((p) => (p.id === selectedId ? { ...p, managers: [] } : p)),
      );
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (project) => {
    const draft = (nameDraft[project.id] ?? project.name).trim();
    setNameDraft((d) => {
      const c = { ...d };
      delete c[project.id];
      return c;
    });
    if (!draft || draft === project.name) return;
    try {
      await updateAdminProject(project.id, { name: draft });
      setProjects((prev) =>
        prev?.map((p) => (p.id === project.id ? { ...p, name: draft } : p)),
      );
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  const saveManagers = async (project, managerIds) => {
    setBusy(true);
    try {
      await updateAdminProject(project.id, { managers: managerIds });
      // Resolve names from the users list to update the local view
      // optimistically. The picker only offers eligibleUsers so all
      // ids are guaranteed to be in our cached `users` array.
      const usersById = new Map((users || []).map((u) => [u.id, u]));
      setProjects((prev) =>
        prev?.map((p) => (
          p.id === project.id
            ? {
                ...p,
                managers: managerIds.map((id) => ({
                  id,
                  name: usersById.get(id)?.name || id,
                })),
              }
            : p
        )),
      );
      setError(null);
      setManagersEditId(null);
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
        <div className="users-toolbar">
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
                <th>Name</th>
                <th>Managers</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className={p.id === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(p.id)}
                >
                  <td>
                    {/* FIX351.2.3: editable name. Saved on blur or
                        Enter; client-side uniqueness check first,
                        backend re-checks. */}
                    <input
                      type="text"
                      data-yagu-id="project-name"
                      className="ip-name-input"
                      value={nameDraft[p.id] ?? p.name}
                      onChange={(e) =>
                        setNameDraft((d) => ({ ...d, [p.id]: e.target.value }))
                      }
                      onBlur={() => saveName(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.target.blur();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td data-yagu-id="project-managers">
                    {/* FIX351.2.4: click to edit the managers list. */}
                    <button
                      type="button"
                      className="projects-managers-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setManagersEditId(p.id);
                      }}
                    >
                      {(p.managers || []).length === 0
                        ? <span className="visits-anon">(none)</span>
                        : (p.managers || []).map((m) => m.name).join(', ')}
                    </button>
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
        {managersEditId != null && (
          <ManagersPickerDialog
            busy={busy}
            users={eligibleUsers}
            project={projects?.find((p) => p.id === managersEditId)}
            onCancel={() => setManagersEditId(null)}
            onSubmit={(ids) => saveManagers(
              projects.find((p) => p.id === managersEditId),
              ids,
            )}
          />
        )}
      </div>
    </div>
  );
}

// FIX351.2.1 dialog: prompt for project name + initial single manager.
function AddProjectDialog({ busy, existingNames, users, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState(users[0]?.id || '');
  const [err, setErr] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setErr('Name is required.'); return; }
    if (existingNames.has(n.toLowerCase())) {
      setErr('Project name already in use.');
      return;
    }
    if (!managerId) { setErr('Pick a manager.'); return; }
    setErr(null);
    onSubmit({ name: n, manager_id: managerId });
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
        <label>
          Manager
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
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

// FIX351.2.4: manager picker — multi-select checkboxes over the
// eligible users (those with a password set).
function ManagersPickerDialog({ busy, users, project, onCancel, onSubmit }) {
  const [picked, setPicked] = useState(() =>
    new Set((project?.managers || []).map((m) => m.id)),
  );
  if (!project) return null;
  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal managers-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="visits-header">
          <h2>Managers — {project.name}</h2>
        </header>
        {users.length === 0 ? (
          <div className="visits-empty">
            No user with a password set yet.
          </div>
        ) : (
          <ul className="managers-picker-list" data-yagu-id="data-users-list">
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
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
