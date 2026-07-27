import { useEffect, useState } from 'react';
import HomeView from './HomeView.jsx';
import ShowcaseView from './ShowcaseView.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { LanguageProvider } from './i18n/i18n.jsx';
import { navigate, parseLocation, projectSlug } from './router.js';

function AppBody() {
  const [route, setRoute] = useState(parseLocation);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
