/**
 * dev.js — launch the local dev environment:
 *   - agent server on port 3001 (file I/O from disk)
 *   - Vite dev server for the React app
 *
 * Usage: npm run dev
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function spawnChild(label, cmd, cmdArgs, opts) {
  const child = spawn(cmd, cmdArgs, { ...opts, cwd: projectRoot });
  child.stdout?.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

const agent = spawnChild('agent', 'node', ['agent/agent.js'], { stdio: 'pipe' });
const vite = spawnChild('vite', 'npx', ['vite'], { stdio: 'pipe', shell: true });

function shutdown() {
  agent.kill();
  vite.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
