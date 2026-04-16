import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const MAX_RETRIES = 4;
    const RETRY_DELAY = 3000;

    async function fetchHello(attempt) {
      try {
        const r = await fetch(`${API_URL}/api/hello`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        if (!cancelled) setMessage(data.message);
      } catch (e) {
        if (cancelled) return;
        if (attempt < MAX_RETRIES) {
          await new Promise((ok) => setTimeout(ok, RETRY_DELAY));
          if (!cancelled) fetchHello(attempt + 1);
        } else {
          setError(String(e));
        }
      }
    }

    fetchHello(0);
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="hello">
      <h1>
        {error
          ? `Error: ${error}`
          : message || 'Waking up\u2026'}
      </h1>
      <img src="/hello.jpg" alt="Hello" />
    </div>
  );
}
