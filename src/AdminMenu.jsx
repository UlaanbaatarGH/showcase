import { useEffect, useRef, useState } from 'react';
import VisitsPanel from './VisitsPanel.jsx';
import UsersPanel from './UsersPanel.jsx';
import ProjectsPanel from './ProjectsPanel.jsx';

// FIX410 <menu-admin>: dropdown grouping admin-only views.
// FIX410.2.1: Visits → <panel-visits>. FIX410.2.2: Users → <panel-users-list>.
// FIX351 (sibling): Projects → <panel-project-list>.
export default function AdminMenu({ className = '' }) {
  const [open, setOpen] = useState(false);
  const [visitsOpen, setVisitsOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <>
      <div className={`sc-menu ${className}`.trim()} data-yagu-id="menu-admin" ref={ref}>
        <button
          type="button"
          className="sc-menu-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Admin ▾
        </button>
        {open && (
          <ul className="sc-menu-items" role="menu">
            <li>
              <button
                type="button"
                role="menuitem"
                data-yagu-id="menu-option-visits"
                onClick={() => { setOpen(false); setVisitsOpen(true); }}
              >
                Visits
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                data-yagu-id="menu-option-users"
                onClick={() => { setOpen(false); setUsersOpen(true); }}
              >
                Users
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                data-yagu-id="menu-option-projects"
                onClick={() => { setOpen(false); setProjectsOpen(true); }}
              >
                Projects
              </button>
            </li>
          </ul>
        )}
      </div>
      {visitsOpen && <VisitsPanel onClose={() => setVisitsOpen(false)} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} />}
    </>
  );
}
