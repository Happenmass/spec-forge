#!/usr/bin/env node
// session-ledger MCP server — zero-dependency stdio JSON-RPC (newline-delimited).
//
// Tools: start_task / list_active_changes / who_changed. All tools lazily
// reconcile the ledger against `git status` first, so committed work is
// auto-archived with a short commit traceback and never shown as in-progress.
//
// Session identity: resolved by matching this process's ancestor-PID chain
// against the bindings written by the SessionStart/PreToolUse hooks (see
// core.mjs). Override with SESSION_LEDGER_SESSION_ID for testing.

import path from 'node:path';
import * as core from './core.mjs';

const PROTOCOL_FALLBACK = '2024-11-05';

function projectCwd() {
  const env = process.env.SESSION_LEDGER_PROJECT_DIR;
  if (env && !env.startsWith('$')) return env; // unexpanded "${CLAUDE_PROJECT_DIR}" → fall through
  return process.cwd();
}

function mySessionId(ledgerDir) {
  if (process.env.SESSION_LEDGER_SESSION_ID) return process.env.SESSION_LEDGER_SESSION_ID;
  return core.resolveSessionId(ledgerDir) || `pid${process.ppid}`;
}

const TOOLS = [
  {
    name: 'start_task',
    description:
      'Declare the task you are about to work on in this working directory, BEFORE you start editing files. ' +
      'Records your goal in a cross-session ledger shared by all Claude Code sessions in this directory, and ' +
      'immediately warns you if a file you plan to touch is already being edited by another session. ' +
      'Call it again whenever your goal changes.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'One short sentence: what you are about to change and why.',
        },
        planned_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Project-relative paths you expect to modify (best effort — files you edit are also recorded automatically).',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'list_active_changes',
    description:
      'List all in-progress (uncommitted) changes in this working directory across ALL Claude Code sessions: ' +
      'which session is editing which files and for what declared goal, plus uncommitted changes recorded by no ' +
      'session (e.g. manual edits), plus recently committed/archived work. Use this when git status shows ' +
      'modifications you do not remember making, or to see what else is happening in this directory.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'who_changed',
    description:
      'Attribute changes to a specific file: which sessions (including yours) recorded edits to it and with what ' +
      'goal, whether it currently has uncommitted changes, the last commit that touched it, and its recently ' +
      'archived ledger history. Use this FIRST when you see a diff you do not remember making — before assuming ' +
      'you made a mistake or reverting it.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path (project-relative or absolute).' },
      },
      required: ['file'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function normalizeRel(projectRoot, file) {
  const abs = path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
  return path.relative(projectRoot, core.safeRealpath(abs));
}

function startTask(args, ctx) {
  const goal = String(args.goal || '').trim();
  if (!goal) return 'start_task requires a non-empty `goal`.';
  const planned = (Array.isArray(args.planned_files) ? args.planned_files : [])
    .map((f) => normalizeRel(ctx.projectRoot, String(f)))
    .filter((f) => f && !f.startsWith('..'));

  core.appendEvent(ctx.ledgerDir, ctx.sessionId, {
    type: 'task',
    goal,
    planned_files: planned,
  });

  const sessions = core.buildState(core.readEventsBySession(ctx.ledgerDir));
  const bindings = core.readBindings(ctx.ledgerDir);
  const dirty = core.gitDirtyFiles(ctx.projectRoot, ctx.repos);

  const lines = [
    `Task recorded for session ${core.shortSid(ctx.sessionId)}: "${goal}"`,
  ];
  let anyConflict = false;
  for (const f of planned) {
    const conflicts = core.conflictsForFile(
      { sessions, bindings, dirty, repos: ctx.repos, mySessionId: ctx.sessionId },
      f
    );
    for (const c of conflicts) {
      anyConflict = true;
      const verb = c.kind === 'editing' ? 'already has uncommitted edits to' : 'also plans to edit';
      lines.push(
        `⚠️ CONFLICT: session ${core.shortSid(c.session)} [${core.liveness(c.alive)}] ${verb} ` +
          `"${f}" (goal: ${c.goal ? `"${core.trunc(c.goal)}"` : 'none declared'}, last activity ${core.ago(c.lastTs)}).`
      );
    }
  }
  if (anyConflict) {
    lines.push(
      'Coordinate before touching the conflicting files: run `git diff -- <file>` to see the other change, and avoid clobbering it.'
    );
  } else if (planned.length) {
    lines.push('No conflicts: none of your planned files are claimed by another session.');
  }

  const others = [...sessions.keys()].filter((sid) => sid !== ctx.sessionId);
  if (others.length) {
    const snap = core.overview(ctx.ledgerDir, ctx.projectRoot, ctx.sessionId);
    const active = snap.sessions.filter((s) => !s.you && (s.files.length || s.goal));
    if (active.length) {
      lines.push('', 'Other sessions currently working in this directory:');
      for (const s of active) lines.push(`- ${core.describeSession(s)}`);
    }
  }
  return lines.join('\n');
}

function listActiveChanges(ctx) {
  const snap = core.overview(ctx.ledgerDir, ctx.projectRoot, ctx.sessionId);
  const lines = [`Working directory: ${ctx.projectRoot}`];
  if (!snap.git) lines.push('(not a git repository — ledger entries cannot be reconciled against commits)');

  lines.push('', '## In-progress changes by session');
  if (!snap.sessions.length) lines.push('(none — no session has recorded in-progress work)');
  for (const s of snap.sessions) lines.push(`- ${core.describeSession(s)}`);

  lines.push('', '## Uncommitted changes recorded by NO session');
  if (!snap.unannotated.length) {
    lines.push('(none — every dirty file is accounted for)');
  } else {
    lines.push(
      ...snap.unannotated.slice(0, 30).map((f) => `- ${f}  ← manual edit or untracked tool; check before assuming it is yours`)
    );
    if (snap.unannotated.length > 30) lines.push(`  (+${snap.unannotated.length - 30} more)`);
  }

  if (snap.archive.length) {
    lines.push('', '## Recently completed (archived from the ledger)');
    for (const a of snap.archive) {
      const when = new Date(a.ts).toISOString().slice(0, 16).replace('T', ' ');
      const commit = a.commit ? `${a.commit.sha} "${a.commit.subject}"` : '(no commit found)';
      lines.push(
        `- ${a.file} — session ${core.shortSid(a.session)}${a.goal ? `, goal "${core.trunc(a.goal, 80)}"` : ''} → ${a.status} ${commit} (${when})`
      );
    }
  }
  return lines.join('\n');
}

function whoChanged(args, ctx) {
  const rel = normalizeRel(ctx.projectRoot, String(args.file || ''));
  if (!rel || rel.startsWith('..')) return `"${args.file}" is outside this working directory (${ctx.projectRoot}).`;

  const sessions = core.buildState(core.readEventsBySession(ctx.ledgerDir));
  const bindings = core.readBindings(ctx.ledgerDir);
  const dirty = core.gitDirtyFiles(ctx.projectRoot, ctx.repos);
  const lastCommit = core.gitLastCommit(ctx.projectRoot, rel, ctx.repos);

  const lines = [`File: ${rel}`];
  const dirtiness = core.fileDirtiness(dirty, ctx.repos, rel);
  if (dirtiness !== null) lines.push(`Git: ${dirtiness ? 'HAS uncommitted changes' : 'clean (no uncommitted changes)'}`);
  if (lastCommit) lines.push(`Last commit touching it: ${lastCommit.sha} "${lastCommit.subject}" (${core.ago(lastCommit.ts)})`);

  const records = [];
  for (const [sid, s] of sessions) {
    const w = s.writes.get(rel);
    if (!w) continue;
    const who = sid === ctx.sessionId ? `session ${core.shortSid(sid)} (YOU)` : `session ${core.shortSid(sid)}`;
    records.push(
      `- ${who} [${core.liveness(core.bindingAlive(bindings.get(sid)))}] — ${w.count} edit(s), last ${core.ago(w.lastTs)}` +
        (w.goal ? ` — goal: "${core.trunc(w.goal)}"` : ' — no goal declared')
    );
  }
  lines.push('', 'In-progress edit records:');
  lines.push(...(records.length ? records : ['(none)']));
  if (!records.length && dirtiness === true) {
    lines.push(
      'NOTE: the file is dirty but no tracked session recorded an edit — likely a manual edit, another tool, or a session without this plugin. It is probably NOT yours.'
    );
  }

  const history = core.readArchive(ctx.ledgerDir, 200).filter((a) => a.file === rel).slice(0, 5);
  if (history.length) {
    lines.push('', 'Archived ledger history for this file:');
    for (const a of history) {
      const commit = a.commit ? `${a.commit.sha} "${a.commit.subject}"` : '(no commit)';
      lines.push(
        `- session ${core.shortSid(a.session)}${a.goal ? `, goal "${core.trunc(a.goal, 80)}"` : ''} → ${a.status} ${commit}`
      );
    }
  }
  return lines.join('\n');
}

function callTool(params) {
  const name = params?.name;
  const args = params?.arguments || {};
  const { projectRoot, ledgerDir } = core.loadContext(projectCwd());
  core.reconcile(ledgerDir, projectRoot);
  const ctx = {
    projectRoot,
    ledgerDir,
    repos: core.workspaceRepos(projectRoot),
    sessionId: mySessionId(ledgerDir),
  };

  let text;
  if (name === 'start_task') text = startTask(args, ctx);
  else if (name === 'list_active_changes') text = listActiveChanges(ctx);
  else if (name === 'who_changed') text = whoChanged(args, ctx);
  else return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };

  return { content: [{ type: 'text', text }] };
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing (newline-delimited, per MCP stdio transport)
// ---------------------------------------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const id = req.id;
  if (id === undefined || id === null) return; // notification — nothing to do

  try {
    switch (req.method) {
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: req.params?.protocolVersion || PROTOCOL_FALLBACK,
            capabilities: { tools: {} },
            serverInfo: { name: 'session-ledger', version: '0.1.0' },
          },
        });
        break;
      case 'ping':
        send({ jsonrpc: '2.0', id, result: {} });
        break;
      case 'tools/list':
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        break;
      case 'tools/call':
        send({ jsonrpc: '2.0', id, result: callTool(req.params) });
        break;
      default:
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${req.method}` } });
    }
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e?.message || e) } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handle(line);
  }
});
process.stdin.on('end', () => process.exit(0));
