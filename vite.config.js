import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production (Vercel) `/api/*` is handled by serverless functions in `api/`.
// In local dev those functions don't run, so proxy `/api/*` to the live backend.
// Set VITE_API_TARGET in .env.local to point at a local backend (e.g. http://127.0.0.1:8000)
// when iterating on the FastAPI code.
const API_TARGET = process.env.VITE_API_TARGET || 'https://showcase-api-muxl.onrender.com';

export default defineConfig({
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
});
