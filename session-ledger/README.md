# session-ledger

Cross-session **in-progress change ledger** for a working directory. Solves the
"multiple Claude Code sessions in one directory" confusion: a session sees
uncommitted changes it didn't make, wastes time second-guessing itself, or
clobbers another session's work.

Zero dependencies (pure Node, stdlib only). Bundled with the spec-forge plugin:
the MCP server is registered via the plugin's `.mcp.json`, the hooks via
`hooks/hooks.json` — nothing to install.

## What each session gets

| Capability | Mechanism | Reliability |
| --- | --- | --- |
| Auto-record every file edit (who, what, when) | `PreToolUse` hook on `Write\|Edit\|MultiEdit\|NotebookEdit` | deterministic — does not depend on the model remembering |
| **Pre-write conflict advisory** when a file is claimed by another session, or is dirty with no recorded owner | same hook, **warn-once `deny`**: first touch is blocked with an explanation, a knowing retry is allowed | deterministic |
| Briefing about other sessions' in-progress work at session start | `SessionStart` hook → `additionalContext` | deterministic |
| Declare a goal so other sessions see *why* you're editing | MCP `start_task(goal, planned_files?)` — also warns about planned-file conflicts at declaration time | best-effort (model-initiated) |
| Query in-progress changes across all sessions | MCP `list_active_changes()` | on demand |
| Attribute a specific diff ("did I change this?") | MCP `who_changed(file)` | on demand |
| Auto-archive after commit, keeping a short commit traceback | lazy reconciliation against `git status` on every query/hook | automatic |

## Design rules

- **git is the source of truth; the ledger only annotates it.** Ledger entries
  whose files are clean again are lazily archived (with the commit sha +
  subject of the commit that took them) and disappear from the active view.
  Stale entries cannot accumulate.
- **The advisory must be deterministic, so it lives in the hook**, not in an
  MCP tool the model might forget to call. Warn-once semantics: the first
  attempt to touch a contested file is denied with the reason (fed back to the
  model); the retry is allowed and recorded.
- **Fail open.** Any internal error in hook or server exits cleanly and allows
  the edit. A broken ledger must never block work.

## Session identity (how the MCP server knows "who am I")

Hooks receive `session_id` on stdin and record their **ancestor-PID chain** as a
binding. The MCP server walks its own ancestor chain and picks the binding it
meets **closest to the leaf** — that common ancestor is the `claude` process
both were spawned from. Two concurrent sessions only share ancestors *above*
their respective `claude` processes, so the match is unambiguous. Override with
`SESSION_LEDGER_SESSION_ID` (used by the smoke test).

## Storage

```
~/.claude/session-ledger/<basename>-<sha256(root)[:12]>/
├── meta.json              # {root: "/abs/project/root"}
├── sessions/<sid>.jsonl   # events: task | write | warned (one file per session — no write contention)
├── bindings/<sid>.json    # session_id -> ancestor PIDs (+ liveness anchor)
└── archive.jsonl          # reconciled entries with commit traceback
```

The ledger is indexed by the **stable session root**: hooks use
`CLAUDE_PROJECT_DIR` (falling back to the payload cwd) and the MCP server uses
`SESSION_LEDGER_PROJECT_DIR`, both normalized to the git toplevel when inside a
repo. The hook payload's `cwd` is deliberately **not** used for indexing — it
drifts when the session runs `cd` in Bash, which would scatter records across
shards the server never reads. Paths are stored relative to the root; `/tmp` vs
`/private/tmp`-style symlink spellings are canonicalized (`safeRealpath`).

### Multi-repo workspaces

When the session root is **not itself a git repo** but contains git repos as
immediate children (e.g. `~/code/workspace/{repoA,repoB}`), the ledger treats
them as one workspace: edits anywhere under the root are recorded relative to
it (including cross-sub-repo edits while the cwd sits in a sibling repo), and
reconciliation runs `git status` per sub-repo, archiving entries only when the
**covering** repo proves them clean. Files covered by no repo (directly in the
parent dir) are kept — git cannot prove them clean.

## Environment overrides

| Variable | Effect | Default |
| --- | --- | --- |
| `SESSION_LEDGER_HOME` | Ledger storage root | `~/.claude/session-ledger` |
| `SESSION_LEDGER_PROJECT_DIR` | Working directory the MCP server indexes (set to `${CLAUDE_PROJECT_DIR}` by the plugin's `.mcp.json`) | server `cwd` |
| `CLAUDE_PROJECT_DIR` | Stable session root the hooks index (injected by Claude Code into hook processes) | hook payload `cwd` |
| `SESSION_LEDGER_SESSION_ID` | Bypass PID-chain resolution and use this session id (used by the smoke test) | resolved via bindings |
| `SESSION_LEDGER_DEBUG` | Append diagnostics to `<ledger>/debug.log` | off |

## Files

- `core.mjs` — storage, git reconciliation, conflict detection, PID binding, formatting (shared)
- `hook.mjs` — hook entry: `session-start` | `pre-write`
- `server.mjs` — zero-dep stdio MCP server (newline-delimited JSON-RPC)
- `smoke-test.sh` — end-to-end regression: two simulated sessions + MCP calls in a throwaway repo (`bash smoke-test.sh`)

## Known limits

- Edits made by **plain Bash commands** (`sed`, `echo >`, scripts) bypass the
  `PreToolUse` matcher and show up as "uncommitted changes recorded by NO
  session" — which is still surfaced, just unattributed.
- Reconciliation rewrites a session file under a best-effort lock; a racing
  append can in theory be lost. Consequence is benign: the file shows as
  unannotated later and re-warns once.
- Liveness detection is heuristic (anchor PID + command name); when unknown it
  is reported as "liveness unknown" rather than guessed.
- Multi-repo workspace discovery only looks at **immediate children** of the
  session root, and bails out (back to no-git behavior: records kept, never
  reconciled) above 16 sub-repos to keep per-write `git status` cost bounded.
- In a multi-repo workspace, recorded edits to files covered by **no** sub-repo
  stay in-progress until manually superseded — there is no git to clear them.
