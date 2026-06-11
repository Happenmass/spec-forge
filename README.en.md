# Spec Forge

[中文](README.md) | **English**

A Claude Code plugin that runs the full **spec → plan → execute** pipeline for a
coding agent: turn a requirement into an **implementable specification**, turn
the spec into a **bite-sized TDD implementation plan**, then **execute** that
plan as one fresh subagent per task, each routed to a complexity-matched model
with review scaled to risk. Around the pipeline it ships two companions:
**`arch-triage`**, a parallel-lane investigator for systemic issues in existing
systems whose report feeds the pipeline, and **session-ledger** (MCP + hooks),
a cross-session change ledger that keeps multiple Claude Code sessions sharing
one working directory out of each other's way.

The spec method is reverse-engineered from a Symphony-grade reference spec and
captured as a reusable authoring guideline, at **two altitudes** (large and
small). The planning + execution skills are ported from
[Superpowers](https://github.com/obra/superpowers) (MIT) and wired into the
pipeline.

## Skills

| Command | Stage | Scope | Status |
| --- | --- | --- | --- |
| `/spec-forge:full-spec` | spec | **Large / system-level** requirements (a PRD, a new service or platform, a multi-module feature) | ✅ shipped |
| `/spec-forge:quick-spec` | spec | **Single-point / single-module** small features (a function, an endpoint, a flag, a scoped bug fix) | ✅ shipped |
| `/spec-forge:writing-plans` | plan | Turn a spec into a bite-sized, TDD-structured implementation plan | ✅ shipped |
| `/spec-forge:executing-plans` | execute | Execute a plan as one fresh subagent per task (Workflow), each routed to a complexity-matched model, with review scaled to risk | ✅ shipped |
| `/spec-forge:arch-triage` | triage | **Architecture-level / systemic issue** investigation (silent failures, hangs, lost events, intermittent no-response) — parallel read-only lane subagents + cross-verification → ranked root-cause report | ✅ shipped |

**The pipeline:** `full-spec` / `quick-spec` → `writing-plans` →
`executing-plans`. Each stage hands off to the next; you can also enter at any
stage if you already have the upstream artifact. `arch-triage` is the
**side door for existing systems**: it investigates a systemic symptom and its
report feeds the pipeline as the motivation for a `quick-spec`/`full-spec`.

Not sure which spec skill? Start with `quick-spec` — it runs an escalation gate
first and tells you to switch to `full-spec` the moment the change is actually
big (new state machine, persistence schema, service boundary, multi-tenancy, or
external integration contract).

### `/spec-forge:full-spec`

Turns a large requirement into a complete spec with a typed domain model, state
machines, a configuration contract, a failure model, language-agnostic reference
algorithms, security invariants, a test/validation matrix, and a
Definition-of-Done checklist with conformance profiles — all RFC 2119-normative.

It works in three phases:

1. **Scope & section-set derivation** — applies the guideline's portability
   rules and trigger questions, then interviews you (a couple of batched
   question rounds) to fix the genuine unknowns and architecture decisions.
2. **Draft + adversarially verify** — fans out a multi-agent `Workflow`: one
   drafting agent per section, then four independent verifiers (rubric &
   anti-patterns, traceability, normative discipline, an implementer dry-run),
   then synthesis. Degrades to single-agent linear drafting if `Workflow` is
   unavailable.
3. **Verify, finalize, deliver** — runs the quality rubric and traceability /
   normative-discipline gates, then writes the spec to a file.

### `/spec-forge:quick-spec`

The lightweight sibling. Turns a small change that lives inside an existing
codebase into a tight **one-page** spec: a typed behavior contract, an
edge-case/error table, and concrete acceptance examples — and nothing heavier.

It is deliberately fast and single-pass (no multi-agent workflow):

1. **Escalation gate** — checks whether the change is actually small; if it trips
   a trigger (state machine, persistence schema, service boundary, multi-tenancy,
   external integration), it stops and points you to `full-spec`.
2. **Codebase anchoring** — reads the target module and pins the *real* file
   paths, signatures, and types, so the spec reuses existing idioms instead of
   inventing a parallel vocabulary.
3. **Write + self-review** — fills the compact skeleton, dropping every optional
   section whose surface is absent, then runs a short anti-bloat checklist.

### `/spec-forge:writing-plans`

Takes a spec (from either spec skill) and produces a comprehensive
implementation plan as **bite-sized TDD tasks** — exact file paths, real code in
every step, exact test commands with expected output, frequent commits, and no
placeholders. Includes a self-review pass against the spec and an optional
plan-document reviewer template. Hands off to `executing-plans`. Default output:
`docs/plans/YYYY-MM-DD-<feature>.md`.

### `/spec-forge:executing-plans`

Executes a written plan **as one fresh subagent per task** via a `Workflow`: it
loads the plan, reviews it critically, classifies each task by complexity and
routes it to a matched model (`haiku` mechanical / `sonnet` standard / `opus`
complex / `fable` rare frontier-apex), runs the tasks **sequentially** (each
builds on the previous commit),
adds an independent reviewer on the complex ones, stops and escalates on any
blocker, and finishes the branch when green (present merge/PR options). Degrades
to linear in-session execution if `Workflow` is unavailable. Never starts on
`main`/`master` without consent. The engine recipe (adaptable Workflow script +
routing rubric) lives in `executing-plans/reference/execution-workflow.md`.

### `/spec-forge:arch-triage`

Investigates **architecture-level / systemic issues** in an existing codebase —
silent failures, hangs, lost messages, intermittent no-response, anything where
"the logs show nothing". It maps the symptom onto the end-to-end architecture
chain, dispatches **parallel read-only investigation subagents** (one per chain
segment, the densest segment on `opus`, plus a cross-cutting observability
blind-spot auditor), forces every lane into a comparable output contract
(numbered failure modes, trigger, `file:line` evidence, why-the-logs-are-silent,
high/med/low likelihood), then **personally cross-verifies the top findings**
before writing a ranked root-cause report to
`docs/arch-investigations/YYYY-MM-DD-<slug>.md` — with prioritized fixes, a
logging supplement list, and an on-site diagnostic playbook. Strictly
read-only; fixes hand off to `quick-spec` / `writing-plans`. Lane-brief and
report templates live in `arch-triage/reference/`.

## Session Ledger (MCP + hooks)

Bundled companion component (`session-ledger/`) for the *other* multi-session
problem: several Claude Code sessions sharing **one working directory**, each
getting confused by uncommitted changes it didn't make. It gives every session,
indexed by working directory (git toplevel):

- **Deterministic recording** — a `PreToolUse` hook auto-records every
  `Write`/`Edit`/`MultiEdit`/`NotebookEdit` into a shared per-directory ledger
  (who, which file, when, under which declared goal). No reliance on the model
  remembering to report.
- **Pre-write conflict advisory (warn-once)** — the first attempt to touch a
  file another session is editing (or a dirty file nobody recorded) is denied
  with an explanation; a knowing retry goes through. Turns "after-the-fact
  backtracking" into "before-the-fact avoidance".
- **Session-start briefing** — a `SessionStart` hook injects a summary of other
  sessions' in-progress work into the new session's context.
- **MCP tools** — `start_task(goal, planned_files?)` declares intent (and warns
  about conflicts at declaration time), `list_active_changes()` shows all
  in-progress work in the directory, `who_changed(file)` attributes a specific
  diff.
- **Auto-archive after commit** — entries whose files are clean again are
  lazily reconciled against `git status` and archived with a short commit
  traceback (sha + subject).

Zero-dependency pure Node; registered automatically via the plugin's
`.mcp.json` and `hooks/hooks.json`. Design notes, storage layout, and limits:
[`session-ledger/README.md`](session-ledger/README.md). Regression:
`bash session-ledger/smoke-test.sh`.

> **Interop:** the two planning skills are ported from Superpowers and stay
> compatible with it. When the Superpowers plugin is installed they offer its
> skills at the relevant steps — `subagent-driven-development` (execution, as a
> `writing-plans` hand-off alternative), `using-git-worktrees` (isolation), and
> `finishing-a-development-branch` (completion, in `executing-plans`); otherwise
> they fall back to self-contained inline behavior.

## Layout

```
spec-forge/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── full-spec/                            # spec — large / system-level requirements
│   │   ├── SKILL.md                          # orchestration (lean)
│   │   └── reference/
│   │       ├── guideline.md                  # THE METHOD (large) — reusable authoring guideline
│   │       ├── workflow-recipe.md            # Phase-2 multi-agent Workflow recipe + script skeleton
│   │       └── example-symphony-spec.md      # calibration example (Symphony spec)
│   ├── quick-spec/                           # spec — single-module small features
│   │   ├── SKILL.md                          # orchestration (lean, single-pass)
│   │   └── reference/
│   │       └── guideline.md                  # THE METHOD (small) — the one-page lightweight guideline
│   ├── writing-plans/                        # plan — spec → bite-sized TDD plan (ported, MIT)
│   │   ├── SKILL.md
│   │   └── plan-document-reviewer-prompt.md  # optional reviewer-subagent template
│   ├── executing-plans/                      # execute — subagent-per-task via Workflow (ported + extended, MIT)
│   │   ├── SKILL.md                          # orchestration (lean) + model-routing rubric
│   │   └── reference/
│   │       └── execution-workflow.md         # Workflow engine recipe + script skeleton + routing rubric
│   └── arch-triage/                          # triage — systemic-issue investigation via parallel lanes
│       ├── SKILL.md                          # orchestration: chain mapping, lane dispatch, cross-verify
│       └── reference/
│           ├── lane-brief-template.md        # segment-lane + observability-audit brief skeletons
│           └── report-template.md            # ranked root-cause report structure
├── session-ledger/                           # cross-session change ledger (MCP server + hooks, zero-dep Node)
│   ├── core.mjs                              # storage, git reconciliation, conflict detection, PID binding
│   ├── hook.mjs                              # SessionStart briefing + PreToolUse warn-once advisory/recording
│   ├── server.mjs                            # stdio MCP server: start_task / list_active_changes / who_changed
│   ├── smoke-test.sh                         # end-to-end regression in a throwaway repo
│   └── README.md                             # design notes, storage layout, limits
├── .mcp.json                                 # registers the session-ledger MCP server
├── hooks/hooks.json                          # registers the session-ledger hooks
├── NOTICE.md                                 # third-party attribution (Superpowers, MIT)
├── README.md                                 # Chinese (default)
└── README.en.md                              # this file
```

- Each **spec** skill is self-contained: its `reference/guideline.md` is the
  method it applies. The two guidelines share DNA (unambiguous behavior, typed
  I/O, enumerated edge cases, verifiable done-ness) but the small one strips the
  heavyweight machinery (abstraction layers, conformance profiles, state
  machines) — it's ~1/5 the size.
- **`full-spec/reference/example-symphony-spec.md`** is used only to calibrate
  *quality and shape* — its architecture choices are deliberately re-derived per
  requirement, never copied.
- The **planning** skills (`writing-plans`, `executing-plans`) are ported and
  adapted from Superpowers; see [Credits](#credits) and `NOTICE.md`.

## Local install / testing

```bash
# Load the plugin directly from this directory (no marketplace needed):
claude --plugin-dir /Users/guhappen/code/claude_local_plugins_dir/spec-forge

# In the session, hot-reload after edits:
/reload-plugins

# Spec → plan → execute (provide the artifact inline or as a path):
/spec-forge:full-spec       We need a multi-tenant scheduled-jobs service that …
/spec-forge:quick-spec      Add a `parseRetryAfter` helper to src/http/client.ts
/spec-forge:writing-plans   ./SPEC.md
/spec-forge:executing-plans ./docs/plans/2026-06-06-scheduled-jobs.md
/spec-forge:arch-triage     用户输入后 SSE 经常没有任何响应，日志也看不到异常
```

The plugin also auto-discovers the `skills/` directory if you drop it into a
plugin path Claude Code already scans.

## Credits

The `writing-plans` and `executing-plans` skills are **ported and adapted from
[Superpowers](https://github.com/obra/superpowers) v5.1.0** by Jesse Vincent,
used under the MIT License. They were namespaced into this plugin, wired into the
spec → plan → execute pipeline, and had their Superpowers-only sub-skill
dependencies made optional (with inline fallbacks). Full attribution and the MIT
license text are in [`NOTICE.md`](NOTICE.md). The spec skills and their
guidelines are original work.

## Roadmap

- Spec + plan + execute + triage stages and the session-ledger companion
  shipped. Possible next steps: a single-point functional-bug sibling to
  `arch-triage`, a `marketplace.json` for one-click install, and a tiny
  `spec-lint` skill that checks an existing spec against the matching
  guideline's quality checklist.
