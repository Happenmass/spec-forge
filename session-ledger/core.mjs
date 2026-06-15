// session-ledger core — shared by the MCP server (server.mjs) and the hook entry (hook.mjs).
//
// Design rules:
//   * git is the source of truth; the ledger only annotates it. Entries whose files
//     are clean again are lazily archived ("reconciled") on every query.
//   * Appends are O_APPEND-atomic per line; only reconciliation rewrites files, under
//     a best-effort lock. Losing a racing append is benign (the file shows up as
//     "unannotated" later and re-warns once).
//   * Everything fails open: a broken ledger must never block an edit.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const LEDGER_HOME =
  process.env.SESSION_LEDGER_HOME || path.join(os.homedir(), '.claude', 'session-ledger');

const RECONCILE_LOCK_STALE_MS = 30_000;
const BINDING_REFRESH_MS = 10 * 60_000;

function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      ...opts,
    });
  } catch {
    return null;
  }
}

export function debugLog(ledgerDir, msg) {
  if (!process.env.SESSION_LEDGER_DEBUG) return;
  try {
    fs.appendFileSync(path.join(ledgerDir, 'debug.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// ---------------------------------------------------------------------------
// Ledger location (indexed by working directory; git toplevel when available,
// so sessions started in different subdirectories of one repo share a ledger)
// ---------------------------------------------------------------------------

// realpath that tolerates not-yet-existing leaves (e.g. a Write creating a new
// file): canonicalizes the longest existing ancestor and re-appends the rest.
// Needed because macOS hands out both /tmp/... and /private/tmp/... spellings.
export function safeRealpath(p) {
  let cur = p;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest.slice().reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return p;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function resolveProjectRoot(cwd) {
  const out = sh('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (out && out.trim()) return out.trim(); // git already returns a canonical path
  return safeRealpath(path.resolve(cwd));
}

export function ledgerDirFor(projectRoot) {
  const hash = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
  const slug = `${path.basename(projectRoot).replace(/[^\w.-]+/g, '_')}-${hash}`;
  const dir = path.join(LEDGER_HOME, slug);
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bindings'), { recursive: true });
  const meta = path.join(dir, 'meta.json');
  if (!fs.existsSync(meta)) {
    fs.writeFileSync(meta, JSON.stringify({ root: projectRoot }) + '\n');
  }
  return dir;
}

export function loadContext(cwd) {
  const projectRoot = resolveProjectRoot(cwd || process.cwd());
  const ledgerDir = ledgerDirFor(projectRoot);
  return { projectRoot, ledgerDir };
}

// ---------------------------------------------------------------------------
// Events — one JSONL file per session
//   {type:"task",   ts, goal, planned_files?}
//   {type:"write",  ts, file, tool}
//   {type:"warned", ts, file}            (warn-once marker)
// ---------------------------------------------------------------------------

export function appendEvent(ledgerDir, sessionId, event) {
  const file = path.join(ledgerDir, 'sessions', `${sessionId}.jsonl`);
  fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), ...event }) + '\n');
}

function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

export function readEventsBySession(ledgerDir) {
  const dir = path.join(ledgerDir, 'sessions');
  const map = new Map();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {}
  for (const f of names) {
    if (!f.endsWith('.jsonl')) continue;
    try {
      map.set(f.slice(0, -6), parseJsonl(fs.readFileSync(path.join(dir, f), 'utf8')));
    } catch {}
  }
  return map;
}

// Derived per-session state. Writes are attributed to whatever task was current
// at the time of the write (events are chronological within a session file).
export function buildState(eventsBySession) {
  const sessions = new Map();
  for (const [sid, events] of eventsBySession) {
    const s = { task: null, writes: new Map(), warned: new Set(), planned: new Set() };
    for (const e of events) {
      if (e.type === 'task') {
        s.task = { goal: e.goal, ts: e.ts };
        s.planned = new Set(e.planned_files || []);
      } else if (e.type === 'write' && e.file) {
        const w = s.writes.get(e.file) || { count: 0, firstTs: e.ts, goal: null };
        w.count += 1;
        w.lastTs = e.ts;
        w.tool = e.tool;
        w.goal = s.task ? s.task.goal : w.goal;
        s.writes.set(e.file, w);
      } else if (e.type === 'warned' && e.file) {
        s.warned.add(e.file);
      }
    }
    sessions.set(sid, s);
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Git helpers — workspace-aware. A "workspace" is projectRoot plus the git
// repos covering it: projectRoot itself when it is a repo, otherwise its
// immediate child repos (multi-repo workspace, e.g. ~/code/ws/{repoA,repoB}).
// ---------------------------------------------------------------------------

const MAX_WORKSPACE_REPOS = 16;

// [{dir, prefix}] — prefix is '' when projectRoot is the repo, 'child/' for
// sub-repos. Empty array → no git coverage at all (plain directory), or more
// sub-repos than we are willing to `git status` on every write (fail open to
// the no-git behavior: records kept, never reconciled).
export function workspaceRepos(projectRoot) {
  try {
    if (fs.existsSync(path.join(projectRoot, '.git'))) return [{ dir: projectRoot, prefix: '' }];
  } catch {
    return [];
  }
  const repos = [];
  let entries = [];
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {}
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    try {
      if (!fs.existsSync(path.join(projectRoot, e.name, '.git'))) continue;
    } catch {
      continue;
    }
    repos.push({ dir: path.join(projectRoot, e.name), prefix: `${e.name}/` });
    if (repos.length > MAX_WORKSPACE_REPOS) return [];
  }
  return repos;
}

// The repo whose subtree contains relFile, or null (file covered by no repo).
export function repoFor(repos, relFile) {
  for (const r of repos) if (!r.prefix || relFile.startsWith(r.prefix)) return r;
  return null;
}

// true (has uncommitted changes) / false (provably clean) / null (unknown —
// no git, a status failure, or the file sits outside every covering repo).
// Only `false` may archive an entry; `null` must keep it.
export function fileDirtiness(dirty, repos, relFile) {
  if (dirty === null) return null;
  if (dirty.has(relFile)) return true;
  return repoFor(repos, relFile) ? false : null;
}

// Set of dirty paths relative to projectRoot (union across covering repos),
// or null when nothing is covered or any repo's status failed — partial
// knowledge could falsely archive entries, so it degrades to "unknown".
export function gitDirtyFiles(projectRoot, repos = workspaceRepos(projectRoot)) {
  if (!repos.length) return null;
  const files = new Set();
  for (const r of repos) {
    const out = sh('git', ['status', '--porcelain', '-uall', '-z'], { cwd: r.dir });
    if (out === null) return null;
    const parts = out.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.length < 4) continue;
      files.add(r.prefix + p.slice(3));
      if (p[0] === 'R' || p[0] === 'C') i++; // skip the "orig -> " companion record
    }
  }
  return files;
}

export function gitLastCommit(projectRoot, relFile, repos = workspaceRepos(projectRoot)) {
  const repo = repoFor(repos, relFile);
  if (!repo) return null;
  const out = sh('git', ['log', '-1', '--format=%h%x00%ct%x00%s', '--', relFile.slice(repo.prefix.length)], {
    cwd: repo.dir,
  });
  if (!out || !out.trim()) return null;
  const [sha, ct, subject] = out.trim().split('\0');
  return { sha, ts: Number(ct) * 1000, subject };
}

// ---------------------------------------------------------------------------
// Lazy reconciliation: entries whose files are clean again get archived with a
// short commit traceback, then removed from the active ledger.
// ---------------------------------------------------------------------------

export function reconcile(ledgerDir, projectRoot) {
  const repos = workspaceRepos(projectRoot);
  const dirty = gitDirtyFiles(projectRoot, repos);
  if (dirty === null) return; // no git — nothing to reconcile against

  const lock = path.join(ledgerDir, '.reconcile.lock');
  try {
    fs.mkdirSync(lock);
  } catch {
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs < RECONCILE_LOCK_STALE_MS) return;
    } catch {
      return;
    }
  }
  try {
    const sessionsDir = path.join(ledgerDir, 'sessions');
    for (const f of fs.readdirSync(sessionsDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(sessionsDir, f);
      const sid = f.slice(0, -6);
      const events = parseJsonl(fs.readFileSync(full, 'utf8'));
      const cleanFiles = new Set();
      for (const e of events) {
        if (
          (e.type === 'write' || e.type === 'warned') &&
          e.file &&
          fileDirtiness(dirty, repos, e.file) === false
        ) {
          cleanFiles.add(e.file);
        }
      }
      if (!cleanFiles.size) continue;

      const state = buildState(new Map([[sid, events]])).get(sid);
      const archived = [];
      for (const file of cleanFiles) {
        const w = state.writes.get(file);
        if (!w) continue; // warned-only marker: drop silently so future conflicts re-warn
        const commit = gitLastCommit(projectRoot, file, repos);
        const committed = commit && commit.ts >= w.lastTs - 60_000;
        archived.push({
          ts: Date.now(),
          session: sid,
          file,
          goal: w.goal,
          writes: w.count,
          lastWriteTs: w.lastTs,
          status: committed ? 'committed' : commit ? 'reverted' : 'discarded',
          commit: commit ? { sha: commit.sha, subject: commit.subject } : null,
        });
      }
      if (archived.length) {
        fs.appendFileSync(
          path.join(ledgerDir, 'archive.jsonl'),
          archived.map((a) => JSON.stringify(a)).join('\n') + '\n'
        );
      }
      const kept = events.filter(
        (e) => !((e.type === 'write' || e.type === 'warned') && cleanFiles.has(e.file))
      );
      const tmp = `${full}.tmp`;
      fs.writeFileSync(tmp, kept.length ? kept.map((e) => JSON.stringify(e)).join('\n') + '\n' : '');
      fs.renameSync(tmp, full);
    }
  } finally {
    try {
      fs.rmdirSync(lock);
    } catch {}
  }
}

export function readArchive(ledgerDir, limit = 10) {
  const f = path.join(ledgerDir, 'archive.jsonl');
  let text;
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch {
    return [];
  }
  return parseJsonl(text).slice(-limit).reverse();
}

// ---------------------------------------------------------------------------
// Session binding — how the MCP server learns which session it belongs to.
//
// Hooks receive session_id on stdin and record their ancestor PID chain; the
// MCP server walks its own ancestor chain and picks the binding whose chain it
// meets closest to the leaf (that common ancestor is the claude process both
// were spawned from). Two concurrent sessions only share ancestors above their
// respective claude processes, so the closest match is unambiguous.
// ---------------------------------------------------------------------------

export function ancestorPids(startPid, depth = 12) {
  const pids = [];
  let pid = startPid;
  for (let i = 0; i < depth && pid > 1; i++) {
    pids.push(pid);
    const out = sh('ps', ['-o', 'ppid=', '-p', String(pid)]);
    if (!out) break;
    const ppid = parseInt(out.trim(), 10);
    if (!Number.isFinite(ppid) || ppid <= 1 || ppid === pid) break;
    pid = ppid;
  }
  return pids;
}

function commOf(pid) {
  const out = sh('ps', ['-o', 'comm=', '-p', String(pid)]);
  return out ? out.trim() : null;
}

export function writeBinding(ledgerDir, sessionId) {
  const pids = ancestorPids(process.pid).slice(1); // drop the (short-lived) hook process itself
  const comms = pids.map(commOf);
  let anchorIdx = comms.findIndex((c) => c && /claude|node/i.test(path.basename(c)));
  if (anchorIdx === -1) anchorIdx = 0;
  const binding = {
    sessionId,
    ts: Date.now(),
    pids,
    anchorPid: pids[anchorIdx] ?? null,
    anchorComm: comms[anchorIdx] ?? null,
  };
  fs.writeFileSync(
    path.join(ledgerDir, 'bindings', `${sessionId}.json`),
    JSON.stringify(binding) + '\n'
  );
  return binding;
}

export function refreshBindingIfStale(ledgerDir, sessionId, maxAgeMs = BINDING_REFRESH_MS) {
  const f = path.join(ledgerDir, 'bindings', `${sessionId}.json`);
  try {
    if (Date.now() - fs.statSync(f).mtimeMs < maxAgeMs) return;
  } catch {}
  writeBinding(ledgerDir, sessionId);
}

export function readBindings(ledgerDir) {
  const dir = path.join(ledgerDir, 'bindings');
  const out = new Map();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {}
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (b && b.sessionId) out.set(b.sessionId, b);
    } catch {}
  }
  return out;
}

export function resolveSessionId(ledgerDir, ancestors = ancestorPids(process.pid)) {
  let best = null;
  for (const b of readBindings(ledgerDir).values()) {
    const set = new Set(b.pids || []);
    const idx = ancestors.findIndex((p) => set.has(p));
    if (idx === -1) continue;
    if (!best || idx < best.idx || (idx === best.idx && b.ts > best.b.ts)) best = { idx, b };
  }
  return best ? best.b.sessionId : null;
}

// true / false / null (unknown)
export function bindingAlive(b) {
  if (!b || !b.anchorPid) return null;
  const c = commOf(b.anchorPid);
  if (!c) return false;
  return b.anchorComm ? c === b.anchorComm : true;
}

// ---------------------------------------------------------------------------
// Conflict detection + overview snapshot
// ---------------------------------------------------------------------------

// Other sessions with a claim on relFile. A write-claim counts while the file
// is still dirty (or its dirtiness is unknown); a planned-claim counts while
// the claiming session is alive.
export function conflictsForFile({ sessions, bindings, dirty, repos = [], mySessionId }, relFile) {
  const out = [];
  for (const [sid, s] of sessions) {
    if (sid === mySessionId) continue;
    const alive = bindingAlive(bindings.get(sid));
    const w = s.writes.get(relFile);
    if (w && fileDirtiness(dirty, repos, relFile) !== false) {
      out.push({ session: sid, kind: 'editing', goal: w.goal, lastTs: w.lastTs, alive });
      continue;
    }
    if (s.planned.has(relFile) && alive !== false) {
      out.push({ session: sid, kind: 'planned', goal: s.task?.goal ?? null, lastTs: s.task?.ts, alive });
    }
  }
  return out;
}

export function overview(ledgerDir, projectRoot, mySessionId = null) {
  const repos = workspaceRepos(projectRoot);
  const dirty = gitDirtyFiles(projectRoot, repos);
  const sessions = buildState(readEventsBySession(ledgerDir));
  const bindings = readBindings(ledgerDir);

  const list = [];
  const recorded = new Set();
  for (const [sid, s] of sessions) {
    const files = [...s.writes.entries()]
      .filter(([f]) => fileDirtiness(dirty, repos, f) !== false)
      .map(([f, w]) => ({ file: f, lastTs: w.lastTs, count: w.count, goal: w.goal }))
      .sort((a, b) => b.lastTs - a.lastTs);
    for (const f of files) recorded.add(f.file);
    const alive = bindingAlive(bindings.get(sid));
    if (!files.length && !s.task) continue;
    if (!files.length && alive === false) continue; // dead session with nothing pending
    list.push({
      id: sid,
      you: sid === mySessionId,
      goal: s.task?.goal ?? null,
      taskTs: s.task?.ts ?? null,
      planned: [...s.planned],
      files,
      alive,
    });
  }
  list.sort((a, b) => Number(b.you) - Number(a.you) || lastActivity(b) - lastActivity(a));

  const unannotated = dirty ? [...dirty].filter((f) => !recorded.has(f)).sort() : [];
  return {
    sessions: list,
    unannotated,
    archive: readArchive(ledgerDir, 10),
    git: dirty !== null,
    dirty,
  };
}

function lastActivity(s) {
  return Math.max(s.taskTs ?? 0, ...s.files.map((f) => f.lastTs ?? 0));
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared by hook context injection and MCP tool output)
// ---------------------------------------------------------------------------

export function ago(ts) {
  if (!ts) return 'unknown time';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function shortSid(sid) {
  return sid && sid.length > 8 ? sid.slice(0, 8) : sid;
}

export function trunc(s, n = 120) {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function liveness(alive) {
  return alive === false ? 'inactive' : alive === true ? 'active' : 'liveness unknown';
}

export function describeSession(s) {
  const who = s.you ? `session ${shortSid(s.id)} (you)` : `session ${shortSid(s.id)}`;
  const goal = s.goal ? `"${trunc(s.goal)}"` : '(no goal declared)';
  const files = s.files.length
    ? s.files.map((f) => `${f.file} (${f.count}×, last ${ago(f.lastTs)})`).join(', ')
    : '(no uncommitted files recorded)';
  let line = `${who} [${liveness(s.alive)}] — goal: ${goal} — editing: ${files}`;
  if (s.planned.length) line += ` — plans to touch: ${s.planned.join(', ')}`;
  return line;
}
