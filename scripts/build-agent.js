/**
 * build-agent.js — packages agent/agent.js into a standalone Windows exe
 * for installation on a PC without Node.js, so it can drive the already
 * deployed Showcase website's local file access. "agent" is the internal/
 * technical name for this process; the user-facing name is "Local App"
 * (see tech/installation) — only the shipped artifact name reflects that.
 *
 * Steps: esbuild bundles the ESM agent to a single CJS file (pkg's ESM
 * loader can't resolve modules from its own snapshot — see agent.js's
 * __filename fallback comment), then pkg packages that into an exe.
 *
 * Output: tech/installation/dist/showcase-local-app.exe
 *
 * Usage: npm run build:agent
 */

import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const bundlePath = path.join(projectRoot, 'agent', '.build', 'agent.cjs');
const outDir = path.resolve(projectRoot, '..', 'installation', 'dist');
const outExe = path.join(outDir, 'showcase-local-app.exe');

// Pin to a version pkg-fetch actually has a prebuilt Windows binary for
// (check https://github.com/yao-pkg/pkg-fetch/releases/tag/v3.6 if this
// starts 404ing — pkg's own node18/20/22 aliases lag behind and fall back
// to compiling Node from source, which needs a full VC++ build toolchain).
const PKG_TARGET = 'node22.23.2-win-x64';

await build({
  entryPoints: [path.join(projectRoot, 'agent', 'agent.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: bundlePath,
  logLevel: 'warning',
});

execFileSync(
  'npx',
  ['pkg', bundlePath, '--targets', PKG_TARGET, '--output', outExe],
  { cwd: projectRoot, stdio: 'inherit', shell: true }
);

console.log(`\nBuilt ${path.relative(projectRoot, outExe)}`);
