import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import SignInPanel from './SignInPanel.jsx';
import { listProjects } from './data/backend.js';

// FIX400: Home page.
// FIX400.2.1 list of projects with name and cover image
// FIX400.2.2 / FIX400.2.2.0 <button-sign-in>: Sign in button
// FIX400.3.1 click a project opens it
// FIX400.4   public-only when anonymous, public + accessible private when signed in
export default function HomeView({ onOpenProject }) {
  const { token, profile, signOut, configured } = useAuth();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const loadProjects = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message || String(e)));
  }, [token]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  return (
    <div className="home">
      <div className="home-topbar">
        {profile ? (
          <>
            <span className="home-user">Signed in as {profile.login_name}</span>
            <button className="btn-link" onClick={signOut}>Sign out</button>
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
            <li key={p.id}>
              <button
                type="button"
                className="home-project-card"
                onClick={() => onOpenProject?.(p)}
              >
                <div className="home-project-cover">
                  {p.cover_image_url
                    ? <img src={p.cover_image_url} alt="" />
                    : <div className="home-project-cover-placeholder" />}
                </div>
                <div className="home-project-name">{p.name}</div>
                {!p.is_public && <div className="home-project-badge">private</div>}
              </button>
            </li>
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
