import { lazy, Suspense, useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { navigate, parseLocation, projectSlug } from './router.js';

const PhotoModule = lazy(() => import('./photo/PhotoModule.jsx'));

function AppBody() {
  const [route, setRoute] = useState(parseLocation);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Dev convenience: `npm run dev` on a bare URL lands on the admin
  // File Explorer, matching the pre-router behavior. Fires once on
  // mount; afterwards the user navigates freely between views.
  useEffect(() => {
    if (import.meta.env.DEV && window.location.pathname === '/') {
      navigate('/admin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (route.view === 'admin') {
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

  if (route.view === 'home') {
    return (
      <HomeView
        onOpenProject={(p) => navigate(`/${projectSlug(p.name)}`)}
      />
    );
  }

  // route.view === 'project'
  return (
    <ShowcaseView
      slug={route.slug}
      onNavigateHome={() => navigate('/')}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppBody />
    </AuthProvider>
  );
}
