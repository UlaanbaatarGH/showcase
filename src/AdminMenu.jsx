import { useEffect, useRef, useState } from 'react';
import VisitsPanel from './VisitsPanel.jsx';
import UsersPanel from './UsersPanel.jsx';
import ProjectsPanel from './ProjectsPanel.jsx';
import MessagesPanel from './MessagesPanel.jsx';
import VersionsPanel from './VersionsPanel.jsx';

// FIX410 <menu-admin>: dropdown grouping admin-only views.
// FIX410.2.1 Visits → <panel-visits>; FIX410.2.2 Users →
// <panel-users-list>; FIX351 (sibling) Projects →
// <panel-project-list>; FIX410.1.1.4 Messages →
// <panel-message-list> (filtered by projectId when the menu is
// rendered on a project page); FIX410.1.1.5 Versions →
// <panel-app-versions>.
export default function AdminMenu({ className = '', projectId = null }) {
  const [open, setOpen] = useState(false);
  const [visitsOpen, setVisitsOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
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
            <li>
              {/* FIX410.1.1.4 + FIX410.1.1.4.1 <menu-option-messages>:
                  opens <panel-message-list>, scoped to the current
                  project when projectId is provided. */}
              <button
                type="button"
                role="menuitem"
                data-yagu-id="menu-option-messages"
                onClick={() => { setOpen(false); setMessagesOpen(true); }}
              >
                Messages
              </button>
            </li>
            <li>
              {/* FIX410.1.1.5 + FIX410.1.1.5.1 <menu-option-versions>:
                  opens <panel-app-versions>. */}
              <button
                type="button"
                role="menuitem"
                data-yagu-id="menu-option-versions"
                onClick={() => { setOpen(false); setVersionsOpen(true); }}
              >
                App versions
              </button>
            </li>
          </ul>
        )}
      </div>
      {visitsOpen && <VisitsPanel onClose={() => setVisitsOpen(false)} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {projectsOpen && <ProjectsPanel onClose={() => setProjectsOpen(false)} />}
      {messagesOpen && (
        <MessagesPanel
          onClose={() => setMessagesOpen(false)}
          projectId={projectId}
        />
      )}
      {versionsOpen && (
        <VersionsPanel onClose={() => setVersionsOpen(false)} />
      )}
    </>
  );
}
