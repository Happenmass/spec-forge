---
name: arch-triage
description: >-
  Investigate architecture-level / systemic issues in an existing codebase:
  silent failures, hangs, lost messages or events, intermittent no-response,
  cross-module races, resource leaks — anything whose root cause could plausibly
  live in several components at once, and especially anything where "the logs
  show nothing". Maps the symptom onto the end-to-end architecture chain,
  dispatches parallel read-only investigation subagents (one per chain segment,
  model-routed sonnet/opus, plus an observability blind-spot auditor),
  cross-verifies their top findings against primary evidence, and delivers a
  ranked root-cause report with prioritized fix recommendations, a logging
  supplement list, and an on-site diagnostic playbook. Use when the user says
  "整体梳理潜在原因", "架构层面排查", "偶发无响应/卡死/丢消息", "日志没有异常但没反应",
  "systemic issue", "works sometimes", "potential causes sweep", or asks to fan
  out subagents to investigate a complex cross-cutting problem. NOT for a
  single-point, reliably reproducible functional bug in one module — that needs
  a single-bug debugging flow, not a chain-wide triage.
when_to_use: >-
  Scope gate: use when the root cause is plausibly in more than one component,
  the issue is intermittent or silent (clean logs), or the user asks for a
  whole-chain / potential-cause sweep rather than a fix for one known-broken
  function. If the bug is reproducible and localized to one module, use a
  single-bug debugging flow instead. This skill is read-only — it never
  modifies the repo (only writes its report); fixes hand off to
  spec-forge:quick-spec / full-spec → writing-plans → executing-plans.
argument-hint: "[symptom description]"
allowed-tools: "Read Grep Glob Bash Agent Write TodoWrite AskUserQuestion"
---

# Architecture Triage

## Overview

Turn a vague systemic symptom ("no response after input, logs look clean") into
a **ranked, evidence-backed portfolio of root-cause candidates** plus a concrete
path to resolution. The engine: map the symptom onto the end-to-end architecture
chain, give each chain segment to a parallel **read-only** investigation
subagent with a structured brief, have one extra subagent audit why the failure
is invisible in logs, then **personally cross-verify** the top findings before
writing the report.

**Announce at start:** "I'm using the arch-triage skill to investigate this."

**Downstream:** fixes are never implemented here. Scoped fixes hand off to
`spec-forge:quick-spec`; systemic fixes to `spec-forge:full-spec` /
`spec-forge:writing-plans` → `spec-forge:executing-plans`.

## Operating Principles

- **Decompose by chain segment, not by directory.** The symptom travels a path
  (entry → queue → processing loop → external calls → event fan-out →
  delivery). Segment ownership lets each lane go deep enough to enumerate
  silent-failure modes, and the union of segments covers the whole path so
  nothing falls between chairs. Boundary overlap between lanes is intentional —
  races live at boundaries; dedupe at synthesis, not at dispatch.
- **Enumerate failure modes, don't hunt "the bug".** Architecture-level issues
  usually can't be reproduced on demand. The deliverable is a ranked portfolio
  of candidate mechanisms — each with trigger condition and evidence — that can
  then be verified, fixed, or instrumented. A lane that returns "no failure
  modes found in my segment" has still narrowed the chain; that is a result.
- **Negative evidence is a first-class clue.** "Logs show nothing" is itself
  data. It earns a dedicated observability-audit lane, and every failure mode
  any lane reports must explain *why current logs are silent about it* — a
  candidate that should have logged loudly but didn't is either wrong or has
  found a log blind spot worth fixing either way.
- **Force comparability.** Every lane returns the same structure (numbered
  failure modes, trigger, `file:line` evidence, why-silent, high/med/low
  likelihood with reasons). Without forced scoring and evidence, four lane
  reports cannot be merged into one ranking.
- **Verify before you headline.** Subagents under "enumerate exhaustively"
  pressure will produce some plausible-but-wrong claims. Every finding that
  would lead the report gets re-checked by you against the actual code first.

## The Process

### Phase 0 — Frame: symptom → chain (interactive)

1. **Pin the symptom precisely**, including what is *not* observed: exact
   trigger, observed behavior, absent behavior (no events? no errors? no
   logs?), frequency (always / intermittent), environment (prod/test,
   single/multi-instance), since-when. If essentials are missing and the repo
   can't answer them, ask the user — one `AskUserQuestion` round at most, then
   proceed with stated assumptions.
2. **Recon the repo yourself** (fast pass, Glob/Grep/Read — minutes, not an
   audit): reconstruct the end-to-end chain the affected request/data travels,
   hop by hop, with the real class/file names at each hop. Check `docs/` (and
   `docs/plans/`, ADRs, incident notes) for **known-issue specs describing the
   same symptom class** — these are gold: a documented fix that never landed is
   frequently the head suspect, and lane briefs must demand a landed-or-not
   audit with `file:line` proof.
3. **State the chain and the inference rule** to the user in a short paragraph
   before dispatching anything, e.g.: "Chain: API submit → Redis queue/lock →
   drain → orchestrator loop → LLM streaming → event listeners → Pub/Sub → SSE.
   Any segment failing *silently* produces exactly this symptom. Dispatching N
   lanes (1 opus + N−1 sonnet) plus a log-coverage audit." This is the cheapest
   moment to be corrected.

### Phase 1 — Decompose & dispatch (parallel, read-only)

- **Cut the chain into 3–5 segment lanes.** Merge tiny adjacent segments; split
  any segment too dense for one agent to enumerate honestly. Add the
  **observability-audit lane** whenever silence is part of the symptom (it
  audits log/metric coverage across the *whole* chain and produces the
  instrumentation plan — it is a cross-cutting lane, not a segment).
- **Route models per lane:**

  | Lane | Model |
  | --- | --- |
  | Default segment lane | `sonnet` |
  | The segment with the densest concurrency/state-machine logic, or your #1 suspicion from recon | `opus` |
  | Observability audit | `sonnet` |

- **Write each brief from the template** in
  `${CLAUDE_SKILL_DIR}/reference/lane-brief-template.md`. Non-negotiable blocks:
  read-only constraint; context (root path, stack, deployment shape) + the
  symptom *with its negative evidence*; the mission ("enumerate **all** code
  paths in this segment that could cause <symptom class> silently"); **named
  suspects** from your recon (concrete classes, configs, known-issue docs to
  cross-check); and the mandatory output contract. The named-suspects block is
  what separates a deep lane from a shallow grep — it carries your Phase-0
  knowledge into the lane.
- **Dispatch every lane in ONE message** (multiple `Agent` calls, type
  `general-purpose`, in a single response) so they run concurrently. Then wait —
  don't duplicate their work while they run.

### Phase 2 — Cross-verify (yours, not delegable)

- For **every finding rated High** — and any finding that would headline the
  report or drive a P0 recommendation — open the cited evidence yourself with
  targeted Read/Grep. Confirm the *mechanism*, not just that the line exists:
  does the claimed behavior actually follow from this code? (Typical checks:
  does the serializer really emit the field as `null`? is the subscription
  really created per-connection rather than at startup?)
- **Demote or drop** findings that don't survive; keep a one-line record of
  each demotion and why — it goes in the report appendix so the reader can see
  what was considered and excluded.
- **Dedupe boundary overlaps** across lanes; when two lanes disagree about the
  same mechanism, primary evidence wins — never average likelihoods.
- **If everything comes back low-likelihood or dies under verification**:
  re-slice once along a different axis (lifecycle phases instead of layers;
  control plane vs data plane; per deployment unit) and dispatch one focused
  second round carrying everything learned so far. One re-slice, then report
  honestly what was ruled out and what remains undecidable from code alone.

### Phase 3 — Synthesize, report, hand off

1. **Write the report** to `docs/arch-investigations/<YYYY-MM-DD>-<slug>.md`
   (get the date from `date +%F`; create the directory if needed). Structure
   per `${CLAUDE_SKILL_DIR}/reference/report-template.md`: symptom & scope →
   suspect chain → ranked root-cause candidates (verified flag + evidence) →
   prioritized fixes → logging supplements → on-site diagnostic playbook →
   appendix of demoted findings.
2. **Give the user the TLDR in conversation**: the top 2–3 suspects (mechanism,
   likelihood, evidence pointer) and the single highest-leverage next action.
   Don't make them read the report to learn the verdict.
3. **Hand off, don't fix.** Offer the concrete next step and let the user pick:
   - Top fix is scoped (one module) → `spec-forge:quick-spec`.
   - Fixes are systemic / multi-module → `spec-forge:full-spec` or straight to
     `spec-forge:writing-plans` if requirements are already clear.
   - A fix spec already exists in the repo but never landed → point directly at
     `spec-forge:writing-plans` / `executing-plans` with that spec.
   - **No candidate is provable from code alone** → the logging supplement list
     *is* the next action: implement instrumentation, wait for recurrence, run
     the diagnostic playbook. Say so plainly rather than overclaiming a root
     cause.

## Red Lines

- **Read-only.** The only file this skill writes is its own report. No code
  edits, no config edits, no "tiny obvious fix on the way" — fixes go through
  the spec → plan → execute pipeline where they get review.
- **No unverified headline.** A finding you did not personally re-check against
  the code may not appear as a top-ranked cause.
- **Every failure mode explains the silence.** If a candidate can't explain why
  existing logs missed it, it's incomplete.
- **All lanes in one message.** Serial dispatch wastes the user's wall-clock
  for nothing.
- **Never end on "it could be many things."** Rank, verify, and name the top
  suspect with evidence — or name exactly which instrumentation will decide
  between the finalists.

## Workflow Position

- **Upstream:** a systemic symptom from the user (often with "logs show
  nothing"). No spec or plan needs to exist.
- **Downstream:** `spec-forge:quick-spec` (scoped fix) or
  `spec-forge:full-spec` → `spec-forge:writing-plans` →
  `spec-forge:executing-plans` (systemic fix). The report file is the artifact
  the downstream spec cites as its motivation.
