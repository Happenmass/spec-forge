---
name: full-spec
description: >-
  Turn a large or system-level requirement (a PRD, a new service or platform, a
  multi-module feature) into a complete, implementable, RFC 2119-normative
  specification that a coding agent can build working software from in
  essentially one pass. Produces a Symphony-grade spec: typed domain model,
  state machines, configuration contract, failure model, language-agnostic
  reference algorithms, security invariants, a test/validation matrix, and a
  Definition-of-Done checklist with conformance profiles. Use when the user
  wants to "write a spec", "把需求写成规范/spec", "turn this PRD/requirement into a
  spec", "design this system/service", or formalize a big requirement before
  implementation. NOT for single-function or single-module small features — a
  lighter quick-spec skill is intended for those.
when_to_use: >-
  Scope gate: large, multi-module, or system-level requirements. Defer tiny
  single-point / single-module features to the quick-spec skill. Triggers
  include "写一份 spec", "把这个需求写成完整规范", "system/service design doc",
  "formal spec before building".
argument-hint: "[requirement text | path/to/requirement.md]"
disable-model-invocation: false
user-invocable: true
allowed-tools: "Read Grep Glob Bash Write AskUserQuestion Workflow Agent"
---

# full-spec — forge a large requirement into an implementable specification

You convert a **large / system-level requirement** into a single, implementable
specification of the same quality as the bundled calibration example — i.e. a
coding agent can build conformant, working software from it in essentially one
pass, without having to invent a decision the author should have made.

The **method is not in this file**. It lives in the bundled guideline. Your job
is to *apply* that method through the phased process below. Do not freelance a
spec structure from memory — read and follow the guideline.

## Bundled references (read these, in this order)

1. **The method** — `${CLAUDE_SKILL_DIR}/reference/guideline.md`
   The authoritative, requirement-agnostic spec-authoring method: core
   principles (§2), the canonical section skeleton (§3), cross-cutting
   conventions (§4), per-artifact templates (§5), the quality rubric (§6),
   anti-patterns (§7), the copy-paste scaffold (§8), and a worked example (§9).
   **§0 is load-bearing** — portability, the §0.2 trigger table for net-new
   sections, and §0.4 (what MUST stay normative). Read §0 and §3 in full.
2. **The multi-agent recipe** — `${CLAUDE_SKILL_DIR}/reference/workflow-recipe.md`
   How to author the drafting + adversarial-verification Workflow in Phase 2,
   with an adaptable script skeleton and the verification schemas.
3. **Calibration example** — `${CLAUDE_SKILL_DIR}/reference/example-symphony-spec.md`
   A real Symphony-grade spec. Use it to calibrate *quality and shape only*.
   **Re-derive — never copy — its domain content** (§0.1: its in-memory state,
   file-based config, poll-pull integration, single-process model are
   exemplar-only choices, wrong for many requirements).

## Scope check (do this first, before any expensive work)

This skill runs a token-heavy multi-agent workflow. Before committing to it:

- If the requirement is clearly a **single function / single small module / one
  endpoint**, stop and tell the user this is over-kill — the lighter quick-spec
  skill fits better — and offer to proceed only if they confirm.
- If you have **no requirement yet**, ask for it ($ARGUMENTS may hold it inline,
  or a path to a requirement/PRD file — read the file if a path was given).

## Process

### Phase 0 — Load the method & capture the requirement
- Read `reference/guideline.md` (§0 and §3 fully; skim the rest) and skim
  `reference/example-symphony-spec.md`.
- Capture the requirement verbatim. Note what is given vs unstated.

### Phase 1 — Scope & section-set derivation (interactive)
Apply guideline **§0** to *this* requirement:
- Classify every default skeleton section as INVARIANT / PARAMETERIZED /
  EXEMPLAR-ONLY (§0.1).
- Run the **§0.2 trigger questions** to decide which net-new peer sections the
  requirement needs (Persistence & Durability, Delivery Semantics, Outbound
  Callback Contract, Tenancy & Isolation, Scheduling Model, distributed claim
  model, API-driven config, Operational Metrics & SLOs).
- Use **AskUserQuestion** (batched into ≤2–3 rounds) to resolve only the
  *genuine* unknowns that change the spec, especially:
  - the §0.2 trigger answers (owns state? side-effecting outbound? untrusted
    destinations? multi-tenant? time-based? HA/horizontal scale? config
    delivery model? SLA?);
  - the EXEMPLAR-ONLY architecture decisions the requirement leaves open
    (durability, claim/coordination model, push vs pull, trust boundary);
  - the **non-negotiable normative guarantees** per §0.4 (delivery semantics,
    durability, isolation, idempotency) — these MUST be pinned, never softened
    to `implementation-defined`.
  Pick sensible defaults and state them rather than asking about anything you
  can reasonably decide from the requirement.
- Produce and show a short **Section Plan**: the ordered section list (skeleton
  + triggered sections) and the list of architecture decisions now fixed. This
  is the contract the drafting phase fills in.

### Phase 2 — Draft + adversarially verify (multi-agent workflow)
- **Preferred (engine the user chose):** author and run a **Workflow** per
  `reference/workflow-recipe.md`, parameterized by the Phase-1 Section Plan:
  fan out one drafting agent per major section (each given the requirement, the
  fixed decisions, the matching guideline template from §5, and the calibration
  example), then adversarially verify (rubric §6 + anti-patterns §7 critic;
  traceability checker binding every normative behavior ↔ test-matrix entry ↔
  DoD item; normative-discipline checker for MUST/SHOULD/MAY calibration and
  §0.4; an implementer dry-run that flags any decision still left to invent),
  then synthesize into one coherent spec.
- **Fallback (Workflow unavailable):** draft the spec single-agent, section by
  section straight down the §3 skeleton + §8 scaffold, then self-run the Phase-3
  checks below. State that you used the fallback engine.

### Phase 3 — Verify, finalize, deliver
- Run the guideline **§6 Quality Rubric** as a literal checklist and the **§7
  anti-pattern** scan over the assembled spec.
- Confirm **traceability**: every MUST/SHOULD behavior defined in a section has a
  matching Test-Matrix entry *and* a Definition-of-Done item, profile-tagged
  (Core / Extension / Integration).
- Confirm **normative discipline** (§0.4): no core correctness/interop guarantee
  is softened to `implementation-defined` or SHOULD.
- Write the spec to a file. Default name `SPEC.md` in the project root; if that
  exists, derive a non-colliding name from the requirement (e.g.
  `<system>-SPEC.md`) or confirm a path with the user. Never clobber an existing
  file without confirming.
- Deliver per the user's standing output conventions: a file-change card and a
  Chinese summary statement.

## Hard guardrails (from the guideline — do not violate)
- **Re-derive, don't transplant.** The calibration example's architecture
  choices are exemplar-only (§0.1). Decide each from the requirement.
- **Section list comes from the requirement**, extended by §0.2 triggers — not
  transcribed from the example. Drop sections whose surface is genuinely absent;
  do not pad with no-analog sections.
- **Keep load-bearing guarantees normative** (§0.4). Reserve
  `implementation-defined` / SHOULD for policy a conforming implementation can
  vary without breaking interoperability.
- **Ask before inventing** any decision that both matters and is left open by
  the requirement. Do not silently guess load-bearing behavior.
- **One source of truth** for each entity, identifier, and config field (§2.7);
  the only allowed redundancy is an explicitly-labeled config cheat sheet.
