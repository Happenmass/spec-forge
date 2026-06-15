#!/bin/bash
# End-to-end smoke test for session-ledger.
# Creates a throwaway git repo + ledger home under /tmp, simulates two concurrent
# Claude Code sessions via the hook entry, and exercises the MCP server over
# stdio. No network, no real sessions touched. Run: bash smoke-test.sh

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d /tmp/session-ledger-test.XXXXXX)"
export SESSION_LEDGER_HOME="$WORK/ledger-home"
REPO="$WORK/repo"
PASS=0; FAIL=0

check() { # name expected_substring actual
  if [[ "$3" == *"$2"* ]]; then PASS=$((PASS+1)); echo "ok   - $1"
  else FAIL=$((FAIL+1)); echo "FAIL - $1"; echo "       expected substring: $2"; echo "       actual: ${3:0:400}"; fi
}
check_empty() { # name actual
  if [[ -z "$2" ]]; then PASS=$((PASS+1)); echo "ok   - $1"
  else FAIL=$((FAIL+1)); echo "FAIL - $1 (expected empty output)"; echo "       actual: ${2:0:400}"; fi
}

hook() { # mode json [project_dir]
  # CLAUDE_PROJECT_DIR is set explicitly: the hook prefers it over the payload
  # cwd, and the ambient value (when this test runs inside a Claude session)
  # must not leak in.
  echo "$2" | CLAUDE_PROJECT_DIR="${3:-$REPO}" node "$DIR/hook.mjs" "$1"
}
run_mcp() { # session_id, then one JSON-RPC line per arg (project dir: $MCP_DIR, default $REPO)
  local sid="$1"; shift
  printf '%s\n' "$@" | SESSION_LEDGER_SESSION_ID="$sid" SESSION_LEDGER_PROJECT_DIR="${MCP_DIR:-$REPO}" node "$DIR/server.mjs"
}

mkdir -p "$REPO"; cd "$REPO"
git init -q
git config user.email test@test; git config user.name test
echo base > a.txt; git add .; git commit -qm "init"

echo "== hooks =="

OUT=$(hook session-start "{\"session_id\":\"sessA\",\"cwd\":\"$REPO\"}")
check_empty "session-start on clean repo is silent" "$OUT"
if ls "$SESSION_LEDGER_HOME"/*/bindings/sessA.json >/dev/null 2>&1; then
  PASS=$((PASS+1)); echo "ok   - binding written for sessA"
else
  FAIL=$((FAIL+1)); echo "FAIL - binding written for sessA"
fi

OUT=$(hook pre-write "{\"session_id\":\"sessA\",\"cwd\":\"$REPO\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$REPO/a.txt\"}}")
check_empty "first edit of a clean file is allowed silently" "$OUT"
check "write event recorded for sessA" '"type":"write"' "$(cat "$SESSION_LEDGER_HOME"/*/sessions/sessA.jsonl)"

echo change-by-A >> a.txt   # simulate the edit actually landing

OUT=$(hook pre-write "{\"session_id\":\"sessB\",\"cwd\":\"$REPO\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$REPO/a.txt\"}}")
check "sessB gets a conflict advisory on a.txt" 'concurrent-change advisory' "$OUT"
check "advisory names the other session" 'session sessA' "$OUT"
check "advisory is a deny" '"permissionDecision":"deny"' "$OUT"

OUT=$(hook pre-write "{\"session_id\":\"sessB\",\"cwd\":\"$REPO\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$REPO/a.txt\"}}")
check_empty "warn-once: sessB retry is allowed" "$OUT"
check "sessB write recorded after retry" '"type":"write"' "$(cat "$SESSION_LEDGER_HOME"/*/sessions/sessB.jsonl)"

echo manual-edit > b.txt    # dirty file no session recorded
OUT=$(hook pre-write "{\"session_id\":\"sessA\",\"cwd\":\"$REPO\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$REPO/b.txt\"}}")
check "unannotated dirty file warns" 'NO tracked session' "$OUT"
OUT=$(hook pre-write "{\"session_id\":\"sessA\",\"cwd\":\"$REPO\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$REPO/b.txt\"}}")
check_empty "unannotated warn is also once-only" "$OUT"

OUT=$(hook pre-write "{\"session_id\":\"sessA\",\"cwd\":\"$REPO\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/tmp/outside-the-project.txt\"}}")
check_empty "files outside the project are ignored" "$OUT"

OUT=$(hook session-start "{\"session_id\":\"sessC\",\"cwd\":\"$REPO\"}")
check "new session is briefed about other activity" 'sessA' "$OUT"
check "briefing is additionalContext" '"additionalContext"' "$OUT"

echo "== mcp server =="

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}'
INITED='{"jsonrpc":"2.0","method":"notifications/initialized"}'
TOOLS='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
CALL_LIST='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_active_changes","arguments":{}}}'
CALL_WHO='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"who_changed","arguments":{"file":"a.txt"}}}'

OUT=$(run_mcp sessA "$INIT" "$INITED" "$TOOLS" "$CALL_LIST" "$CALL_WHO")
check "initialize answers with serverInfo" '"serverInfo"' "$OUT"
check "tools/list exposes who_changed" '"who_changed"' "$OUT"
check "list_active_changes shows a.txt in progress" 'a.txt' "$OUT"
check "who_changed marks the calling session as YOU" '(YOU)' "$OUT"
check "who_changed attributes the other session" 'session sessB' "$OUT"

git add -A; git commit -qm "feat: ship a and b"

OUT=$(run_mcp sessA "$INIT" "$INITED" "$CALL_LIST")
check "after commit, entries are archived" 'Recently completed' "$OUT"
check "archive carries the commit subject" 'feat: ship a and b' "$OUT"
check "archive marks status committed" 'committed' "$OUT"
check "no stale in-progress entries remain" '(none — no session has recorded in-progress work)' "$OUT"

# conflict at declaration time: sessB starts editing c.txt, then sessA declares it
OUT=$(hook pre-write "{\"session_id\":\"sessB\",\"cwd\":\"$REPO\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$REPO/c.txt\"}}")
echo from-B > c.txt
CALL_TASK='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"start_task","arguments":{"goal":"rework c","planned_files":["c.txt"]}}}'
OUT=$(run_mcp sessA "$INIT" "$INITED" "$CALL_TASK")
check "start_task records the goal" 'Task recorded' "$OUT"
check "start_task flags the planned-file conflict" 'CONFLICT' "$OUT"
check "conflict names sessB" 'session sessB' "$OUT"

echo "== multi-repo workspace (parent dir not a git repo) =="

WS="$WORK/workspace"
mkdir -p "$WS/repoA" "$WS/repoB"
for r in repoA repoB; do
  cd "$WS/$r"
  git init -q; git config user.email test@test; git config user.name test
  echo base > f.txt; git add .; git commit -qm init
done
cd "$WS"

# In-session `cd` drifted the cwd into repoA; the session edits a file in repoB.
# The stable CLAUDE_PROJECT_DIR must key the shard, not the drifted cwd.
OUT=$(hook pre-write "{\"session_id\":\"sessW\",\"cwd\":\"$WS/repoA\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$WS/repoB/f.txt\"}}" "$WS")
check_empty "cross-sub-repo first edit is allowed silently" "$OUT"
echo change-by-W >> "$WS/repoB/f.txt"

WS_SHARD=$(ls -d "$SESSION_LEDGER_HOME"/workspace-* 2>/dev/null | head -1)
if [[ -n "$WS_SHARD" && -f "$WS_SHARD/sessions/sessW.jsonl" ]]; then
  PASS=$((PASS+1)); echo "ok   - edit recorded in the workspace shard (not a sub-repo shard)"
else
  FAIL=$((FAIL+1)); echo "FAIL - edit recorded in the workspace shard (not a sub-repo shard)"
fi
check "edit keyed relative to the workspace root" 'repoB/f.txt' "$(cat "$WS_SHARD/sessions/sessW.jsonl" 2>/dev/null)"

# A recorded edit directly in the parent dir (covered by no repo) must survive
# reconciliation — git cannot prove it clean.
OUT=$(hook pre-write "{\"session_id\":\"sessW\",\"cwd\":\"$WS\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$WS/notes.md\"}}" "$WS")
echo notes > "$WS/notes.md"

CALL_WHO_WS='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"who_changed","arguments":{"file":"repoB/f.txt"}}}'
MCP_DIR="$WS"
OUT=$(run_mcp sessV "$INIT" "$INITED" "$CALL_WHO_WS")
check "who_changed (workspace shard) finds the cross-sub-repo edit" 'session sessW' "$OUT"
check "who_changed sees sub-repo dirtiness" 'HAS uncommitted changes' "$OUT"

(cd "$WS/repoB" && git add -A && git commit -qm "feat: ship f in repoB")

OUT=$(run_mcp sessV "$INIT" "$INITED" "$CALL_LIST")
check "multi-repo reconcile archives the committed sub-repo file" 'feat: ship f in repoB' "$OUT"
check "archived entry marked committed" '→ committed' "$OUT"
check "uncovered parent-dir file stays in progress" 'notes.md' "$OUT"
unset MCP_DIR

echo "== session binding resolution =="

OUT=$(node --input-type=module -e "
import * as core from '$DIR/core.mjs';
import fs from 'node:fs';
const dir = '$WORK/resolve-test';
fs.mkdirSync(dir + '/bindings', { recursive: true });
fs.writeFileSync(dir + '/bindings/sA.json', JSON.stringify({ sessionId: 'sA', ts: 1, pids: [111, 222, 900, 1000] }));
fs.writeFileSync(dir + '/bindings/sB.json', JSON.stringify({ sessionId: 'sB', ts: 2, pids: [333, 444, 901, 1000] }));
// my chain: server(555) -> claudeA(900) -> terminal(1000): meets sA at depth 1, sB only at depth 2
console.log(core.resolveSessionId(dir, [555, 900, 1000]));
")
check "resolveSessionId picks the closest common ancestor" "sA" "$OUT"

echo
echo "== result: $PASS passed, $FAIL failed =="
if [[ $FAIL -eq 0 ]]; then rm -rf "$WORK"; exit 0
else echo "(work dir kept for debugging: $WORK)"; exit 1; fi
