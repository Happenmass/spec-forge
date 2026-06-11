# executing-plans — Subagent-Per-Task Execution Recipe

This is the **preferred engine** for the `executing-plans` skill. It drives an
implementation plan through a `Workflow`: one **fresh subagent per task**, run
**sequentially** (later tasks build on earlier commits), each at a **model
chosen for that task's complexity**, with a **review gate scaled to risk**.
Blockers are returned as data and escalated by the orchestrator — agents never
guess past an unclear instruction or a failing verification, and never ask a
human directly (a Workflow subagent has no interactive channel).

> The script below is a **skeleton you adapt at runtime**, not a fixed program.
> The task list, the per-task model, and the review level all come from *this*
> plan's classification (skill Phase 1). Author the script inline, parameterized
> by that classification, and pass it via `args`.

## Why a Workflow (not linear in-session execution)

- **Fresh context per task.** Each task gets a subagent with full attention and
  no accumulated context rot — the single biggest quality win over executing the
  whole plan in one context. (This is the `superpowers:subagent-driven-development`
  idea, native to this plugin.)
- **Cost-appropriate models.** A 3-line config edit and a concurrency refactor
  should not run on the same model. Per-task routing spends `opus`/`fable` only
  where judgment is load-bearing and `haiku` where the plan already supplies
  verbatim code.
- **Sequential, not parallel.** Plans from `writing-plans` are dependency-ordered
  TDD tasks that commit onto one branch and build on each other. Tasks run one at
  a time on the **shared working tree** (no worktree isolation): each subagent
  reads the code the previous one committed. Do **not** parallelize unless the
  plan explicitly declares a set of tasks independent *and* they touch disjoint
  files — and even then, isolate with `isolation:'worktree'` and merge between
  stages. Default is sequential.

## Providing inputs — read this first (the #1 failure mode)

You author this script at runtime from the Phase-1 classification. **Inline those
values as constants — do not rely on `args` threading.** The crash to avoid: if
the script reads `const TASKS = args.tasks` and the Workflow tool call's `args`
was left unset or passed as a JSON-*string* (a documented footgun — `args` must be
a real JSON object, never a stringified blob), then `args.tasks` is `undefined`
and the script throws at line 1, **before any agent spawns** (0 agents, nothing
committed). Inlining removes that boundary entirely:

```javascript
const PLAN_PATH = '/abs/path/docs/plans/2026-06-06-foo.md'   // ABSOLUTE path
const TASKS = [
  { id: 'Task 1', title: 'Remove legacy module', heading: '### Task 1: Remove legacy module', model: 'opus',   reviewLevel: 'independent' },
  { id: 'Task 2', title: 'Add config flag',       heading: '### Task 2: Add config flag',       model: 'haiku', reviewLevel: 'self' },
  // …one entry per task, in plan order
]
const CHECKS = ['mvn -q compile', 'mvn -q test']
const START  = 0
```

Whatever the source, **guard before the loop** so a wiring mistake fails loud, not
cryptic (see the skeleton). If you do prefer `args`, set the tool call's top-level
`args` to a real object `{ planPath, tasks, checks, startIndex }` and read from it
— but inlining is the default precisely because it cannot mis-thread.

**Keep each task entry lightweight — do NOT inline the task body.** Carry only:
- `id` — `"Task N"`.
- `title` — the bracketed component name.
- `heading` — the task's **exact** `### Task N: …` line. The subagent uses this to
  locate its authoritative section in the plan file.
- `model` ∈ `'haiku' | 'sonnet' | 'opus' | 'fable'` (Phase-1 routing rubric).
  These tier aliases resolve at run time to Haiku 4.5 / Sonnet 4.6 / Opus 4.8 /
  Fable 5 respectively (empirically confirmed).
- `reviewLevel` ∈ `'self' | 'diff-check' | 'independent'` (see review gate).

The subagent reads its **authoritative** task section straight from `PLAN_PATH` by
that exact heading — everything up to the next `### Task`/`## ` heading (its
`**Files:**` block, every `- [ ]` step, all code fences, the commit step). The
plan file on disk is the single source of truth; threading full bodies through the
script only adds truncation/escaping risk. (See `spec-forge:writing-plans` →
"Task Structure" for the heading format.) `PLAN_PATH` **must be absolute** so the
subagent can open it.

- `CHECKS` — repo-wide verification commands to keep green when a task says to run
  them (e.g. `"pytest -q"`, `"npm test"`, `"ruff check ."`). From skill Phase 1;
  may be `[]`.
- `START` — index into `TASKS` to begin at (default `0`). Used on **resume** after
  a blocker; `TASKS` stays whole so indices never shift.

## The model-routing rubric (skill assigns this in Phase 1)

The orchestrator classifies each task **before** the workflow and shows the user
the mapping (see SKILL.md). The recipe honors the assignment. For reference:

| Tier | `model` | The task is… | `reviewLevel` |
| --- | --- | --- | --- |
| **Mechanical** | `haiku` | **Provably** verbatim: 100% literal code/config to apply, one small file, no logic to author, no unseen signature to match, a single deterministic verification command. **Opt-in — must be positively justified against every one of those signals.** | `self` |
| **Standard** | `sonnet` | The default. Plan supplies the code; the agent integrates it against real signatures, runs red→green, reconciles minor drift. | `diff-check` if it adds/modifies tests or assertions, else `self` |
| **Complex / high-stakes** | `opus` | Judgment-heavy or risky: ambiguous step, auth/crypto/security surface, concurrency/transactions, non-trivial algorithm/parser, cross-cutting refactor (~4+ files), public API/contract change, or the plan flags risk / leaves a decision open. | `independent` |
| **Frontier (rare)** | `fable` | The apex — only for a task the plan itself marks as its highest-stakes change (irreversible migration, security-critical core logic, novel algorithm specified by intent rather than code), or as the landing tier for an `opus` task retried after a block. Most plans have zero Frontier tasks. | `independent` |

**Mechanical disqualifiers (force the task OUT of `haiku`, regardless of how
confident the classifier feels).** A task is **not** Mechanical — promote to
Standard or higher — if *any* holds: it touches auth/security or a config key
that gates behavior; it crosses a module boundary or a public/serialized API; it
renames anything beyond a single private symbol in one file; it must conform to a
signature/interface the agent cannot see in the task body; or its verification is
not a single deterministic command. The misroute that hurts is a *subtly* complex
task read with false confidence as trivial — so **default up**: anything not
provably mechanical is Standard.

**Reviewer is never weaker than the implementer.** Independence comes from a
fresh context, not a downgraded model — an `opus` task gets an `opus` reviewer,
a `fable` task a `fable` reviewer (`reviewModel = max(implementer tier, …)`). A
`diff-check` is a deliberately cheap `haiku` integrity check, not a downgrade of
a full review.

**Retry escalation (bounded).** A task that blocks and is retried bumps its model
**one tier, capped at `fable`**, and its `reviewLevel` to `independent`; the
bounded repair pass after a failed review likewise runs **one tier above the
implementer** (capped at `fable`). **Terminal case:** a task already at `fable` +
`independent` that re-blocks does **not** auto-retry at the same capability — the
plan or environment is the problem, not the model, so it **hard-stops for human
resolution**. On resume, a failed task's tier is **pinned** (never re-derived
downward).

## The review gate (what each `reviewLevel` does)

- **`self`** — implementer self-verifies only. For Mechanical tasks and Standard
  tasks that touch no tests.
- **`diff-check`** — after the task commits, a cheap `haiku` reviewer confirms the
  committed diff **actually ran the stated verification commands** and did **not**
  weaken, skip, or delete any test assertion / expected output. Closes the
  self-attestation hole on the common path without a full review. Fail ⇒ block.
- **`independent`** — a fresh reviewer at the implementer's tier reads the task's
  commit diff (`git show HEAD`) adversarially against the task's intent and
  verifications. Fail ⇒ one bounded repair pass (implementer one tier above the
  original, capped at `fable`, with the reviewer's notes) ⇒ one re-review. Still
  failing ⇒ block.

A **skipped** review (the user skips that agent mid-run, so `agent()` returns
`null`) is **never** treated as a pass — it is handled exactly like a failed
review (enters repair/escalation, or blocks). A task that was never actually
reviewed must never be recorded as reviewed.

## Hard rules every subagent is given

- Implement **only your one task**, by following its steps **exactly**. The task's
  code blocks and verification commands are authoritative.
- Run the task's verifications **exactly as written**; do not skip them.
- **You have no way to ask a human.** Any question, ambiguity, missing decision,
  or needed clarification MUST be returned as `status:'blocked'` with the question
  in `blocker`. Never wait for, assume, or invent a human answer.
- **Do not improvise past the plan.** If a verification fails after one honest
  retry, a dependency is missing, or reality diverges from the plan's code —
  return `status:'blocked'` with a precise blocker. Never fake a pass, never
  `TODO`-stub, never forge ahead.
- Commit exactly as the task's commit step specifies, **staging only the files
  this task changed** — use `git add -u` or explicit paths, never `git add -A` /
  `git add .` (which sweeps unrelated untracked files into your commit). **Never**
  touch `main`/`master`, never force-push, never amend/rebase existing commits.
- Return the structured result; do not start any other task.

## Shape of the workflow

1. **Execute** (sequential loop from `startIndex`, one subagent per task at its
   `model`) → each returns `{ status: 'done' | 'blocked', commit, … }`. First
   non-`done` halts the loop and records the blocker (with its **index** and
   whether it left a **commit**).
2. **Review** (per `reviewLevel`) → `diff-check` (haiku) or `independent`
   (tier-matched, with one bounded repair + re-review). Any fail/skip ⇒ block.
3. **Return** `{ completed, blocked, total, startIndex }`. The orchestrator — not
   the workflow — handles human escalation and resume.

## Adaptable script skeleton

```javascript
export const meta = {
  name: 'execute-plan',
  description: 'Run an implementation plan as one subagent per task, sequentially, with per-task model routing and a risk-scaled review gate',
  phases: [
    { title: 'Execute' }, { title: 'Review' },
  ],
}

// === Inline these from the Phase-1 classification (recommended — no args boundary to mis-thread). ===
const PLAN_PATH = ''   // ABSOLUTE path to the plan .md  (e.g. '/repo/docs/plans/2026-06-06-foo.md')
const TASKS     = []   // [{id, title, heading, model, reviewLevel}, ...] in plan order — NOT the bodies
const CHECKS    = []   // repo test/lint/typecheck commands; may be []
const START     = 0    // resume entry point; TASKS stays whole so indices are stable

// Fail loud, not cryptic: catches an empty inline list OR an args.tasks that came through undefined/stringified.
if (!Array.isArray(TASKS) || TASKS.length === 0) {
  throw new Error('execute-plan: TASKS is empty — inline the Phase-1 task list (or check that args.tasks was not left undefined / passed as a JSON string) before running.')
}
if (!PLAN_PATH) throw new Error('execute-plan: PLAN_PATH is empty — set the absolute plan path.')

const TIER = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
const atLeast = (a, b) => (TIER[a] >= TIER[b] ? a : b)   // reviewer never weaker than implementer
const bump = (m) => (m === 'haiku' ? 'sonnet' : m === 'sonnet' ? 'opus' : 'fable')   // one tier up, capped at fable

const TASK_RESULT = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    summary: { type: 'string', description: 'What changed, in one or two lines' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    verificationsRun: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } },
      required: ['command', 'passed'],
    } },
    commit: { type: 'string', description: 'commit hash or subject, or "" if nothing was committed' },
    blocker: { type: 'string', description: 'If blocked: exactly what is unclear/failing and what you tried. Else "".' },
  },
  required: ['status', 'summary', 'filesTouched', 'verificationsRun', 'commit', 'blocker'],
}

const REVIEW_RESULT = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues'],
}

const RULES =
  `Implement ONLY this one task, following its steps EXACTLY. The task's code blocks and verification ` +
  `commands are authoritative. Run every verification exactly as written; do not skip them. ` +
  `You have NO way to ask a human: any question, ambiguity, or needed decision MUST be returned as ` +
  `status:"blocked" with the question in "blocker" — never wait for, assume, or invent a human answer. ` +
  `Do NOT improvise past the plan: if a verification fails after one honest retry, a dependency is missing, ` +
  `or reality diverges from the plan's code — return status:"blocked" with a precise blocker (what is wrong + what you tried). ` +
  `Never fake a pass, never leave a TODO stub, never forge ahead. ` +
  `Commit exactly as the task's commit step says, staging only the files THIS task changed (use "git add -u" or explicit paths, ` +
  `never "git add -A"/"git add ." which sweeps unrelated untracked files). Never touch main/master, never force-push, never amend/rebase existing commits. ` +
  `Build only THIS task — do not start any other.`

const taskRef = (t) =>
  `Plan file: ${PLAN_PATH}\nYour task section heading (EXACT): ${t.heading}\n` +
  `Open the plan and read that section — everything from your heading up to (but excluding) the next "### Task"/"## " heading: ` +
  `its **Files:** block, every "- [ ]" step (in order), all code fences, and the commit step. That section is AUTHORITATIVE; implement it verbatim.`

const implementPrompt = (t, extra = '') =>
  `You are implementing ONE task (${t.id}: ${t.title}) from an implementation plan.\n\n${taskRef(t)}\n\n` +
  (CHECKS.length ? `=== PROJECT-WIDE CHECKS (run if the task calls for them) ===\n${CHECKS.join('\n')}\n\n` : '') +
  `=== RULES ===\n${RULES}\n${extra}\n\nReturn the structured result.`

const reviewPrompt = (t, r, re = false) =>
  `${re ? 'RE-review' : 'Independently review'} the just-completed task ${t.id} ("${t.title}"). ` +
  `Its authoritative spec is the section headed "${t.heading}" in the plan at ${PLAN_PATH} — read it. ` +
  `Read the latest commit's diff (e.g. \`git show HEAD\`) and check it against that section's intent and verifications. ` +
  `Be adversarial: a clean pass is suspicious. Flag missing edge cases, skipped/weakened verifications, faked red→green, ` +
  `type/signature drift, security issues, or steps not actually done.\n\n=== IMPLEMENTER REPORT ===\n${JSON.stringify(r, null, 2)}`

const diffCheckPrompt = (t, r) =>
  `Cheap integrity check of task ${t.id} ("${t.title}"). Its spec is the section "${t.heading}" in ${PLAN_PATH}. ` +
  `Read the latest commit's diff (\`git show HEAD\`). Verdict "fail" ONLY if: a stated verification command was not actually run, ` +
  `or a test assertion / expected output was weakened, skipped, deleted, or made trivially-true to force a green. ` +
  `You are NOT re-reviewing design — just guarding against gamed verification.\n\n=== IMPLEMENTER REPORT ===\n${JSON.stringify(r, null, 2)}`

const results = []
let blocked = null

for (let i = START; i < TASKS.length; i++) {
  const t = TASKS[i]
  phase('Execute')
  const r = await agent(implementPrompt(t), { label: `task ${t.id}: ${t.title}`, phase: 'Execute', model: t.model, schema: TASK_RESULT })

  if (!r || r.status !== 'done') {
    blocked = { index: i, task: t.id, title: t.title, committed: !!(r && r.commit), failureMode: 'implementer-blocked', result: r, review: null }
    break
  }

  if (t.reviewLevel === 'independent') {
    phase('Review')
    const reviewModel = atLeast(t.model, 'sonnet')   // opus task -> opus reviewer, fable -> fable; never weaker than implementer
    const rev = await agent(reviewPrompt(t, r), { label: `review ${t.id}`, phase: 'Review', model: reviewModel, schema: REVIEW_RESULT })

    if (!rev || rev.verdict === 'fail') {            // skipped review is handled like a failed one — never a silent pass
      const issues = rev ? rev.issues : ['Independent review was skipped — re-verify the whole task before it can be accepted.']
      const repairModel = bump(t.model)              // repair runs one tier above the implementer, capped at fable
      phase('Execute')
      const fix = await agent(implementPrompt(t, `\nA reviewer flagged problems with the prior attempt — fix them, then re-verify:\n- ${issues.join('\n- ')}`),
        { label: `repair ${t.id}`, phase: 'Execute', model: repairModel, schema: TASK_RESULT })
      phase('Review')
      const rev2 = (fix && fix.status === 'done')
        ? await agent(reviewPrompt(t, fix, true), { label: `re-review ${t.id}`, phase: 'Review', model: atLeast(repairModel, 'sonnet'), schema: REVIEW_RESULT })
        : null
      if (!fix || fix.status !== 'done' || !rev2 || rev2.verdict === 'fail') {
        const failureMode = (!fix || fix.status !== 'done') ? 'repair-blocked' : 'review-failed-after-repair'
        blocked = { index: i, task: t.id, title: t.title, committed: !!((fix && fix.commit) || r.commit), failureMode, result: fix || r, review: rev2 || rev }
        break
      }
      results.push({ id: t.id, reviewLevel: t.reviewLevel, ...fix }); continue
    }
    results.push({ id: t.id, reviewLevel: t.reviewLevel, ...r }); continue
  }

  if (t.reviewLevel === 'diff-check') {
    phase('Review')
    const chk = await agent(diffCheckPrompt(t, r), { label: `diff-check ${t.id}`, phase: 'Review', model: 'haiku', schema: REVIEW_RESULT })
    if (!chk || chk.verdict === 'fail') {            // skipped check is not a pass either
      blocked = { index: i, task: t.id, title: t.title, committed: !!r.commit, failureMode: chk ? 'diff-check-failed' : 'diff-check-skipped', result: r, review: chk }
      break
    }
    results.push({ id: t.id, reviewLevel: t.reviewLevel, ...r }); continue
  }

  results.push({ id: t.id, reviewLevel: t.reviewLevel, ...r })   // self
}

log(`Executed ${results.length} task(s) from index ${START}` + (blocked ? `; blocked at index ${blocked.index} (${blocked.task}, ${blocked.failureMode})` : '; all done'))
return { completed: results, blocked, total: TASKS.length, startIndex: START }
```

## After the workflow returns

- **If all `done`:** combine `completed` with any results carried forward from an
  earlier run (see resume) and hand back to the skill's **Phase 3 (Complete the
  branch)** — full suite + lint/typecheck, confirm green, present completion
  options. Never merge to `main`/`master` without explicit consent.

- **If `blocked` is set:** STOP — do not auto-continue; later tasks depend on the
  failed one. Surface the blocker to the user with the **failure mode** made
  explicit (the structured object distinguishes them):
  - `implementer-blocked` — report `result.blocker`.
  - `diff-check-failed` / `diff-check-skipped` — the committed diff failed (or
    skipped) the integrity check; report `review.issues`.
  - `review-failed-after-repair` — reviewer rejected, repair ran, re-review still
    failed; report `review.issues` + `result.summary`.
  - `repair-blocked` — the repair pass itself blocked; report `result.blocker`.
  Then ask how to proceed (fix/clarify the plan, fix the environment, skip, or
  abort).

- **Resume — one canonical mechanic.** Re-author and re-run the **same** script
  (whole `TASKS` array, so indices never shift) with the `START` constant set per
  the committed flag. Pin the failed task's tier first (bump one tier capped at
  `fable`, `reviewLevel → independent`; never re-derive it downward):
  - `blocked.committed === false` (nothing landed for the failed task) → set
    `START = blocked.index` and re-run.
  - `blocked.committed === true` (a `review-failed-after-repair` / `repair-blocked`
    task already left commit(s) on the branch) → you may **not** silently re-run
    that index: the subagent rules forbid amending/rebasing, so a re-run would
    duplicate or diverge. Reconcile with the human first — **either** accept the
    committed work after their review and set `START = blocked.index + 1`,
    **or** get explicit consent for a destructive `git reset --hard <prior task's
    commit>` to discard it, then set `START = blocked.index`.
  - **Terminal:** if the failed task was already `fable` + `independent`, do **not**
    auto-retry — stop for human plan/environment fixes; resume only once the human
    has changed something.
- **Carry results forward.** A resume run's `completed` covers only
  `startIndex…end`. When you report final status, **combine** it with the prior
  run's accepted results (everything before the resume point) — a partial run must
  never read as a complete one. Don't silently re-run a task that already
  committed and was accepted.
- **Don't silently cap.** If you bound execution (e.g. stop after N tasks for a
  review checkpoint), `log()` it and tell the user.
