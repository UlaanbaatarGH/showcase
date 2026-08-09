import { useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import CatalogueView from './CatalogueView.jsx';
import MyRatingsView from './MyRatingsView.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { LanguageProvider } from './i18n/i18n.jsx';
import { navigate, parseLocation, projectSlug } from './router.js';
import { forceLocalMode, checkCloudReachable } from './data/backend.js';

const isLocalApp = import.meta.env.DEV;

// FIX680.3 <local-start-mode-popup>: local-app-only, shown once at startup —
// blocks HomeView/CatalogueView from mounting until the user picks a mode.
// FIX680.3.1: 'On-line' stays disabled until checkCloudReachable() resolves
// true; it never re-checks after that (FIX680.2 — a later reconnect, or a
// connection that drops right after this check, is not this popup's
// concern, just the existing reactive per-call fallback's).
function LocalStartModePopup({ onChoose }) {
  const [checking, setChecking] = useState(true);
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkCloudReachable().then((ok) => {
      if (!cancelled) { setReachable(ok); setChecking(false); }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="setup-overlay">
      <div className="sc-shrink-box" data-yagu-id="popup-local-start-mode">
        <h3>Local app start mode</h3>
        <div className="sc-shrink-actions">
          <button
            type="button"
            data-yagu-id="button-start-online"
            disabled={checking || !reachable}
            onClick={() => onChoose('online')}
            title={checking ? 'Checking connection…' : (!reachable ? 'No connection to the public DB' : undefined)}
          >
            {checking ? 'Checking…' : 'On-line'}
          </button>
          <button
            type="button"
            data-yagu-id="button-start-offline"
            onClick={() => onChoose('offline')}
          >
            Off-line
          </button>
        </div>
      </div>
    </div>
  );
}

function AppBody() {
  const [route, setRoute] = useState(parseLocation);
  // FIX680.3: decided once per session — local-app builds start gated,
  // online (production) builds skip the popup entirely.
  const [startModeChosen, setStartModeChosen] = useState(!isLocalApp);
  // FIX503.2.10 / FIX503.3.6 / FIX503.3.7 <menu-view>: which of the two
  // views (<view-catalogue> / <view-my-ratings>) is showing for the
  // current project. Client-side only, on purpose — the URL stays on
  // the project (per direct instruction: item-level deep-linking for a
  // specific view is a later, still-TBD feature), so switching views
  // never touches history/pushState.
  const [projectView, setProjectView] = useState('catalogue');
  // Cached from CatalogueView's own fetch (CatalogueView.jsx's
  // onProjectLoaded) so the header's project name and <menu-view>'s
  // visibility (FIX503.4.5: logged-in + rating-enabled projects only)
  // — and everything right of them in the same row — don't bump when
  // switching views. Catalogue is the default view and always fetches
  // first, so by the time My ratings can even be reached these are
  // already populated; My ratings never fetches its own copy.
  const [projectName, setProjectName] = useState(null);
  const [ratingEnabled, setRatingEnabled] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Reset to Catalogue whenever the project itself changes — a view
  // choice made on one project shouldn't leak into the next one opened.
  useEffect(() => {
    setProjectView('catalogue');
    setProjectName(null);
    setRatingEnabled(false);
  }, [route.slug]);

  if (isLocalApp && !startModeChosen) {
    return (
      <LocalStartModePopup
        onChoose={(mode) => {
          // FIX680.3: 'off-line' commits immediately, regardless of what
          // the reachability check said — an explicit user choice, not a
          // fallback. 'on-line' does nothing special: the existing
          // reactive fallback (FIX680.1/.2) is still there as a safety net
          // if the connection turns out to not actually work.
          if (mode === 'offline') forceLocalMode();
          setStartModeChosen(true);
        }}
      />
    );
  }

  if (route.view === 'home') {
    return (
      <HomeView
        onOpenProject={(p) =>
          // FIX352.3.4: prefer the project's official slug from the
          // server (stable across renames). Fall back to a fresh
          // slugify of the name for legacy responses without it.
          navigate(`/${p.official_slug || projectSlug(p.name)}`)
        }
      />
    );
  }

  // route.view === 'project'
  if (projectView === 'my-ratings') {
    return (
      <MyRatingsView
        slug={route.slug}
        projectName={projectName}
        ratingEnabled={ratingEnabled}
        onNavigateHome={() => navigate('/')}
        currentView={projectView}
        onSwitchView={setProjectView}
      />
    );
  }
  return (
    <CatalogueView
      slug={route.slug}
      initialItemId={route.item}
      onNavigateHome={() => navigate('/')}
      currentView={projectView}
      onSwitchView={setProjectView}
      initialProjectName={projectName}
      initialRatingEnabled={ratingEnabled}
      onProjectLoaded={(name, enabled) => { setProjectName(name); setRatingEnabled(enabled); }}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppBody />
      </LanguageProvider>
    </AuthProvider>
  );
}
