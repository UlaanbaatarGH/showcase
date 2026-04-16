import { useEffect, useState } from 'react';

export default function App() {
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setMessage(data.message))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="hello">
      <h1>
        {error
          ? `Error: ${error}`
          : message || 'Loading\u2026'}
      </h1>
      <img src="/hello.jpg" alt="Hello" />
    </div>
  );
}
