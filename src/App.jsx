import { lazy, Suspense, useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';

const PhotoModule = lazy(() => import('./photo/PhotoModule.jsx'));

function getViewFromHash() {
  const h = window.location.hash;
  if (h === '#showcase') return 'showcase';
  if (h === '#admin') return 'admin';
  return 'home';
}

export default function App() {
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
    return <HomeView onEnter={() => { window.location.hash = '#showcase'; }} />;
  }
  return <ShowcaseView />;
}
