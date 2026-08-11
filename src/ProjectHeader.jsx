import { useEffect, useRef, useState } from 'react';
import { IconHome, IconSignOut } from './Icons.jsx';
import { useAuth } from './AuthContext.jsx';

// FIX503.2.1/.2.2 + FIX701.2.1/.2.2 + FIX503.2.10 / FIX701.2.3
// <menu-view>: the LEFT-aligned header elements shared by
// <panel-catalogue-header> (Catalogue view, FIX503) and
// <panel-my-ratings-header> (My ratings view, FIX701) — Home, project
// name, the View switcher. Split from ProjectHeaderRight (below) rather
// than one wrapping component so each caller can keep its own existing
// middle content (Columns/Grouping/Import/Admin/Setup for Catalogue;
// nothing for My ratings) exactly where it already lives in its own
// JSX, instead of threading it through as children.
//
// FIX503.2.11 / .2.11.0 <select-catalogue-show-as>: only for the
// Catalogue view (currentView === 'catalogue' — CatalogueView.jsx always
// passes 'catalogue' here, MyRatingsView.jsx always passes 'my-ratings',
// so this doesn't depend on <menu-view> itself being visible/available).
// The showAs value and its setter live in CatalogueView (only place that
// needs to know which panel to render), passed through as plain props —
// undefined for MyRatingsView's caller, which just never renders this.
export function ProjectHeaderLeft({
  projectName, onNavigateHome, currentView, onSwitchView, ratingEnabled, isRegisteredRater,
  showAs, onShowAsChange,
}) {
  const { profile } = useAuth();
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDown = (e) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [viewMenuOpen]);

  return (
    <>
      {/* FIX503.2.1 + .2.1.0 + .2.1.1 + FIX503.3.1 / FIX701.2.1 + .2.1.0
          <button-home>: icon button, navigates to the home page. */}
      <button
        type="button"
        className="sc-icon-btn"
        data-yagu-id="button-home"
        onClick={onNavigateHome}
        aria-label="Home"
        title="Home"
      >
        <IconHome size={22} />
      </button>
      {/* FIX503.2.2 + .2.2.0 / FIX701.2.2 + .2.2.0 <label-project-name>. */}
      <h1 className="sc-project-title" data-yagu-id="label-project-name">
        {projectName ?? 'Showcase'}
      </h1>
      {/* FIX503.2.10 + .2.10.0 + .2.10.2 / FIX701.2.3 + .2.3.0 <menu-view>:
          switch between <view-catalogue> (FIX503.3.6) and
          <view-my-ratings> (FIX503.3.7). FIX503.4.5 (updated): only
          visible when logged in, the project has rating enabled
          (<field-enable-rating> / rating_setup.enabled), AND the caller
          is registered (and enabled) in <table-users-allowed-to-rate> —
          otherwise there's nothing to show in My ratings, and per the
          backend's own set_item_rating check (FIX507.2.3.1.3) they
          couldn't rate anything from it either. */}
      {profile && ratingEnabled && isRegisteredRater && (
        <div className="sc-menu" data-yagu-id="menu-view" ref={viewMenuRef}>
          <button
            type="button"
            className="sc-menu-trigger"
            onClick={() => setViewMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={viewMenuOpen}
          >
            View ▾
          </button>
          {viewMenuOpen && (
            <ul className="sc-menu-items" role="menu">
              <li>
                {/* FIX503.2.10.2.1 + FIX503.3.6 <menu-view-catalogue>. */}
                <button
                  type="button"
                  role="menuitem"
                  data-yagu-id="menu-view-catalogue"
                  onClick={() => { setViewMenuOpen(false); onSwitchView('catalogue'); }}
                >
                  {currentView === 'catalogue' ? '✓ ' : ''}Catalogue
                </button>
              </li>
              <li>
                {/* FIX503.2.10.2.2 + FIX503.3.7 <menu-view-my-ratings>. */}
                <button
                  type="button"
                  role="menuitem"
                  data-yagu-id="menu-view-my-ratings"
                  onClick={() => { setViewMenuOpen(false); onSwitchView('my-ratings'); }}
                >
                  {currentView === 'my-ratings' ? '✓ ' : ''}My ratings
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      {/* FIX503.2.11 <select-catalogue-show-as>: '(x) Gallery list (x)
          Item list' radio pair, default Gallery list (FIX503.2.11.2 —
          CatalogueView's showAs state itself defaults to 'gallery'). */}
      {currentView === 'catalogue' && onShowAsChange && (
        <div className="sc-show-as-selector" data-yagu-id="select-catalogue-show-as">
          <label>
            <input
              type="radio"
              name="catalogue-show-as"
              checked={showAs === 'gallery'}
              onChange={() => onShowAsChange('gallery')}
            />
            Gallery list
          </label>
          <label>
            <input
              type="radio"
              name="catalogue-show-as"
              checked={showAs === 'list'}
              onChange={() => onShowAsChange('list')}
            />
            Item list
          </label>
        </div>
      )}
    </>
  );
}

// FIX503.2.9/.2.8 + FIX701.2.9/.2.8 {user} + <button-sign-out>: the
// RIGHT-most header elements, shared the same way as ProjectHeaderLeft
// above. Reads profile/signOut itself (AuthContext) so callers don't
// need to thread them through as props.
export function ProjectHeaderRight() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <>
      {/* FIX503.2.9 + .2.9.0 + .2.9.1 / FIX701.2.9 + .2.9.0 {user}. */}
      <span className="sc-user-label">{profile.login_name}</span>
      {/* FIX503.2.8 + .2.8.0 + .2.8.2 / FIX701.2.8 + .2.8.0
          <button-sign-out>. */}
      <button
        type="button"
        className="sc-icon-btn"
        data-yagu-id="button-sign-out"
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
      >
        <IconSignOut size={22} />
      </button>
    </>
  );
}
