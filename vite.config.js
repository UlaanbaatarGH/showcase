import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In production (Vercel) `/api/*` is handled by serverless functions in `api/`.
// In local dev those functions don't run, so proxy `/api/*` to the live backend.
// Set VITE_API_TARGET in .env.local to point at a local backend (e.g. http://127.0.0.1:8000)
// when iterating on the FastAPI code.
export default defineConfig(({ mode }) => {
  // Object-form config only sees real OS env vars in process.env; .env.local
  // is loaded separately by Vite for import.meta.env, so it must be read here
  // via loadEnv() to affect this file's own proxy target.
  const env = loadEnv(mode, process.cwd(), '');
  const API_TARGET = env.VITE_API_TARGET || 'https://showcase-api-muxl.onrender.com';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
