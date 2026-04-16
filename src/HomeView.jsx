import { useEffect, useState } from 'react';

export default function HomeView({ onEnter }) {
  const [projectName, setProjectName] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/showcase')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setProjectName(data.project?.name ?? ''))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="home">
      <h1>{error ? 'Showcase' : projectName ?? 'Loading\u2026'}</h1>
      {error && <div className="home-err">Backend error: {error}</div>}
      <button
        className="btn-enter"
        onClick={onEnter}
        disabled={projectName === null && !error}
      >
        Enter
      </button>
    </div>
  );
}
