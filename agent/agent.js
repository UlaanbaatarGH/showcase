// agent.js — TELL Local Agent
// Runs on http://localhost:3001
// Provides OS-level capabilities to the TELL browser app.

import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createConnection } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = 3001;

let targetVite = null; // reference to the spawned target Vite process
let registeredFilePath = null; // currently registered file for read/write (/file/open + /file/save)
let targetStartupProject = null; // --project path for the currently running target

app.use(express.json({ limit: '50mb' })); // FIX501.4: raised for base64 image save

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () =>
    console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}  ${res.statusCode}  ${Date.now()-start}ms`)
  );
  next();
});

// ── TECH1.4: Project search helpers ───────────────────────────────────────────

function getProjectRoot() {
  return process.env.TELL_PROJECT_ROOT || os.homedir();
}

function findProjects(dir, root) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  const hasTell = entries.some(e => e.isFile() && e.name === 'project.tell');
  if (hasTell) {
    results.push({
      name: path.basename(dir),
      fullPath: dir,
      relativePath: path.relative(root, dir)
    });
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      results = results.concat(findProjects(path.join(dir, entry.name), root));
    }
  }
  return results;
}

// ── GET /agent/status ─────────────────────────────────────────────────────────

app.get('/agent/status', (req, res) => {
  res.json({
    ready: true,
    targetViteRunning: targetVite !== null
  });
});

// ── GET /agent/file/list ──────────────────────────────────────────────────────
// TECH1.5.3: Lists .md files directly inside a given folder.
// Query param: path (full path to folder)

// ── GET /agent/dir/list ───────────────────────────────────────────────────────
// FIX501.3: Returns all entries (folders + files) for a given directory path.
// Also supports renaming (POST /agent/dir/rename) and creating folders (POST /agent/dir/mkdir).
// Query param: path
app.get('/agent/dir/list', (req, res) => {
  const { path: dirPath } = req.query;
  if (!dirPath) return res.status(400).json({ error: 'path is required' });
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'folder' : 'file' }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ entries: result });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'directory not found' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/dir/rename ───────────────────────────────────────────────────
// FIX501.3.3.1: Rename a file or folder.
// Body: { oldPath, newPath }
app.post('/agent/dir/rename', (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });
  try {
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/dir/mkdir ────────────────────────────────────────────────────
// FIX501.3.3.3: Create a new folder.
// Body: { path }
app.post('/agent/dir/mkdir', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'path is required' });
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/dir/copy ─────────────────────────────────────────────────────
// FIX501.50.9.2: Recursively copy a file or folder.
// Body: { src, dst }
app.post('/agent/dir/copy', (req, res) => {
  const { src, dst } = req.body;
  if (!src || !dst) return res.status(400).json({ error: 'src and dst are required' });
  try {
    fs.cpSync(src, dst, { recursive: true, force: false, errorOnExist: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/dir/rmdir ────────────────────────────────────────────────────
// FIX501.3.3.4: Remove a folder (recursively) or file.
// Body: { path }
app.post('/agent/dir/rmdir', (req, res) => {
  const { path: targetPath } = req.body;
  if (!targetPath) return res.status(400).json({ error: 'path is required' });
  try {
    const st = fs.statSync(targetPath);
    if (st.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ ok: true });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /agent/dir/image ─────────────────────────────────────────────────────
// FIX501.3.3.10: Serve an image file as binary for display in the browser.
// Query param: path
app.get('/agent/dir/image', (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.set('Content-Type', mime);
    res.send(data);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'file not found' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/dir/image/save ───────────────────────────────────────────────
// FIX501.4.4.11: Destructive save — write base64-encoded image data to disk.
// Body: { path: string, data: string (base64) }
app.post('/agent/dir/image/save', (req, res) => {
  const { path: filePath, data } = req.body;
  if (!filePath || !data) return res.status(400).json({ error: 'path and data are required' });
  try {
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buf);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/agent/file/list', (req, res) => {
  const { path: folderPath } = req.query;
  if (!folderPath) return res.status(400).json({ error: 'path is required' });
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && (e.name.endsWith('.txt') || e.name.endsWith('.md')))
      .map(e => e.name)
      .sort();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /file/open ───────────────────────────────────────────────────────────
// TECH1.5.4: Registers a file path and returns its content.
// Body: { path: string }

app.post('/file/open', (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  registeredFilePath = filePath;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, path: filePath });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ path: filePath });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /file/close ─────────────────────────────────────────────────────────
// Unregisters the current file so the next test starts with a clean (empty) state.

app.post('/file/close', (req, res) => {
  registeredFilePath = null;
  res.json({ ok: true });
});

// ── POST /file/save ───────────────────────────────────────────────────────────
// TECH1.5.5: Saves content to the registered file path.
// Body: { content: string }

app.post('/file/save', (req, res) => {
  const { content } = req.body;
  if (!registeredFilePath) return res.status(400).json({ error: 'No file registered. Call /file/open first.' });
  if (content === undefined) return res.status(400).json({ error: 'content is required' });
  try {
    fs.writeFileSync(registeredFilePath, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /file/status ──────────────────────────────────────────────────────────
// TECH1.5.6: Returns whether a file path is registered.

app.get('/file/status', (req, res) => {
  res.json({ ready: registeredFilePath !== null, currentPath: registeredFilePath });
});

// ── GET /file/content ─────────────────────────────────────────────────────────
// Returns the content of the registered file (used by the app in test mode at startup).

app.get('/file/content', (req, res) => {
  if (!registeredFilePath) return res.status(404).json({ error: 'No file registered' });
  try {
    const content = fs.readFileSync(registeredFilePath, 'utf8');
    res.json({ content, path: registeredFilePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /agent/projects ───────────────────────────────────────────────────────
// TECH1.4: Returns all folders containing a project.tell file, searched
// recursively from TELL_PROJECT_ROOT (or os.homedir() if not set).

app.get('/agent/projects', (req, res) => {
  const root = getProjectRoot();
  const projects = findProjects(root, root);
  res.json({ root, projects });
});

// ── GET /agent/project/read ───────────────────────────────────────────────────
// TECH1.5.1: Reads project.tell from the given project folder path.
// Query param: path (full path to the project folder)

app.get('/agent/project/read', (req, res) => {
  const { path: projectPath } = req.query;
  if (!projectPath) return res.status(400).json({ error: 'path is required' });
  const filePath = path.join(projectPath, 'project.tell');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'project.tell not found' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /agent/project/write ─────────────────────────────────────────────────
// TECH1.5.2: Writes project.tell to the given project folder path.
// Body: { path: string, content: string }

app.post('/agent/project/write', (req, res) => {
  const { path: projectPath, content } = req.body;
  if (!projectPath) return res.status(400).json({ error: 'path is required' });
  if (content === undefined) return res.status(400).json({ error: 'content is required' });
  const filePath = path.join(projectPath, 'project.tell');
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /file/stat ────────────────────────────────────────────────────────────
// Returns existence and mtime (ms since epoch) for a file path.
// Query param: path

app.get('/file/stat', (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  try {
    const st = fs.statSync(filePath);
    res.json({ exists: true, mtime: st.mtimeMs, size: st.size });
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ exists: false, mtime: 0, size: 0 });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /file/read ────────────────────────────────────────────────────────────
// Reads an arbitrary file without registering it as the current file.
// Query param: path

app.get('/file/read', (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, path: filePath });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ content: '', path: filePath });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /file/write ──────────────────────────────────────────────────────────
// Writes arbitrary content to any file path; creates parent dirs as needed.
// Body: { path: string, content: string }

app.post('/file/write', (req, res) => {
  const { path: filePath, content } = req.body;
  console.log(`[file/write] path=${filePath} content-length=${content?.length}`);
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  if (content === undefined) return res.status(400).json({ error: 'content is required' });
  try {
    const dir = path.dirname(filePath);
    console.log(`[file/write] mkdirSync ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[file/write] written ok`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[file/write] ERROR: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /file/delete ─────────────────────────────────────────────────────────
// FIX149.4.6 / FIX453.4.6: Deletes a file; silently succeeds if file does not exist.
// Body: { path: string }

app.post('/file/delete', (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') return res.status(500).json({ error: err.message });
  }
  res.json({ ok: true });
});

// ── POST /agent/search ───────────────────────────────────────────────────────
// FIX104.10.2.3: Search for a regex pattern in project code files.
// Body: { locations: [{path, recursive}], extensions: ['.md', '.js'], pattern: string }
// Returns: { matches: [{file, line, text}] }

app.post('/agent/search', (req, res) => {
  const { locations = [], extensions = [], pattern } = req.body;
  if (!pattern) return res.status(400).json({ error: 'pattern is required' });
  let regex;
  try { regex = new RegExp(pattern); } catch { return res.status(400).json({ error: 'invalid pattern' }); }

  const exts = (extensions || []).map(e => e.trim().toLowerCase()).filter(Boolean);
  const matches = [];

  function searchFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (new RegExp(pattern).test(line)) {
          matches.push({ file: filePath, line: i + 1, text: line.trimEnd() });
        }
      });
    } catch { /* skip unreadable files */ }
  }

  function searchDir(dirPath, recursive) {
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.length === 0 || exts.includes(ext)) searchFile(full);
      } else if (entry.isDirectory() && recursive) {
        searchDir(full, true);
      }
    }
  }

  for (const loc of locations) {
    const locPath = loc.path;
    if (!locPath) continue;
    let stat;
    try { stat = fs.statSync(locPath); } catch { continue; }
    if (stat.isDirectory()) {
      searchDir(locPath, !!loc.recursive);
    } else if (stat.isFile()) {
      const ext = path.extname(locPath).toLowerCase();
      if (exts.length === 0 || exts.includes(ext)) searchFile(locPath);
    }
  }

  res.json({ matches });
});

// ── POST /runner/start-target ─────────────────────────────────────────────────
// FIX120.2.5.1: Spawns the target app using the configured directory + command.
// Kills any previously running target first.
//
// Body: { directory: string, runCommand: string, runParameters: string }
//   directory      — FIX120.2.5.1.1 cwd for the spawned process
//   runCommand     — FIX120.2.5.1.2 base command (e.g. 'npm run dev')
//   runParameters  — FIX120.2.5.1.3 extra params appended (e.g. '-- --port 5174 --project tests')
//
// The port to poll is extracted from runParameters ('--port N'), defaulting to 5174.

app.post('/runner/start-target', (req, res) => {
  if (targetVite) {
    targetVite.kill();
    targetVite = null;
  }

  const directory  = req.body?.directory  || path.resolve(__dirname, '..');
  const runCommand = (req.body?.runCommand || 'npx vite --port 5174').split('\n').map(l => l.trim()).filter(Boolean).join(' ');

  // FIX120.2.5.1.2: extract --port N from runCommand to know which port to poll
  const portMatch = runCommand.match(/--port[=\s]+(\d+)/);
  const targetPort = portMatch ? parseInt(portMatch[1], 10) : 5174;

  // Store --project path so /agent/startup-project can return it to the tested app
  const projMatch = runCommand.match(/--project\s+(\S+)/);
  targetStartupProject = projMatch ? path.resolve(directory, projMatch[1]) : null;

  console.log(`[start-target] cwd=${directory} cmd=${runCommand} port=${targetPort}`);

  targetVite = spawn(runCommand, [], {
    cwd: directory,
    shell: true,
    env: { ...process.env },
  });

  targetVite.on('error', err => {
    console.error('Target app error:', err.message);
    targetVite = null;
  });

  targetVite.on('exit', () => {
    targetVite = null;
  });

  // Poll until targetPort responds, then confirm
  const MAX_WAIT = 15000;
  const INTERVAL = 200;
  const start = Date.now();

  const poll = setInterval(() => {
    const socket = createConnection({ port: targetPort, host: 'localhost' });
    socket.on('connect', () => {
      socket.destroy();
      clearInterval(poll);
      res.json({ started: true, port: targetPort });
    });
    socket.on('error', () => {
      socket.destroy();
      if (Date.now() - start > MAX_WAIT) {
        clearInterval(poll);
        res.status(504).json({ error: `Target app did not start within 15s on port ${targetPort}` });
      }
    });
  }, INTERVAL);
});

// ── POST /runner/run-test ─────────────────────────────────────────────────────
// Spawns Playwright for the given script and streams output via SSE.
//
// Body: { script: "<absolute path to .playwright.js file>" }
//
// SSE events:
//   data: <log line>        — stdout/stderr from Playwright
//   data: [DONE:0]          — test passed (exit code 0)
//   data: [DONE:1]          — test failed (exit code 1)

app.post('/runner/run-test', (req, res) => {
  const { script, headed } = req.body;

  if (!script) {
    return res.status(400).json({ error: 'script is required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = line => res.write(`data: ${line}\n\n`);
  let pwDone = false;

  console.log(`[run-test] script=${script} headed=${headed}`);
  send(`Running: ${script}`);

  // Find the nearest playwright.config.js by walking up from the script directory.
  // This dir is the cwd for playwright so it finds the config and testMatch patterns work.
  let configDir = path.dirname(script);
  while (true) {
    if (fs.existsSync(path.join(configDir, 'playwright.config.js'))) break;
    const parent = path.dirname(configDir);
    if (parent === configDir) {
      // Fallback: project root (one level up from agent/)
      configDir = path.resolve(__dirname, '..');
      break;
    }
    configDir = parent;
  }
  // Relative path from configDir to script (playwright filters by this path as a regex)
  const relScript = path.relative(configDir, script).replace(/\\/g, '/');
  // Escape regex special chars so script IDs like "(4)" are treated as literals, not groups
  const relScriptEscaped = relScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pwCmd = `npx playwright test "${relScriptEscaped}" --reporter=line${headed ? ' --headed' : ''}`;
  console.log(`[run-test] configDir=${configDir} relScript=${relScript}`);
  console.log(`[run-test] cmd=${pwCmd}`);
  const pw = spawn(pwCmd, [], {
    cwd: configDir,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  pw.stdout.on('data', data =>
    data.toString().split('\n')
      .filter(l => l.trim())
      .forEach(l => { console.log(`[PW] ${l}`); send(l); })
  );

  pw.stderr.on('data', data =>
    data.toString().split('\n')
      .filter(l => l.trim())
      .forEach(l => { console.error(`[PW:err] ${l}`); send(l); })
  );

  pw.on('close', (code, signal) => {
    pwDone = true;
    console.log(`[run-test] pw close code=${code} signal=${signal}`);
    send(`[DONE:${code}]`);
    res.end();
  });

  pw.on('error', err => {
    pwDone = true;
    console.error(`[run-test] spawn error: ${err.message}`);
    send(`[ERROR:${err.message}]`);
    res.end();
  });

  // Clean up if browser disconnects before playwright finishes
  // Use res.on('close') — fires when the SSE *response* connection drops.
  // req.on('close') fires too early (after the POST body is consumed by express.json).
  res.on('close', () => {
    console.log(`[run-test] res closed, pwDone=${pwDone}, pw.pid=${pw.pid}`);
    if (!pwDone) pw.kill();
  });
});

// ── GET /agent/startup-project ────────────────────────────────────────────────
// Returns the project folder passed via --project at launch (TELL_STARTUP_PROJECT env var).
// The browser app calls this on startup to auto-open a project without user interaction.

app.get('/agent/startup-project', (req, res) => {
  const projectPath = targetStartupProject || process.env.TELL_STARTUP_PROJECT || null;
  res.json({ projectPath });
});

// ── start ─────────────────────────────────────────────────────────────────────

function printRoutes() {
  console.log(`TELL Local Agent running on http://localhost:${PORT}`);
  console.log(`  GET  /agent/status          — health check`);
  console.log(`  GET  /agent/startup-project — startup project folder (--project arg)`);
  console.log(`  GET  /agent/file/list       — list .md files in a folder`);
  console.log(`  POST /file/open             — register file path + read content`);
  console.log(`  POST /file/save             — write to registered file`);
  console.log(`  GET  /file/status           — registered file status`);
  console.log(`  GET  /file/content          — content of registered file`);
  console.log(`  GET  /file/stat             — file existence + mtime`);
  console.log(`  GET  /file/read             — read arbitrary file (no registration)`);
  console.log(`  POST /file/write            — write arbitrary file (creates dirs)`);
  console.log(`  GET  /agent/projects        — list project folders (TECH1.4)`);
  console.log(`  GET  /agent/project/read    — read project.tell (TECH1.5.1)`);
  console.log(`  POST /agent/project/write   — write project.tell (TECH1.5.2)`);
  console.log(`  POST /runner/start-target   — spawn target Vite on port 5174`);
  console.log(`  POST /runner/run-test       — run Playwright test, stream results`);
}

const server = app.listen(PORT, printRoutes);

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use — killing previous agent and restarting…`);
    // Kill the process holding the port, then retry
    const killer = spawn('cmd', ['/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /PID %a /F`], { shell: false });
    killer.on('close', () => {
      setTimeout(() => {
        const s2 = app.listen(PORT, printRoutes);
        s2.on('error', e => { console.error('Failed to restart agent:', e.message); process.exit(1); });
      }, 500);
    });
  } else {
    console.error('Agent error:', err.message);
    process.exit(1);
  }
});
