---
name: executing-plans
description: >-
  Use when you have a written implementation plan to execute. Drives the plan
  through a multi-agent Workflow — one fresh subagent per task, run sequentially,
  each implementing its bite-sized steps and verifications exactly, with the
  model chosen per task (haiku mechanical, sonnet standard, opus complex /
  high-stakes, fable frontier-apex) and an independent reviewer on complex
  tasks. Stops and
  escalates on any blocker, degrades to linear in-session execution when Workflow
  is unavailable, and finishes the branch when green. Executes plans produced by
  spec-forge:writing-plans. Use when the user wants to "execute the plan",
  "implement this plan", "run the implementation plan", or "按计划实现/执行计划".
when_to_use: >-
  After an implementation plan exists (typically from spec-forge:writing-plans)
  and you are ready to implement. Prefer the Workflow engine (subagent per task,
  per-task model routing); fall back to inline execution only when Workflow is
  unavailable. Stop and escalate on any blocker; never start implementation on
  main/master without explicit consent.
argument-hint: "[plan path]"
allowed-tools: "Read Grep Glob Bash Edit Write TodoWrite AskUserQuestion Workflow Agent"
---

# Executing Plans

## Overview

Load the plan, review it critically, then **execute it as one fresh subagent per
task** — sequentially, each at a model chosen for that task's complexity, with an
independent reviewer on the complex ones — and finish the branch when everything
is green. Blockers stop execution and come back to you; subagents never guess
past an unclear step or a failing verification.

**Announce at start:** "I'm using the executing-plans skill to implement this
plan."

**Upstream:** Execute a plan produced by `spec-forge:writing-plans` (which in
turn consumes a spec from `spec-forge:full-spec` / `spec-forge:quick-spec`).

**Engine:** This skill is **Workflow-first** — it runs a subagent per task so
each gets fresh context and a cost-appropriate model. It degrades to linear
in-session execution if `Workflow` is unavailable. If the Superpowers plugin is
installed and you prefer its two-stage flow, `superpowers:subagent-driven-development`
remains a fine alternative.

**The engine recipe** (adaptable Workflow script + schemas + routing rubric) lives
in `${CLAUDE_SKILL_DIR}/reference/execution-workflow.md`. Read it before Phase 2.

## The Process

### Phase 0 — Load, review, and isolate (interactive)
1. Read the plan file (`$ARGUMENTS` may hold the path).
2. Review it critically — identify questions or concerns about the plan itself
   (gaps, undefined types, missing verifications, ordering problems).
3. If concerns: raise them with your human partner **before** starting.
4. **Branch isolation:** confirm you are on a feature branch, not `main`/`master`.
   If on `main`/`master`, stop and get explicit consent (or create/switch to a
   branch via your harness's worktree tooling, or `superpowers:using-git-worktrees`
   if Superpowers is installed). **Never start implementation on `main`/`master`
   without explicit user consent.**

### Phase 1 — Classify tasks & route models (interactive)
**Parse the plan into its ordered tasks.** `writing-plans` emits `### Task N:
[Component Name]` headings, each with a `**Files:**` block and `- [ ]` checkbox
steps containing code fences and a commit step. For each task capture only
lightweight metadata: `id = "Task N"`, `title = [Component Name]`, and the **exact**
`heading` line. Do **not** copy each task's body into the script — the subagent
reads its authoritative section straight from the plan file by that heading
(everything up to the next `### Task`/`## ` heading). Note the plan's **absolute**
path.

**Discover `projectChecks`** — the repo's declared test/lint/typecheck commands,
from `package.json` scripts, `CLAUDE.md`, a `Makefile`, or the plan's own
commands; if none are discoverable, leave it empty and rely on per-task commands.
Phase 3 reuses this same set.

**Classify each task** by complexity and assign a model + review level:

| Tier | Model | The task is… | Review |
| --- | --- | --- | --- |
| **Mechanical** | `haiku` | **Provably** verbatim: 100% literal code/config to apply, one small file, no logic to author, no unseen signature to match, a single deterministic verification command. **Opt-in — justify against every signal.** Safe examples: add a constant/enum value, a docstring/comment, a literal string in one file. | self |
| **Standard** | `sonnet` | The default. Plan supplies the code; agent integrates it against real signatures, runs red→green, reconciles minor drift. | `diff-check` if it adds/modifies tests or assertions, else self |
| **Complex / high-stakes** | `opus` | Judgment-heavy or risky: ambiguous step, auth/crypto/security surface, concurrency/transactions, non-trivial algorithm/parser, cross-cutting refactor (~4+ files), public API/contract change, or the plan flags risk / leaves a decision open. | independent |
| **Frontier (rare)** | `fable` | The apex — reserve for a task the plan itself marks as its highest-stakes change: an irreversible migration, security-critical core logic, or a novel algorithm specified by intent rather than code. Also the landing tier for an `opus` task retried after a block. Not a default — most plans have zero Frontier tasks. | independent |

The tier aliases resolve to real models at run time — confirmed: `haiku` →
Haiku 4.5, `sonnet` → Sonnet 4.6, `opus` → Opus 4.8, `fable` → Fable 5.

- **Default up, don't round on doubt.** The misroute that hurts is a *subtly*
  complex task read with false confidence as trivial — so anything **not provably
  mechanical is Standard**. If a task carries a `**Risk:**` line from the plan,
  treat it as a **floor** — route at least as high as it implies, never lower. A task is **never** Mechanical (promote it) if it
  touches auth/security or a behavior-gating config key, crosses a module or
  public/serialized boundary, renames beyond a single private symbol in one file,
  must match a signature it can't see, or lacks a single deterministic check.
- **Reviewer is never weaker than the implementer** — an `opus` task gets an
  `opus` reviewer, a `fable` task a `fable` reviewer; independence comes from a
  fresh context, not a cheaper model.
  `diff-check` is a deliberately cheap `haiku` integrity check (did the diff
  actually run the stated commands without weakening a test?), not a downgrade.
- **Retry escalation (bounded).** A task retried after a block bumps one tier
  **capped at `fable`** and gains `independent` review (the repair pass after a
  failed review likewise runs one tier above the implementer). A task already at
  `fable` + `independent` that re-blocks does **not** auto-retry — it hard-stops
  for human resolution. On resume, a failed task's tier is **pinned**, never
  lowered.
- **Show the user the mapping** (a short `task → tier → model → review` table),
  let them override, then **write any overrides back into each task's `model`/
  `reviewLevel`** before authoring the Workflow — the script is built from the
  final, post-override classification. A fast confirmation, not a long interview.

### Phase 2 — Execute (multi-agent Workflow; preferred)
- **Preferred:** author and run a **Workflow** per
  `reference/execution-workflow.md`. **Inline the Phase-1 classification as
  constants** in the script — absolute `PLAN_PATH`, the lightweight `TASKS`
  metadata (`{id, title, heading, model, reviewLevel}`, *not* the bodies),
  `CHECKS`, `START = 0`. **Do not rely on `args` threading**: an unset or
  JSON-stringified `args` makes `args.tasks` `undefined` and crashes the run at
  line 1 before any task starts — so the recipe inlines and guards that `TASKS` is
  non-empty first. Then: one subagent per task, **sequential** (each builds on the
  previous commit, on the shared working tree — no worktree isolation), at the
  task's assigned `model`. The review gate scales with risk — `self`, a cheap
  `diff-check`, or a tier-matched `independent` review with one bounded repair
  pass. Each subagent **reads its authoritative task section from the plan file by
  exact heading**, follows its steps and verifications exactly, commits **staging
  only what it changed** (`git add -u` / explicit paths, never `-A`/`.`), surfaces
  any question as a `blocked` result (it cannot ask a human), and never fakes a
  pass.
- **On the first `blocked` result the workflow halts** and returns the blocker
  with its `index`, `failureMode`, and whether the task left a `commit`. Bring it
  to the user — name the failure mode (`implementer-blocked`, `diff-check-failed`,
  `diff-check-skipped`, `review-failed-after-repair`, `repair-blocked`) and the
  exact blocker — and ask
  how to proceed. Then **resume** by re-running the *same* workflow with
  `startIndex` set per the recipe's "After the workflow returns" rules (mind the
  committed-task reconciliation so a committed task is never silently re-run), and
  combine the resume run's results with the already-accepted ones for final
  reporting. Do **not** auto-continue past a blocker.
- **Fallback (Workflow unavailable):** execute linearly in this session — create a
  TodoWrite list, then for each task in order: mark in_progress → follow its steps
  exactly → run its verifications → commit → mark completed. The recipe's **"Hard
  rules every subagent is given"** are **binding here too** (one honest retry then
  stop and ask; never skip a verification; never fake a pass or `TODO`-stub; never
  amend/rebase/force-push; never touch `main`/`master`). **Preserve the review
  gate:** for any task Phase 1 classified `independent`, still get a second set of
  eyes before moving on — dispatch a reviewer subagent with **Agent**, or at
  minimum re-read the committed diff adversarially against the task's intent. State
  that you used the fallback engine.

### Phase 3 — Complete the branch (interactive)
After all tasks complete and verified:

- **If the Superpowers plugin is installed:** announce "I'm using the
  finishing-a-development-branch skill to complete this work." and use
  `superpowers:finishing-a-development-branch`.
- **Otherwise (inline fallback):** run the full test suite plus any lint /
  typecheck the project defines; confirm everything is green. Then present
  completion options and execute the chosen one:
  1. Open a pull request from the branch.
  2. Merge to the integration branch.
  3. Leave the branch as-is for manual review.
  **Never merge to `main`/`master` without explicit user consent.**

## When to Stop and Ask for Help

**STOP executing immediately when:**
- A task subagent returns `blocked` (missing dependency, verification fails, an
  instruction is unclear, or reality diverges from the plan's code).
- The plan has critical gaps preventing a start.
- An independent reviewer fails a task and the bounded repair pass can't fix it.
- Verification fails repeatedly.

**Ask for clarification rather than guessing.** Subagents are told to surface
blockers as data, never to forge ahead — honor that at the orchestrator level too.

## When to Revisit Earlier Steps

**Return to Phase 0/1 when:**
- Your partner updates the plan based on your feedback (re-review, re-classify).
- The fundamental approach needs rethinking.

**Don't force through blockers** — stop and ask.

## Remember
- Review the plan critically first; isolate the branch before touching code.
- Prefer the Workflow engine; one subagent per task, fresh context, routed model.
- Follow plan steps exactly; don't skip verifications; default up on model doubt
  — anything not provably mechanical is Standard.
- Reference skills when the plan says to.
- Stop when blocked, don't guess; resume per the recipe (re-run from the blocked
  index via `startIndex`), and reconcile any committed-but-blocked task with the
  user before resuming — never silently re-run a task that already committed.
- Never start implementation on `main`/`master` without explicit user consent.

## Workflow Position

- **Upstream:** `spec-forge:writing-plans` creates the plan this skill executes.
- **Isolation:** ensure an isolated worktree/branch before implementing — your
  harness's native worktree tooling, or `superpowers:using-git-worktrees` if the
  Superpowers plugin is installed.
- **Completion:** finish via the Phase-3 inline fallback, or
  `superpowers:finishing-a-development-branch` if Superpowers is installed.

---

*Ported and adapted from [Superpowers](https://github.com/obra/superpowers)
v5.1.0 by Jesse Vincent, used under the MIT License. The Workflow execution
engine (subagent-per-task with per-task model routing and review, in
`reference/execution-workflow.md`) is an original spec-forge addition, inspired
by `superpowers:subagent-driven-development`. See `NOTICE.md` at the plugin root.*
