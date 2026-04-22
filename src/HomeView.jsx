import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext.jsx';
import SignInPanel from './SignInPanel.jsx';
import {
  listProjects,
  updateProject,
  signProjectCoverUpload,
} from './data/backend.js';

// FIX400: Home page.
// FIX400.2.1 list of projects with name and cover image
// FIX400.2.2 / FIX400.2.2.0 <button-sign-in>
// FIX400.2.3/.4/.5 Edit / Cancel / Save buttons (signed-in only)
// FIX400.3.1 click project opens it (when not in edition)
// FIX400.3.2 Edit switches the page to edition — renameable + droppable
//            cover image, for projects the user owns
// FIX400.3.3/.3.4 Save / Cancel the edition
// FIX400.4.1 anon sees public only
// FIX400.4.2 signed-in sees accessible private + public
// FIX400.4.3/.4/.5 button visibility rules
export default function HomeView({ onOpenProject }) {
  const { token, profile, signOut, configured } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);

  // Edition state — only meaningful when profile is set. `drafts` holds
  // per-project pending edits keyed by project id: { name?, coverFile?,
  // coverPreviewUrl? }. Cleared on Cancel or successful Save.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);

  const loadProjects = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message || String(e)));
  }, [token]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // FIX400.4.3/.4/.5: buttons follow (signed-in AND editing-state) rules.
  const showEdit = !!profile && !editing;
  const showSaveCancel = !!profile && editing;

  const enterEdit = () => {
    setDrafts({});
    setEditing(true);
  };

  const cancelEdit = () => {
    // Release any blob: URLs we created for drop previews so they can be
    // garbage-collected.
    for (const d of Object.values(drafts)) {
      if (d?.coverPreviewUrl) URL.revokeObjectURL(d.coverPreviewUrl);
    }
    setDrafts({});
    setEditing(false);
  };

  const setDraftName = (projectId, name) => {
    setDrafts((d) => ({
      ...d,
      [projectId]: { ...(d[projectId] || {}), name },
    }));
  };

  const setDraftCover = (projectId, file) => {
    setDrafts((d) => {
      const prev = d[projectId] || {};
      if (prev.coverPreviewUrl) URL.revokeObjectURL(prev.coverPreviewUrl);
      return {
        ...d,
        [projectId]: {
          ...prev,
          coverFile: file,
          coverPreviewUrl: URL.createObjectURL(file),
        },
      };
    });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      for (const p of projects) {
        if (!p.can_edit) continue;
        const d = drafts[p.id];
        if (!d) continue;
        const patch = {};
        if (d.name != null && d.name.trim() && d.name.trim() !== p.name) {
          patch.name = d.name.trim();
        }
        if (d.coverFile) {
          const sign = await signProjectCoverUpload(p.id, d.coverFile.name);
          const putRes = await fetch(sign.signed_url, {
            method: 'PUT',
            headers: { 'Content-Type': d.coverFile.type || 'application/octet-stream' },
            body: d.coverFile,
          });
          if (!putRes.ok) {
            throw new Error(`Upload ${p.name}: ${putRes.status}`);
          }
          patch.cover_image_key = sign.storage_key;
        }
        if (Object.keys(patch).length) {
          await updateProject(p.id, patch);
        }
      }
      // Reload from the source of truth so any server-side massaging
      // (trim, versioned URL) shows up.
      await new Promise((r) => {
        listProjects()
          .then((ps) => { setProjects(ps); r(); })
          .catch((e) => { setError(e.message || String(e)); r(); });
      });
      for (const v of Object.values(drafts)) {
        if (v?.coverPreviewUrl) URL.revokeObjectURL(v.coverPreviewUrl);
      }
      setDrafts({});
      setEditing(false);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const openProject = (p) => {
    if (editing) return;
    onOpenProject?.(p);
  };

  return (
    <div className="home">
      <div className="home-topbar">
        {profile ? (
          <>
            <span className="home-user">Signed in as {profile.login_name}</span>
            {showEdit && (
              <button
                type="button"
                className="btn-link"
                data-yagu-id="button-edit-project"
                onClick={enterEdit}
              >
                Edit
              </button>
            )}
            {showSaveCancel && (
              <>
                <button
                  type="button"
                  className="btn-link"
                  data-yagu-id="button-cancel-edit-project"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  data-yagu-id="button-save-edit-project"
                  onClick={saveEdit}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            <button className="btn-link" onClick={signOut} disabled={editing}>
              Sign out
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            data-yagu-id="button-sign-in"
            onClick={() => setSignInOpen(true)}
            disabled={!configured}
            title={configured ? '' : 'Sign-in not configured'}
          >
            Sign in
          </button>
        )}
      </div>

      <h1>Showcase</h1>

      {error && <div className="home-err">Backend error: {error}</div>}

      {projects === null && !error && <div className="home-loading">Loading…</div>}

      {projects && projects.length === 0 && (
        <div className="home-empty">No projects visible yet.</div>
      )}

      {projects && projects.length > 0 && (
        <ul className="home-projects">
          {projects.map((p) => (
            <HomeProjectCard
              key={p.id}
              project={p}
              editing={editing}
              draft={drafts[p.id]}
              onOpen={() => openProject(p)}
              onNameChange={(v) => setDraftName(p.id, v)}
              onCoverDrop={(file) => setDraftCover(p.id, file)}
            />
          ))}
        </ul>
      )}

      {signInOpen && (
        <div className="modal-backdrop" onClick={() => setSignInOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <SignInPanel onClose={() => setSignInOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function HomeProjectCard({
  project: p,
  editing,
  draft,
  onOpen,
  onNameChange,
  onCoverDrop,
}) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const editable = editing && p.can_edit;
  const displayName = draft?.name ?? p.name;
  const displayCoverUrl = draft?.coverPreviewUrl ?? p.cover_image_url;

  const onDragOver = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onCoverDrop(file);
    }
  };
  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onCoverDrop(file);
    e.target.value = '';
  };

  const cover = (
    <div
      className={`home-project-cover${editable ? ' editable' : ''}${dragOver ? ' drop-hover' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={editable ? (e) => { e.stopPropagation(); fileInputRef.current?.click(); } : undefined}
      title={editable ? 'Drop an image or click to pick one' : undefined}
    >
      {displayCoverUrl
        ? <img src={displayCoverUrl} alt="" />
        : <div className="home-project-cover-placeholder" />}
      {editable && (
        <>
          <div className="home-project-cover-hint">Drop image</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
        </>
      )}
    </div>
  );

  const body = (
    <>
      {cover}
      {editable ? (
        <input
          type="text"
          className="home-project-name-input"
          value={displayName}
          onChange={(e) => onNameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="home-project-name">{displayName}</div>
      )}
      {!p.is_public && <div className="home-project-badge">private</div>}
    </>
  );

  return (
    <li>
      {editing ? (
        // FIX400.3.1 negated: in edition, the card is not clickable to
        // open the project. Wrapping div (not button) avoids submitting
        // on Enter inside the name input.
        <div className="home-project-card editing">{body}</div>
      ) : (
        <button
          type="button"
          className="home-project-card"
          onClick={onOpen}
        >
          {body}
        </button>
      )}
    </li>
  );
}
