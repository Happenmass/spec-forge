#!/usr/bin/env node
// session-ledger hook entry. Two modes:
//   hook.mjs session-start   SessionStart: bind session_id -> ancestor PIDs, reconcile,
//                            and inject a summary of other sessions' in-progress work.
//   hook.mjs pre-write       PreToolUse(Write|Edit|...): warn-once conflict advisory,
//                            then record the write into the ledger.
//
// Fails open by design: any internal error exits 0 with no output so a broken
// ledger can never block editing.

import path from 'node:path';
import * as core from './core.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const MAX_LISTED = 15;

function onSessionStart(input) {
  const sessionId = input.session_id;
  if (!sessionId) return null;
  const { projectRoot, ledgerDir } = core.loadContext(input.cwd);
  core.writeBinding(ledgerDir, sessionId);
  core.reconcile(ledgerDir, projectRoot);

  const snap = core.overview(ledgerDir, projectRoot, sessionId);
  const others = snap.sessions.filter((s) => !s.you && (s.files.length || s.goal));
  if (!others.length && !snap.unannotated.length) return null;

  const lines = ['[session-ledger] Other in-progress activity in this working directory:'];
  for (const s of others.slice(0, MAX_LISTED)) lines.push(`- ${core.describeSession(s)}`);
  if (snap.unannotated.length) {
    const shown = snap.unannotated.slice(0, MAX_LISTED).join(', ');
    const more = snap.unannotated.length > MAX_LISTED ? ` (+${snap.unannotated.length - MAX_LISTED} more)` : '';
    lines.push(`- uncommitted changes recorded by NO session (manual or untracked edits): ${shown}${more}`);
  }
  lines.push(
    'These uncommitted changes are NOT yours — do not revert or "fix" them, and do not be confused by them in git status/diff. ' +
      'Use the session-ledger MCP tools: who_changed(file) to attribute a change, start_task(goal) to declare your own work.'
  );
  return {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
  };
}

function onPreWrite(input) {
  if (!WRITE_TOOLS.has(input.tool_name)) return null;
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (!target || typeof target !== 'string') return null;

  const cwd = input.cwd || process.cwd();
  const { projectRoot, ledgerDir } = core.loadContext(cwd);
  const rel = path.relative(projectRoot, core.safeRealpath(path.resolve(cwd, target)));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null; // outside this project — not tracked

  const sessionId = input.session_id || 'unknown';
  core.refreshBindingIfStale(ledgerDir, sessionId);

  const sessions = core.buildState(core.readEventsBySession(ledgerDir));
  const bindings = core.readBindings(ledgerDir);
  const dirty = core.gitDirtyFiles(projectRoot);
  const mine = sessions.get(sessionId);

  const conflicts = core.conflictsForFile({ sessions, bindings, dirty, mySessionId: sessionId }, rel);
  const anyRecord = [...sessions.values()].some((s) => s.writes.has(rel));
  const unannotated = dirty !== null && dirty.has(rel) && !anyRecord;

  if ((conflicts.length || unannotated) && !mine?.warned.has(rel)) {
    core.appendEvent(ledgerDir, sessionId, { type: 'warned', file: rel });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: buildReason(rel, conflicts, unannotated),
      },
    };
  }

  core.appendEvent(ledgerDir, sessionId, { type: 'write', file: rel, tool: input.tool_name });
  return null;
}

function buildReason(rel, conflicts, unannotated) {
  const lines = [`[session-ledger] One-time concurrent-change advisory for "${rel}" — NOT a permission problem, do not ask the user.`];
  for (const c of conflicts.slice(0, 3)) {
    const goal = c.goal ? `goal: "${core.trunc(c.goal)}"` : 'no goal declared';
    const verb = c.kind === 'editing' ? 'has uncommitted edits to' : 'declared it plans to edit';
    lines.push(
      `- Another Claude Code session ${core.shortSid(c.session)} [${core.liveness(c.alive)}] ${verb} this file (${goal}, last activity ${core.ago(c.lastTs)}).`
    );
  }
  if (unannotated) {
    lines.push(
      '- This file has uncommitted changes that NO tracked session recorded — likely a manual edit or another tool.'
    );
  }
  lines.push(
    'The file may differ from what you last read. Recommended: run `git diff -- ' +
      rel +
      '`, re-read the file, make sure your edit does not clobber the other change, then simply RETRY the edit — it will be allowed (this advisory fires once per file).'
  );
  return lines.join('\n');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let out = null;
  try {
    const input = JSON.parse(raw);
    const mode = process.argv[2];
    if (mode === 'session-start') out = onSessionStart(input);
    else if (mode === 'pre-write') out = onPreWrite(input);
  } catch {
    out = null; // fail open
  }
  if (out) process.stdout.write(JSON.stringify(out));
  process.exit(0);
});
