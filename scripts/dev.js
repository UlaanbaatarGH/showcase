/**
 * dev.js — launch the local dev environment:
 *   - agent server on port 3001 (file I/O from disk)
 *   - Vite dev server for the React app
 *   - local FastAPI backend on port 8000 (so /api/* proxies locally instead
 *     of hitting the deployed Render backend — see VITE_API_TARGET in
 *     vite.config.js)
 *
 * Usage: npm run dev
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const backendDir = path.resolve(projectRoot, '../backend-dev');
const backendPython = path.join(backendDir, '.venv', 'Scripts', 'python.exe');

function spawnChild(label, cmd, cmdArgs, opts) {
  const child = spawn(cmd, cmdArgs, { cwd: projectRoot, ...opts });
  child.stdout?.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('error', (err) => console.log(`[${label}] failed to start: ${err.message}`));
  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

const agent = spawnChild('agent', 'node', ['agent/agent.js'], { stdio: 'pipe' });
const vite = spawnChild('vite', 'npx', ['vite'], { stdio: 'pipe', shell: true });
const backend = spawnChild('backend', backendPython, ['-m', 'uvicorn', 'main:app', '--reload'], {
  stdio: 'pipe',
  cwd: backendDir,
});

function shutdown() {
  agent.kill();
  vite.kill();
  backend.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
