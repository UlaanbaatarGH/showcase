import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [message, setMessage] = useState('...');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/hello`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setMessage(data.message))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="hello">
      <h1>{error ? `Error: ${error}` : message}</h1>
      <img src="/hello.jpg" alt="Hello" />
    </div>
  );
}
