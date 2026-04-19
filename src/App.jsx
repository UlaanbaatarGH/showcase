import { lazy, Suspense, useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';
import { AuthProvider } from './AuthContext.jsx';

const PhotoModule = lazy(() => import('./photo/PhotoModule.jsx'));

function getDefaultView() {
  // Local dev defaults to the admin File Explorer; production defaults to home.
  return import.meta.env.DEV ? 'admin' : 'home';
}

function getViewFromHash() {
  const h = window.location.hash;
  if (h === '#showcase') return 'showcase';
  if (h === '#admin') return 'admin';
  if (h === '#home') return 'home';
  return getDefaultView();
}

function AppBody() {
  const [view, setView] = useState(getViewFromHash);

  useEffect(() => {
    const onHash = () => setView(getViewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (view === 'admin') {
    if (!import.meta.env.DEV) {
      return (
        <div className="sc-error">
          The admin File Explorer is only available when running the app locally.
        </div>
      );
    }
    return (
      <Suspense fallback={<div className="sc-loading">Loading admin…</div>}>
        <PhotoModule />
      </Suspense>
    );
  }

  if (view === 'home') {
    // FIX400.3.1: click a project opens it. Only one project supported end-to-end
    // for now, so we just navigate to #showcase.
    return <HomeView onOpenProject={() => { window.location.hash = '#showcase'; }} />;
  }
  return <ShowcaseView />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppBody />
    </AuthProvider>
  );
}
