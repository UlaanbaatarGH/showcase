import { useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { LanguageProvider } from './i18n/i18n.jsx';
import { navigate, parseLocation, projectSlug } from './router.js';
import { forceLocalMode, checkCloudReachable } from './data/backend.js';

const isLocalApp = import.meta.env.DEV;

// FIX680.3 <local-start-mode-popup>: local-app-only, shown once at startup —
// blocks HomeView/ShowcaseView from mounting until the user picks a mode.
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

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
  return (
    <ShowcaseView
      slug={route.slug}
      initialItemId={route.item}
      onNavigateHome={() => navigate('/')}
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
