# Symphony-Grade Specification Authoring Guideline

## A Reusable Method for Writing Specs an Agent Can Implement in One Pass

> **Status:** Reusable authoring guideline, v2 (language-agnostic, requirement-agnostic)
>
> **Audience:** Any author — human or AI — who must turn a software requirement into a specification precise enough that a coding agent can implement working, conformant software from it in essentially one pass.
>
> **Calibration target:** The "Symphony" reference spec is a *worked example* of this method applied to one requirement (an in-memory, single-tenant, poll-pull issue-tracker orchestrator). This guideline is the abstracted method. **Reproduce the structure and conventions below; re-derive — never copy — the domain content for your requirement.** See §0 for which parts are invariant and which you must re-derive.

---

## 0. Before You Start: Portability, Tailoring, and the Trap of the Example

This guideline is reverse-engineered from a single high-quality reference spec. That spec made architecture-specific choices (in-memory state, no database, a repo-owned config file, a single-process single-authority loop, pull-from-one-vendor integration). **Those choices are correct for that requirement and wrong for many others.** The method is portable; the example's decisions are not. Internalize the classification below before you write a line, or you will cargo-cult a shape that silently mis-fits your domain.

### 0.1 What is invariant vs. what you must re-derive

Classify every section of the skeleton (§3) into one of three buckets:

- **INVARIANT (keep structure and intent verbatim-in-spirit).** The normative-language preamble; Goals/Non-Goals with an Important-boundary callout; layered System Overview; domain-model-as-typed-entities with a Stable-Identifiers/Normalization subsection; an explicit state machine; the failure-class → recovery taxonomy; language-agnostic reference algorithms; the dual Test-Matrix + Definition-of-Done with conformance profiles; the Security section as a peer-level chapter. These transplant to *any* requirement and you should always produce them.
- **PARAMETERIZED (keep the section, swap the domain nouns).** Per-subsystem contract sections; the coordination/state-machine content; failure classes; the integration contract; the config contract. The *form* is invariant; the *entities, fields, states, and rules* are entirely yours to re-derive.
- **EXEMPLAR-ONLY (delete and re-derive; the example's specific choice is one option among several).** Any concrete architecture decision: in-memory vs. durable state; a repo-owned config *file* vs. an API/DB-driven config model; poll-pull vs. push/outbound; single-process single-authority vs. distributed claim; trusted-operator config vs. untrusted-principal input. **Never inherit these by imitation.** Decide each one from your requirement.

### 0.2 Trigger questions: which net-new sections does YOUR requirement need?

The skeleton's *default* section list is necessary but not sufficient. Run these triggers and **add the named section when the answer is yes**. Missing one of these is the most common way a structurally-correct spec is still wrong.

| If your system… | …then you MUST add | Why the example lacks it |
|---|---|---|
| Persists any state that is the source of truth (not re-derivable from an external system) | **Persistence & Durability** section (§3 →新 between Domain Model and State Machine) | The example re-derives all state from an external tracker, so it chose in-memory/no-DB. Most systems own their state and MUST persist it transactionally. |
| Makes side-effecting **outbound** calls whose success/duplication matters | **Delivery Semantics** section | The example's work is fire-and-forget; a duplicate is benign. If your calls mutate the world, at-least-once vs. at-most-once is core, not optional. |
| Calls **user-controlled / untrusted destinations** | **Outbound Callback Contract** (SSRF defense, signing) | The example only *reads* from one trusted vendor. Calling URLs a principal supplied inverts the trust model. |
| Serves **multiple principals / tenants** | **Tenancy & Isolation** section (data isolation, authz scoping, fairness/anti-starvation, per-tenant quotas) | The example is single-tenant; it models concurrency as one global pool. Multiple principals introduce noisy-neighbor and isolation concerns with no single-tenant analog. |
| Computes **time-based schedules** (cron, calendar, recurring) | **Scheduling Model** section (schedule definition, timezone & DST policy, next-occurrence computation, missed-occurrence/catch-up, anti-stampede jitter) | The example's "schedule" is a fixed-interval poll. Per-entity cron + DST + catch-up is a far richer problem. |
| Must **scale horizontally / be HA** | A **distributed claim model** in the state machine + a second reference-algorithm variant (DB row-lock / lease / fencing token) | The example is single-process; its single-authority-in-memory invariant is a single-node simplification, not a universal best practice. |
| Receives config from an **API/DB per-row**, not a file | The **API-driven configuration** sub-template (§5.3.1) | The example uses a single human-edited repo file with file-watch reload. An API/DB config model needs CRUD, validation-on-write, optimistic concurrency, and effective-time semantics instead. |
| Carries an **SLA / "observability" requirement** | An **Operational Metrics & SLOs** sub-section (named SLIs, per-principal breakdowns, alerting hooks) | The example is an internal daemon; "observability" there means logs + a state snapshot. An SLA service needs time-series SLIs and error budgets. |

### 0.3 Tailoring: prune and resize deliberately

A long reference spec is not a quota. **Drop** any section whose surface your requirement genuinely lacks (e.g. no integration → no integration contract) — but only after confirming the surface is truly absent, not merely unfamiliar. **Do not** reproduce no-analog sections (a feature the example happens to have) just to match its table of contents. The rule: the section list is derived from *your* requirement's surfaces, extended by §0.2, not transcribed from the example.

### 0.4 The judgment the example cannot teach: where MUST is non-negotiable

The example leans on `implementation-defined` and SHOULD for genuinely portable policy (sandbox choice, log sinks, approval UX). Do not copy that *habit* onto load-bearing guarantees. **Core correctness and interoperability guarantees — delivery semantics, durability, isolation, idempotency — MUST be normative.** Never soften them to `implementation-defined` just because the example softened its sandbox policy. Reserve `implementation-defined`/SHOULD for policy a conforming implementation can vary without breaking interoperability (§4.1, §4.2).

---

## 1. Purpose & How to Use This Guideline

### 1.1 What this is

This is a working manual for writing **implementable specifications**: documents that are unambiguous, RFC 2119-normative, language-agnostic, and complete enough that an implementer never has to invent a decision the author should have made.

An implementable spec is not a design essay, a marketing narrative, or a backlog. It is a **contract** with three properties:

1. Every obligation is stated with a known, calibrated force (MUST vs SHOULD vs MAY).
2. Every data shape, state, formula, and failure has exactly one defined behavior.
3. Every requirement has a corresponding way to verify it, so "done" is decidable.

### 1.2 How to use it

- **Writing a new spec from scratch?** Read §0 (portability) and §2 (principles) once. Run the §0.2 trigger questions to fix your section list. Then work top-to-bottom through the **Canonical Section Skeleton** (§3), copy the **Spec Scaffold** (§8) into a new file, and fill it in.
- **Filling in a specific section?** Jump to the matching template in §3, and use the **Per-Artifact Authoring Rules** (§5) for the entity / config field / state machine / algorithm / failure-class / test / DoD item you are writing.
- **About to declare the spec done?** Run the **Quality Rubric** (§6) and scan the **Anti-Patterns** (§7).
- **Need to see what good looks like?** Read the **Worked Micro-Example** (§9), which applies the whole guideline to a small requirement *different* from the calibration example (a webhook delivery service — deliberately push/outbound and durable, to exercise the §0.2 additions).

Keep this document open beside you. It is meant to be referenced, not memorized.

### 1.3 The one-line test

> A spec is implementable when an independent implementer, reading only the spec, produces software whose externally observable behavior matches what every *other* independent implementer would produce — and both can prove they are conformant without consulting the author.

---

## 2. Core Design Principles

These are the "why" behind every rule that follows. When a downstream rule feels arbitrary, trace it back to one of these.

### 2.1 Unambiguous obligation

Every testable clause carries exactly one calibrated obligation level. The reader must never have to infer whether a sentence is a hard contract, a recommendation, or a free choice. This is achieved by binding RFC 2119 keywords up front and reserving the CAPITALIZED forms as the *only* load-bearing tokens (§4.1). Colloquial "should" and "must" are for narration; they carry no force.

### 2.2 Context before detail

Orient the implementer before binding them to any decision. A config field, a state transition, or a pseudocode line that arrives before the reader knows which component owns it forces re-interpretation later — the dominant source of one-pass rework. The document's first sections (Problem → Goals/Non-Goals → System Overview → Domain Model) are **pure orientation with zero implementation prescription**, so every subsequent detail lands in a mental slot the reader already has.

### 2.3 Contracts before algorithms

Pin all data shapes and rules before any procedure references them. By the time the reader reaches the Reference Algorithms section, every variable, field, state name, and formula the pseudocode touches MUST already be defined. The algorithms then read as *assembly of already-specified parts*, not as a place where new entities are silently introduced.

### 2.4 Verifiable done-ness

A requirement nobody can check is decorative. Every normative MUST/SHOULD maps to a deterministic pass/fail assertion in a test matrix **and** a present-or-absent item in a Definition-of-Done checklist. Writing at a granularity that *can* be asserted forces ambiguity to surface at authoring time.

### 2.5 Deliberate non-prescription

Real systems need room for environment-specific policy (sandboxing, secret handling, UI choices). Silence reads as "undefined behavior"; an unbounded MAY reads as "do anything." Resolve this with a named term — `implementation-defined` — that turns a deliberate gap into an auditable contract: the spec does not pick the value, but the implementer **MUST pick and document** one. Reserve this for genuinely portable policy only; never for core correctness, durability, delivery, or isolation guarantees (§0.4).

### 2.6 Forward-compatible boundaries

State what the system is **not** in the same breath as what it is. Fence scope with specific Non-Goals. Open schema seams explicitly ("unknown keys SHOULD be ignored"), assign ownership of every extension namespace, require every extension to **document its own schema**, and assert for every optional feature that it **MUST NOT be required for core correctness**. Defer volatile foreign detail to an external source of truth instead of copying it. This keeps the core minimal and one-pass-implementable while leaving designed room to grow.

### 2.7 Single source of truth, with deliberate exceptions

Define each entity, identifier, normalization rule, and config field **once**. Every other mention references it. The *one* permitted exception is an explicitly-labeled redundant **cheat sheet** at a point of maximum reference density (typically the config layer), which trades controlled duplication for module-local completeness — and names which copy is authoritative.

### 2.8 Single-authority state and idempotency

Where runtime/coordination state is mutable, name **exactly one** authority as its sole writer, and route every outcome back to it as an explicit transition. This turns a distributed-coordination problem into a single-threaded state-machine problem an agent can implement correctly, and makes idempotency reasoning local.

Model claims with **two distinct structures**: a coarse **reserved/claimed set** (an entity is reserved if it is *running OR queued-for-retry*) and a fine **active/running map** (the in-flight work and its live snapshot). Pre-launch guards MUST check **both** so neither a running nor a queued entity is double-dispatched. Any **bookkeeping-only set** (e.g. `completed`, `seen`) MUST be explicitly labeled **"NOT a dispatch gate"** so an implementer never reads idempotency into it and accidentally suppresses legitimate re-dispatch.

> **Important boundary (scale).** "Single in-memory authority" is a *single-node* simplification. If the system must scale horizontally or be HA, replace it with a **distributed claim model** (DB row-lock such as `SELECT … FOR UPDATE SKIP LOCKED`, a lease with a TTL, or a fencing token) and document the coordination primitive and its fencing semantics. The state machine and idempotency reasoning stay the same; only the claim mechanism changes (§0.2).

---

## 3. The Canonical Section Skeleton

This is the requirement-agnostic, ordered template. The section *headings* read top-to-bottom as a coherent arc: **orient → contract → coordinate → fail → assemble → verify → extend.** Do not reorder. For each section below: **Purpose**, **What to put in it**, and a **Scaffold**.

> **Front matter (before §1).** Title, status line, one-sentence purpose, and the Normative Language block. See §4.1 and the scaffold in §8.
>
> **Reminder.** This is the *default* list. Insert the §0.2 net-new sections (Persistence & Durability, Delivery Semantics, Outbound Callback Contract, Tenancy & Isolation, Scheduling Model, API-driven config) wherever your requirement triggers them. They are full peer sections, not sub-bullets.

---

### §1. Problem Statement

**Purpose.** Give the reader the mental model and the hard boundary before any design detail.

**What to put in it.** A one-line "what it is." A short *enumerated* list of the concrete operational problems solved (not a marketing paragraph). An **"Important boundary"** callout stating what the system is NOT responsible for and who owns the excluded responsibility. If success can end at a **handoff state** rather than an assumed-final state, say so here — and restate it at the integration write-boundary (§4.8).

**Scaffold.**

```markdown
## 1. Problem Statement

<System> is <one-line role: what it continuously does>.

It solves these operational problems:
- <problem 1>
- <problem 2>

Important boundary:
- <System> is a <core role>, not a <excluded role>.
- <Excluded responsibility> is performed by <who owns it> via <mechanism>.
- A successful run can end at <handoff state>, not necessarily <assumed-final state>.

Implementations are expected to document their trust and safety posture explicitly (see §<Security>).
```

---

### §2. Goals and Non-Goals

**Purpose.** Convert vague scope into a contract a reviewer can point at.

**What to put in it.** Parallel `2.1 Goals` and `2.2 Non-Goals` subsections. Make each Non-Goal a **specific rebuttal to a predictable over-reach**, not a vague disclaimer. Where a Non-Goal offloads a responsibility, name where it actually lives.

**Scaffold.**

```markdown
## 2. Goals and Non-Goals

### 2.1 Goals
- <verb + bounded outcome>
- <verb + bounded outcome>

### 2.2 Non-Goals
- <specific over-reach we reject>.
- <specific over-reach we reject>. (That logic lives in <where>.)
- <vendor/posture we refuse to mandate for all implementations>.
```

---

### §3. System Overview

**Purpose.** Establish the components, layers, and external dependencies — the table of contents for the rest of the spec. **No field schemas here.**

**What to put in it.** Three fixed subsections: `3.1 Main Components` (numbered, each with a 2–4 line responsibility blurb; tag OPTIONAL components inline), `3.2 Abstraction Layers` (the porting seams — name the layers where vendor code, coordination logic, persistence, and I/O live), `3.3 External Dependencies`. The component list MUST map one-to-one, in order, onto the later per-subsystem contract sections.

**Scaffold.**

```markdown
## 3. System Overview

### 3.1 Main Components
1. `<Component A>` — <responsibility lines>
2. `<Component B>` — <responsibility lines>
N. `<Component N>` (OPTIONAL) — <responsibility lines>

### 3.2 Abstraction Layers
1. `<Layer>` (where it lives) — <what it owns / what porting it requires>
...

### 3.3 External Dependencies
- <external API / service>
- <local resource: filesystem, datastore, etc.>
- OPTIONAL <tooling>
```

---

### §4. Core Domain Model

**Purpose.** Define every entity used anywhere later, exactly once, with typed fields — plus the single source of truth for identifiers and normalization.

**What to put in it.** `4.1 Entities` (each a named record with fully typed, nullability-annotated fields; label each field group **logical/in-memory** vs **normalized-from-wire** vs **persisted**) and `4.2 Stable Identifiers and Normalization Rules` (classify each identifier as stable-machine-key vs human-readable, give the role of each, and pin every derivation algorithm and canonicalization transform). Define normalization *once*, here, and reference it everywhere.

**Scaffold.** See the entity and identifier templates in §5.1–§5.2.

```markdown
## 4. Core Domain Model

### 4.1 Entities
#### 4.1.1 <EntityName>
<one-line role: which subsystems consume it>
Fields:
- `<field>` (<type>) — <semantics if type alone is insufficient>
- `<nullable_field>` (<type> or null)
...

### 4.2 Stable Identifiers and Normalization Rules
- `<Machine ID>` — Use for lookups / internal map keys.
- `<Human Identifier>` — Use for logs / display / directory naming.
- `<Derived Key>` — Derive from `<source>` by <exact rule + allowed char class>.
- `<Normalized Field>` — Compare/match after <normalization op>.
```

---

### §5..N. Per-Subsystem Contract Sections

**Purpose.** Let an implementer build and verify one module in isolation, with its complete contract in one place.

**What to put in it.** **One section per component from §3.1, in the same order.** Each contains, in this internal order: **schema** (config fields and message shapes, per §5.3 conventions) → **behavior rules** → **local validation / error surface** (the named error *codes* for this subsystem; global dispositions go in the Failure Model). Tag any optional sub-feature OPTIONAL and assert it is not required for core correctness.

**Scaffold.**

```markdown
## <N>. <Component Name> Contract

### <N>.1 Schema
<config fields / message shapes — use the per-field fingerprint from §5.3>

### <N>.2 Behavior
- <rule, with MUST/SHOULD/MAY>

### <N>.3 Validation and Error Surface (local)
Named error classes:
- `<error_name_1>`
- `<error_name_2>`
<which errors block what, locally>
```

> One per-subsystem section will typically be the **Configuration** contract. Give it the six-attribute field fingerprint (§5.3), a numbered resolution pipeline, reload semantics, staged validation, and — at its end — the intentionally-redundant cheat sheet (§4.6, §5.3). Pick the config-delivery model (file-based vs. API/DB-driven, §5.3.1) from your requirement; do not inherit the example's file model by default.

> Another will be an **Integration** contract for any external dependency. Split it into an **abstract** REQUIRED-operations list plus normalized outputs (durable) and a **vendor-specific** transport subsection gated on `kind == "<vendor>"` (volatile, isolated). State the source-of-truth and conflict-precedence rules (§4.8). If the dependency returns lists, include the **pagination** obligations (§4.8). If the system calls untrusted destinations, this is *not* enough — add the Outbound Callback Contract (§0.2, §3.x.OUT).

---

### §N+1. Coordination / State Machine

**Purpose.** Remove the ambiguity where one-pass implementations most often fail: coordination logic.

**What to put in it.** One sentence naming the single authority that owns the state (§2.8). If the system has both an internal lifecycle and an external (dependency) one, **state in the first line that they are different and name both.** Then:

- a closed, numbered list of **states**, each with an invariant;
- the **two-set claim model** (claimed set vs running map) and any explicitly-non-gating bookkeeping set (§2.8);
- a separate enumeration of fine-grained **lifecycle phases** with **distinct named terminal reasons** (Succeeded / Failed / TimedOut / Stalled / Canceled — never one "done");
- an enumerated list of **transition triggers**, each with an ordered action list — including **separate clean-exit vs. failure-exit triggers** when a unit can exit either successfully-but-not-final or with failure (§5.4, dual-delay rule);
- **reconciliation as a closed three-way (or more) branch** (§5.4): in-terminal-set → terminate + clean up; in-active-set → refresh snapshot; in-neither-set ("limbo") → terminate **without** cleanup;
- **idempotency & recovery rules** (required pre-action guards against both claim structures, reconcile-before-act ordering, restart recovery model).

If the system runs **multiple instances**, add the distributed claim variant (§2.8 boundary).

**Scaffold.** See §5.4.

---

### §N+2. Configuration

*(Place wherever the config component falls in the §3.1 order; listed here for arc clarity.)* See the per-field fingerprint, resolution pipeline, reload semantics (including the defensive backstop, §5.3), staged validation, and cheat sheet in §5.3 and §8.

---

### §N+3. Failure Model and Recovery Strategy

**Purpose.** Make recovery posture auditable in one orthogonal place; confirm no failure class is silently unhandled.

**What to put in it.** `N.1 Failure Classes` — a **closed taxonomy**, one class per subsystem/layer, with concrete member failures under each (aim for a small fixed number). `N.2 Recovery Behavior` — **exactly one** imperative recovery rule per class (skip-tick / retry-with-backoff / fail-this-attempt / abort-creation / log-and-ignore), distinguishing **clean-exit continuation retry** from **failure-driven backoff** where both apply. `N.3 Partial State Recovery (Restart)` — what survives, what does not, how state is re-derived (and from where; if the system owns its state, point to the Persistence section, not to "re-derive from external"). `N.4 Operator Intervention Points` — each lever with its mechanism (live vs restart) and observable effect. Keep per-subsystem error *codes* in their subsystem sections; this section assigns *dispositions*.

**Scaffold.** See §5.5.

---

### §N+4. Reference Algorithms (Language-Agnostic)

**Purpose.** Pin control flow — ordering of side effects, error short-circuits, loop conditions — that prose cannot express precisely.

**What to put in it.** One pseudocode block per major control loop (startup, tick, reconcile, dispatch, worker-attempt, worker-exit/retry), in fenced ` ```text ` blocks. Use only universal constructs (function, if/else, while, set/map/record literals). Show every error path inline with an explicit fail/return — never `... handle errors here`. Concretely populate any record you store. Every symbol MUST trace back to an earlier section (§2.3). Use two distinct call forms to encode the failure contract: `fail_worker(reason)` for critical steps vs `run_hook_best_effort(...)` for ignorable ones. Where one dispatch holds a persistent session across multiple iterations, show the **bounded in-unit iteration loop** as an explicit `while` (§5.6), not a single call. If the system has a distributed claim path, give a **second variant** of the claim algorithm (§2.8 boundary).

**Scaffold.** See §5.6.

---

### §N+5. Security and Operational Safety

**Purpose.** A first-class, peer-level section (never an appendix) for the inviolable safety surface and the trust posture.

**What to put in it.** `N.1 Trust Boundary Assumption` (REQUIRE each implementation to state, in writing, whether it targets trusted or restricted environments and which controls it relies on — and to **re-evaluate the boundary per input source**: operator-owned config MAY be trusted, but **principal-/tenant-supplied input is untrusted by construction** and MUST be validated/sandboxed). `N.2 <Subsystem> Safety Requirements` (a `Mandatory:` MUST list that **restates the inviolable invariants** from their domain chapter — see §5.7 — separated from a `RECOMMENDED additional hardening:` menu). `N.3 Secret Handling` (name-indirection so literals never live in versioned config; do-not-log rule; presence-validation without printing). `N.4 <Privileged Component> Safety` (name elevated-trust components, label their trust level, bound blast radius with isolation + log truncation + REQUIRED timeout). `N.5 Harness Hardening Guidance` (explicit harm statement; enumerate untrusted input surfaces; concrete defense-in-depth menu; close with "treat hardening as part of the core safety model rather than an optional afterthought"). If the system calls user-controlled destinations, **SSRF defense is Mandatory** here (§3.x.OUT). Make **bounded execution** a stated safety property in **both dimensions**: no operation may stall indefinitely in *time* (REQUIRED timeouts) and no input may grow unbounded in *size* (REQUIRED max line/message/payload/buffer caps with literal defaults).

**Scaffold.** See §5.7 and §8.

---

### §N+6. Test and Validation Matrix

**Purpose.** A literal acceptance suite whose structure **mirrors the subsystem section order**, so coverage is auditable by side-by-side diff.

**What to put in it.** Up-front definition of the three **conformance profiles** (Core / Extension / Integration). A stated mechanical convention ("bullets beginning `If ... is implemented` are Extension Conformance"). Then one subsection per defining section, each entry written as a **behavioral assertion** (trigger + success result + failure/timeout result) with a back-pointer to the defining section and restated literal values for every formula/default/cap. Include a **Process / Entrypoint Lifecycle** subsection (§N+7-host) and, for any list-returning dependency, an explicit **order-preserved-across-pages** assertion. **Derive this matrix bottom-up from *your* spec's domain sections, not by analogy from the example** — after drafting, cross-check that every MUST in your spec has a Core-Conformance test (§5.10). A final `Real Integration Profile` subsection carries the **honesty contract** (skipped ≠ passed; enabled profile failures fail the job; isolated artifacts + cleanup).

> **Domain-agnostic coverage checklist** (force a test in each, where the surface exists): correctness/semantics; concurrency & idempotency (no double-dispatch, stable idempotency keys across retries, no double-fire under multiple instances); security/abuse (rejected SSRF targets, sanitized identifiers, secret redaction); recovery/restart (durable state survives, limbo handled); scheduling correctness (DST/timezone, exact fire count across a missed window) where applicable; delivery semantics (success classification, no double-delivery) where applicable; tenancy fairness under load where applicable; observability (named SLIs emitted) where applicable.

**Scaffold.** See §5.8 and §8.

---

### §N+7. Process / Entrypoint Lifecycle

**Purpose.** Exit codes, entrypoint arguments, and startup-failure surfacing are part of the observable contract two independent implementations must match — give them a defining home so the test matrix has something to mirror.

**What to put in it.** Argument/path precedence and defaults (e.g. positional path arg vs. cwd default); behavior on a missing/invalid required argument; how a startup failure is surfaced (clean message vs. stack trace) and its exit code; exit-code semantics (zero on clean shutdown, nonzero on startup failure or abnormal exit); signal handling for graceful shutdown if applicable. Keep it short, but make every observable value explicit.

**Scaffold.**

```markdown
## <N>. Process / Entrypoint Lifecycle

- Arguments: `<positional/flag>` — <precedence>; default <value/resolution>.
- Missing required argument: <exit nonzero with message X; MUST NOT start>.
- Startup failure: surfaced as <clean message>; exit code `<nonzero>`.
- Normal shutdown: exit code `0`. Abnormal exit: `<nonzero>`.
- Signals: `<SIGTERM/SIGINT>` -> <drain/stop semantics>.
```

---

### §N+8. Implementation Checklist (Definition of Done)

**Purpose.** A flat, self-gradeable readout of done-ness, reusing the same profile vocabulary as the test matrix.

**What to put in it.** `N.1 REQUIRED for Conformance` (Core), `N.2 RECOMMENDED Extensions (Not REQUIRED)` (Extension — also the home for explicitly-labeled `TODO:` deferrals), `N.3 Operational Validation Before Production` (Integration). Each item is a **concrete, present-or-absent deliverable carrying its parameters inline** (config key, default, trigger condition) — never a restated goal. Tag each item's profile via the subsection it lives in, exactly matching the test-matrix profiles (§4.3).

**Scaffold.** See §5.9 and §8.

---

### Appendix A. <Optional Variant>

**Purpose.** Fully spec a large optional execution variant (alternate deployment/topology) without leaking its assumptions into the core.

**What to put in it.** Its own config table, its own "Problems to Consider" list, and an explicit restatement that the core single-source-of-truth and idempotency invariants still hold. Assert it MUST NOT alter the core state machine. If it exposes a network/API surface, apply the API surface conventions (§4.9).

---

## 4. Cross-Cutting Conventions

These conventions are applied **everywhere** in the document, not in one section. Internalize them before writing any section above.

### 4.1 Normative language (RFC 2119)

- Open the document, **before §1**, with a `Normative Language` block that incorporates RFC 2119 by reference and lists the exact keywords: MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED, MAY, OPTIONAL.
- Write these keywords in **ALL CAPS** at every point they carry normative force. Reserve lowercase "must/should/may" for narration only. Capitalization itself signals obligation.
- Assign **exactly one** obligation level to every testable clause: **MUST** for the inviolable contract (safety, correctness, data integrity, durability, delivery, isolation), **SHOULD** for strong recommendations a conforming impl may deviate from with reason, **MAY** for genuine free choice.
- When a feature has a **mandatory outcome but a free mechanism**, split the sentence: state the outcome as MUST and the mechanism as MAY. (e.g. "A run MUST NOT stall indefinitely; an implementation MAY fail it, surface it to an operator, or auto-resolve it.")
- Do not mark everything MUST (over-constrains, hides the real safety MUSTs) or everything SHOULD/MAY (leaves no inviolable core). Tie each failure path to a normative outcome keyword too ("Failure aborts the current attempt" vs "Failure is logged and ignored").

### 4.2 `implementation-defined`

- Define the term in the same preamble: *"`Implementation-defined` means the behavior is part of the implementation contract, but this specification does not prescribe one universal policy. Implementations MUST document the selected behavior."*
- Use it (not silence, not a bare MAY) wherever you deliberately decline to prescribe policy — security posture defaults, host-specific bootstrap, UI choices. **Always pair each use with a nearby "MUST document" clause.** That clause is what keeps the carve-out auditable.
- **Do not over-use it.** Core correctness and interoperability guarantees (durability, delivery semantics, isolation, idempotency) MUST be normative, never softened to `implementation-defined` (§0.4).

### 4.3 Conformance profiles (Core / Extension / Integration)

Define once, reuse in **both** the test matrix and the Definition of Done. Tag every test-matrix entry and every DoD item with exactly one profile:

- **Core Conformance** — deterministic tests REQUIRED for all conforming implementations.
- **Extension Conformance** — REQUIRED only for OPTIONAL features an implementation chooses to ship.
- **Real Integration Profile** — environment-dependent checks RECOMMENDED before production.

State one mechanical classification convention so any bullet's tier is inferable by inspection (e.g. "bullets beginning `If ... is implemented` are Extension Conformance; everything else in §X.1–X.k is Core"). The DoD's three subsections (§N+8.1/.2/.3) carry the same three profiles in the same order, so a reviewer can diff matrix-against-checklist.

### 4.4 Stable identifiers & normalization

- Distinguish **stable machine IDs** (for map keys and lookups) from **human-readable identifiers** (for logs, display, directory naming). Never use a human-readable identifier or display string as a map key.
- For every derived identifier (slug, key, session id, path component), specify the exact derivation: source field(s), operation, and the **precise allowed character class** (e.g. `replace any character not in [A-Za-z0-9._-] with _`). This doubles as a safety invariant for any value used in a filesystem path or URL.
- Centralize all canonicalization transforms (lowercase, trim, type coercion with null-fallback, ISO-8601 parsing, derived relations) in the §4.2 normalization subsection. Wherever two values are compared, state explicitly that comparison happens **after** normalization.

### 4.5 Nullability, typing, and numeric behavior

- Annotate **every** field with a parenthetical type: `field_name (type)`. Never leave a type to inference.
- Use one fixed nullability convention mechanically: append ` or null` to every nullable field's type; omit it from required fields. Do not mix in synonyms ("optional", "maybe", "nullable") for the same concept — the convention must be greppable.
- Type collections precisely: `list of <element-type>`, `map <key-type> -> <value-type>`. Expand nested object shapes inline rather than referencing an opaque named type.
- State sentinel semantics inline wherever null/zero/empty has special meaning (`null for first run, >=1 for retries`; `<= 0 disables`; `blank matches nothing`; empty-string-resolved env var "treat the key as missing").
- For any operation parameterized by a list/selector, state the **empty/degenerate-input behavior** explicitly (e.g. "an empty selector returns an empty result **with no external call**") and give it a test entry. Skipping the side effect on empty input is a deliberate, testable convention, not an accident.
- Constrain bounded/enumerated fields beyond their base type: list legal values, declare sign/range (`positive integer`), and state handling of invalid input (fail-validation vs ignore vs coerce-to-null). Annotate units (`_ms`, `seconds`) and ordering direction ("lower numbers are higher priority").
- **Numeric behavior — dual delay regimes.** Express every timing/sizing rule as a **closed-form formula with units and a named, defaulted cap**. When a unit of work can exit in **two different ways**, specify **two separate delay regimes**, each with its own literal value: a short **fixed continuation/re-check delay** after a *clean* exit (the work succeeded-but-may-not-be-final, so re-poll), e.g. `continuation_delay_ms = 1000`; and **exponential backoff** after a *failure* exit, e.g. `delay = min(base_ms * 2^(attempt - 1), <config>.max_retry_backoff_ms)`. The two MUST appear as distinct transition triggers (§5.4) and distinct test-matrix assertions (§5.8). Collapsing them into one path loses the continuation-poll behavior.
- **Metric accumulation.** When ingesting repeated telemetry/usage, state explicitly whether each payload is **absolute** (a running total) or **incremental** (a delta). Prefer absolute totals; track *last-reported* values and accumulate the difference so re-observing the same absolute total does not double-count. Never treat an ambiguous usage map as cumulative unless an explicit event-type defines it so. Require a test that aggregation stays correct across repeated/duplicated updates.

### 4.6 Intentional-redundancy cheat sheet

At any module that must reference many scattered values (typically config), add **one** explicitly-labeled redundant summary: flatten every field to one line (`path: type, REQUIRED|default <value>`). Open it with a sentence like *"This section is intentionally redundant so an implementer can build the <layer> quickly; §X is authoritative."* Keep it synchronized field-for-field with the authoritative definitions — divergence is a defect, since the redundancy is only safe while in sync. Scope conformance ("core conformance does not require validating extension fields unless that extension is implemented").

### 4.7 Normalized error-category vocabularies

For each integration boundary (subprocess, network API, parser, plugin), define a **normalized error-category enum** with stable named values. Require code and logs to branch on the **category**, not on raw upstream message text. Justify the enum by naming the drift risk it absorbs ("schema details can drift"). Map each category to a concrete recovery effect owned by *your* system — that mapping is yours and must not be deferred. For list-returning dependencies, include a **pagination-integrity** category (e.g. `missing_or_inconsistent_cursor`) so a broken page sequence is a named, handled failure rather than silent truncation (§4.8).

### 4.8 Deferral to external sources of truth

For any detail you do not own (third-party protocol, external schema, vendor API):

- Name the external artifact as **THE** source of truth for an explicitly enumerated set of concerns (schemas, payloads, transport framing, method names, allowed enum values).
- Immediately list the concerns **your** spec still controls (call ordering, input selection, recovery, output normalization). Theirs and yours must be explicit and non-overlapping.
- State an explicit **precedence rule**: "If this spec conflicts with `<X>` on `<axis>`, `<X>` controls."
- Pin the reference to a **version**, a **retrievable artifact** (URL or a schema-generation command), and **named definitions** — never a bare "see their docs."
- Declare external-owned enums **pass-through**, not a hand-copied list. Specify **lenient extraction** (preferred shape + acceptable aliases + ignored shapes) so cosmetic upstream changes are no-ops.
- **Pagination (REQUIRED for any list-returning dependency).** State the page-size default; require the implementation to page through completely; require **order preservation across page boundaries** with a matching test; and add a pagination-integrity error category (§4.7).
- **Write boundary.** State explicitly whether your system **writes** to the external system-of-record or **delegates** writes to another actor (read-only posture). If read-only, say so at this boundary — not only in the Problem Statement — and **restate the success/handoff-state definition here** (e.g. "success = the entity reached the next handoff state, which another actor writes"), so the read-only posture is unambiguous at the point it matters.

### 4.9 Forward-compatible seams and API surface conventions

- State the unknown-input tolerance rule explicitly (`Unknown keys SHOULD be ignored`) **and** name the surfaces where the opposite strictness applies (`Unknown template variables MUST fail rendering`), so liberal-acceptance is a scoped decision, not a blanket one.
- Assign ownership of each extension namespace ("the `<server>` top-level key is owned by this extension"). Require extensions to **document their own field schema, defaults, validation, and reload semantics** using the same conventions as the core.
- **Network/API surface conventions** (apply whenever the system or an extension exposes HTTP/RPC): specify status-code semantics (success; `202` for an accepted async trigger; `404` with a typed error envelope for an unknown resource; `405` for an unsupported method); use a **stable typed error envelope** (`{ error: { code, message } }`); allow **additive-only** field evolution within a version (new fields MAY appear; clients MUST ignore unknown ones); and state a **read-only-except-named-triggers** rule so which endpoints mutate is explicit.

---

## 5. Per-Artifact Authoring Rules (with Reusable Templates)

For each recurring artifact: the rules, then a copy-paste template.

### 5.1 Entity / Domain-Model Definition

**Rules.** One definition per entity, in §4. Type every field (§4.5). Apply the ` or null` convention mechanically. Expand nested shapes inline. Label the field group as logical / normalized-from-wire / persisted. Give every optional field a default; name the consumer that depends on every required field. Show at least one fully-populated literal instance for any non-trivial shape to fix key names and zero-values.

**Template.**

```markdown
#### <N>.<i> <EntityName>

<one-sentence role: what this record is and which subsystems consume it>

Fields (<logical | normalized-from-wire | persisted>):

- `<field>` (<type>)
  - <semantic note: units, ordering, or constraint, if the type alone is insufficient>
- `<nullable_field>` (<type> or null)
- `<required_field>` (<type>)
  - REQUIRED for <consumer/operation>.
- `<enum_field>` (<type>)
  - Supported values: `<a>`, `<b>`. <Handling of unsupported values.>
- `<list_field>` (list of <element-type>)
- `<map_field>` (map `<key-type> -> <value-type>`)
- `<nested_field>` (list of <ref-name>)
  - Each <ref-name> contains:
    - `<sub_field>` (<type> or null)
- `<timestamp_field>` (timestamp or null)
```

### 5.2 Identifier / Normalization Entry

**Template.**

```markdown
- `<Machine ID Name>` — Use for lookups / internal map keys.
- `<Human Identifier Name>` — Use for logs / display / directory naming.
- `<Derived Key Name>` — Derive from `<source field>` by replacing any character
  not in `[<allowed char class>]` with `<replacement>`. Use the derived value for <consumer>.
- `<Normalized Field Name>` — Compare/match after `<lowercase + trim>`.
- `<Composite ID Name>` — Compose from `<part-a>` and `<part-b>` as `<format with separators>`.
```

### 5.3 Configuration Field (six-attribute fingerprint)

**Rules.** Specify all six attributes in a fixed order; if one does not apply, say so explicitly rather than omitting it. Scope required-ness to the operation that consumes the field. Make env indirection opt-in per-value via a `$VAR` sigil — never an ambient global override — and define the empty-string-is-missing case. Classify the field as dynamic-reloadable or restart-required.

**Template.**

```markdown
#### `<group>.<field_name>` (`<type>`)

- Type: `<scalar | list of X | map K -> V | path | command string>`
- Default: `<literal default>`   // or: REQUIRED (no default)
- Required-ness: `<OPTIONAL | REQUIRED for <op> | REQUIRED for <op> when <condition>>`
- Indirection: `<MAY be a literal value or $VAR_NAME; canonical env var <NAME>; if $VAR resolves empty, treat as missing>`   // or: no indirection
- Normalization: `<resolved to absolute relative to <base> | compared after lowercase | trimmed>`   // or: used verbatim
- Validation: `<Invalid values fail configuration validation. | Invalid entries are ignored. | <constraint>>`
- Reload: `<Changes SHOULD be re-applied at runtime without restart. | Changes require restart.>`
```

Accompany the field definitions with the **resolution pipeline** (numbered: select source → parse → apply defaults → resolve `$VAR` indirection → coerce → validate; defaults before indirection before validation), **reload semantics** (what triggers reload; what it affects; what it leaves alone; exemptions; "invalid reloads MUST NOT crash — keep last known good"), and **staged validation** (startup-fatal vs skip-this-cycle vs fail-one-unit, each error class with a stable machine name). Close with the cheat sheet (§4.6).

**Defensive reload backstop (REQUIRED when reload is event-driven).** Filesystem-watch or pub/sub reload events **can be dropped**. Where reload is driven by such a mechanism, the implementation MUST ALSO re-check/re-validate config at a natural action boundary (e.g. before each dispatch cycle) as a backstop. State this as a MUST/SHOULD pairing — primary watch SHOULD trigger reload promptly; the boundary re-check MUST catch missed events — so the redundancy is deliberate, not accidental.

#### 5.3.1 Config-delivery model: file-based vs. API/DB-driven

Pick the model from your requirement; do not default to the example's file model.

- **File-based config** (operator-owned, version-controlled): file discovery + path precedence, schema/front-matter, file-watch reload + the defensive backstop above. The config is *trusted operator input*.
- **API/DB-driven config** (principal-supplied, per-row): a CRUD/management API instead of a file. Specify, with the same six-attribute discipline per field, plus: **validation-on-write** (reject invalid definitions at the API boundary, not at dispatch time); **optimistic concurrency / versioning** (e.g. a version column or ETag to reject lost updates); **effective-time semantics** ("a write takes effect on the next tick / occurrence"); **authorization scoping** (a principal may only read/write its own rows — tie to Tenancy & Isolation, §0.2); and the trust flip — **API-supplied config is untrusted** and MUST be validated/sandboxed (§N+5.1), unlike operator-owned files.

### 5.4 State Machine + Transition Table

**Template.**

```markdown
## <N>. <Subject> State Machine

<One sentence: which single authority owns/mutates this state; all outcomes are
reported back to it and converted into explicit transitions.>

> Note: these are distinct from <external system>'s states (<example external states>).
> These are the service's internal <claim/lifecycle> states.

### <N>.1 <Subject> States
1. `<StateA>` — Invariant: <what is true while in this state>.
2. `<StateB>` — Invariant: <...>.
k. `<TerminalState>` — <when entered>.

### <N>.2 Claim Model (idempotency structures)
- `claimed` (set) — an entity is claimed iff it is Running OR RetryQueued. Coarse reservation; the dispatch gate.
- `running` (map `<machine-id> -> <active record>`) — fine in-flight state + live snapshot.
- `completed` (set) — bookkeeping ONLY; **NOT a dispatch gate**. MUST NOT be used to suppress re-dispatch.

### <N>.3 <Run> Lifecycle Phases
A <unit-of-work> transitions through:
1. `<Phase1>` ... k. `Succeeded` / `Failed` / `TimedOut` / `Stalled` / `Canceled`
Distinct terminal reasons are REQUIRED because retry logic and logs differ.

### <N>.4 Transition Triggers
- `<TriggerName>`
  - <ordered action 1>
  - <ordered action 2>
- `Worker Exit (clean / not-yet-final)`        # dual-delay: schedule a SHORT continuation re-check
  - schedule next attempt after `continuation_delay_ms` (e.g. 1000)
- `Worker Exit (failure)`                       # dual-delay: exponential backoff
  - schedule retry after `min(base_ms * 2^(attempt-1), max_retry_backoff_ms)`

### <N>.5 Reconciliation (closed branch set, runs before acting)
For each running entity, classify against the external/authoritative state and act:
1. in TERMINAL set  -> terminate the worker AND clean up its workspace/resources.
2. in ACTIVE set    -> refresh the in-memory snapshot only.
3. in NEITHER ("limbo", not active and not terminal) -> terminate the worker WITHOUT cleanup
   (state is ambiguous; preserve artifacts for inspection/retry).

### <N>.6 Idempotency and Recovery Rules
- <Authority> serializes state mutations through one writer to avoid duplicate <action>.
- Pre-launch guards check BOTH `claimed` and `running` before <non-idempotent action>.
- Reconciliation (§<N>.5) runs before <action> on every <cycle>.
- Restart recovery is <durable-store | external-source>-driven; <what is not restored>.
- Startup cleanup removes <stale resources> for <units> already in terminal states.
- (If multi-instance) claims are taken via <DB row-lock / lease / fencing token>; a stale lease
  MUST be fenced so a slow instance cannot resurrect a reassigned claim.
```

### 5.5 Failure-Class Table

**Template.**

```markdown
## <N>. Failure Model and Recovery Strategy

### <N>.1 Failure Classes
1. `<Subsystem A> Failures` — <concrete failure>, <concrete failure>
2. `<Integration> Failures` — <transport error>, <non-success status>, <malformed payload>, <pagination-integrity>
3. `<Observability/Non-critical> Failures` — <render/sink failure>

### <N>.2 Recovery Behavior (one rule per class)
- <Subsystem A> failures: <skip-dispatch | fail-this-attempt | abort-creation>; keep service alive.
- Worker/unit CLEAN exit (not yet final): re-check after the short continuation delay.
- Worker/unit FAILURE exit: convert to retries with exponential backoff (distinct from the clean-exit delay).
- <Integration> fetch failures: skip this <cycle>; retry next <cycle>.
- Non-critical failures: log and continue; MUST NOT crash the core loop.

### <N>.3 Partial State Recovery (Restart)
- NOT restored: <ephemeral state list>.
- Recovers by: <re-load from durable store | re-derive from system-of-record>, <reuse durable artifacts>, <re-dispatch eligible work>.
  (If the system OWNS its state, recovery is a durable-store reload — point to the Persistence section, not "re-derive from external".)

### <N>.4 Operator Intervention Points
- <lever> -> <mechanism (live/restart)> -> <observable effect / side effects>.
```

### 5.6 Reference Algorithm (language-agnostic pseudocode)

**Template — main cycle (reconcile before acting; dual-delay scheduling).**

```text
function on_cycle(state):
  state = reconcile(state)              # reconcile BEFORE acting (three-way branch inside)
  reload_config_if_changed(state)       # defensive backstop: catch missed watch events
  validation = validate_config()
  if validation is not ok:
    log(validation); notify(); schedule_cycle(state.interval_ms); return state
  items = source.fetch_candidates()
  if items failed:
    log(...); notify(); schedule_cycle(state.interval_ms); return state
  for item in sort_for_action(items):
    if no_available_slots(state): break
    if not eligible(item, state): continue       # state + labels + routing/assignee gate
    if item.id in state.claimed: continue         # guard BOTH claim structures
    state = act(item, state, attempt=null)        # act() inserts into claimed + running
  notify(); schedule_cycle(state.interval_ms); return state
```

**Template — reconcile (closed three-way branch).**

```text
function reconcile(state):
  for id, run in state.running:
    s = authoritative_state_of(id)
    if s in TERMINAL_SET:
      terminate(run); cleanup_workspace(run); drop_from_claimed_and_running(state, id)
    else if s in ACTIVE_SET:
      run.snapshot = s                            # refresh only
    else:                                         # limbo: neither active nor terminal
      terminate(run)                              # NO cleanup; preserve artifacts
      drop_from_claimed_and_running(state, id)
  return state
```

**Template — worker attempt with a bounded in-unit iteration loop (persistent session across turns).**

```text
function run_unit_attempt(item):
  resource = prepare_resource(item)
  if resource failed:
    fail_worker("<resource> error")            # critical: abort
  if run_hook("<critical_hook>") failed:
    fail_worker("<critical_hook> error")       # critical: abort
  session = start(resource)                     # ONE persistent session/thread for all turns
  if session failed:
    run_hook_best_effort("<cleanup_hook>")     # best-effort: ignore result
    fail_worker("session startup error")
  turn = 0
  input = full_rendered_prompt(item)           # FIRST turn: full input
  while turn < config.max_turns:
    result = session.send(input)               # SAME session/thread, SAME workspace
    if result failed:
      run_hook_best_effort("<cleanup_hook>"); fail_worker("turn error")
    if not still_eligible(item):               # re-check eligibility BETWEEN turns
      break
    turn = turn + 1
    input = continuation_guidance_only()       # CONTINUATION turns: guidance only, NOT the full prompt
  run_hook_best_effort("<cleanup_hook>")       # session torn down only when loop ends
  exit_normal(terminal_reason)                 # tag a distinct terminal reason
```

Notes the template encodes: (a) one dispatch may span up to `max_turns` bounded iterations on a **persistent** session; (b) the **first** turn sends the full rendered prompt while **continuation** turns send only guidance; (c) the session/thread/workspace is reused across turns and torn down only at loop end; (d) eligibility is re-checked **between** turns; (e) `fail_worker` (critical) vs `run_hook_best_effort` (ignorable) encode the failure contract.

Express numeric behavior as literal formulas with units and named, defaulted caps:
- clean-exit continuation: `continuation_delay_ms` (default e.g. `1000`).
- failure backoff: `delay = min(<BASE_MS> * 2^(attempt - 1), <config>.max_retry_backoff_ms)` (default cap `<value>`).

If the system runs multiple instances, give a **second variant** of `act()`/claim acquisition using the distributed primitive (row-lock / lease / fencing token) so the single-node and multi-node claim paths are both pinned.

### 5.7 Safety Invariant

**Rules.** Place the invariant in the domain chapter where the dangerous operation lives, introduced with an explicit priority sentence. Make each invariant a **mechanically checkable predicate**: normalize → containment/allowlist test → reject/fail action. Restate it verbatim-in-intent under a `Mandatory:` MUST heading in the Security section (deliberate cross-section redundancy). Bound **both** time (timeout) and **size** (max buffer/line/payload) for any stream or external input.

**Template.**

```markdown
### <X>.<Y> Safety Invariants

This is the most important <safety> constraint.

Invariant 1: <one-line inviolable rule>.
- Before <the dangerous operation>, validate: `<exact predicate, e.g. cwd == expected_path>`

Invariant 2: <containment rule> MUST hold.
- Normalize <inputs> to <canonical form>.
- Require <value> to <containment test, e.g. have ROOT as a prefix directory>.
- Reject any <value> outside <the boundary>.

Invariant 3: <untrusted input> is sanitized.
- Only <allowlist, e.g. [A-Za-z0-9._-]> allowed in <field>.
- Replace all other characters with <safe replacement>.

Invariant 4: <outbound destination> is safe (when calling user-controlled URLs).
- Resolve the target; REJECT loopback, link-local, private, and cloud-metadata ranges (SSRF).
- Enforce TLS verification; bound redirects; sign the request so the callee can verify origin.

Invariant 5: bounded resources.
- Every external request has a REQUIRED timeout (no indefinite stall).
- Every stream/buffer has a REQUIRED max size (e.g. max line size 10 MB) (no unbounded growth).
```

### 5.8 Test-Matrix Entry

**Rules.** Write the entry as a **behavioral assertion** (trigger + success result + failure/timeout result), never a feature name. Restate every quantitative rule's literal values. Add a back-pointer to the defining section. Phrase optional-feature entries as `If <feature> is implemented, ...`. Cover both delay regimes separately when they apply. **Derive entries bottom-up from your own domain sections; after drafting, confirm every MUST has a Core test.**

**Template.**

```markdown
### <N>.<i> <Same scope/title as defining Section M>
- <precondition -> exact expected outcome>.
- <trigger AND failure-mode result, e.g. "... runs before each attempt; failure/timeout aborts the attempt">.
- Clean (not-final) exit re-checks after `continuation_delay_ms` (e.g. 1000ms); failure exit uses
  `min(<base> * 2^(attempt-1), <config.cap>)` backoff (as specified in Section M.k).
- Reconciliation classifies a limbo (neither active nor terminal) run as terminate-without-cleanup.
- Empty selector returns empty WITHOUT an external call.
- Pagination preserves order across multiple pages.
- No double-dispatch: an entity in `claimed` is not re-launched; idempotency key is stable across retries.
- Error mapping for <error classes A, B, C> (incl. pagination-integrity).
- If <optional feature> is implemented, <conditional assertion of its behavior>.
```

### 5.9 DoD Checklist Item

**Rules.** A concrete, objectively present-or-absent deliverable carrying its parameters inline (config key, default, trigger). Tag with its profile via the subsection it lives in. Park known-not-done work as explicit `TODO:` items under the Extension subsection.

**Template.**

```markdown
### <N>.1 REQUIRED for Conformance (Core)
- [ ] <Deliverable> (`<config.key>`, default `<value>`)
- [ ] <Deliverable with inline trigger condition>
- [ ] Process entrypoint: exit `0` on clean shutdown, nonzero on startup/abnormal exit.

### <N>.2 RECOMMENDED Extensions (Not REQUIRED for Conformance) (Extension)
- [ ] <Optional extension>, exposing <semantics> in Section M if shipped.
- TODO: <known deferred work, explicitly out of conformance scope>.

### <N>.3 Operational Validation Before Production (RECOMMENDED) (Integration)
- [ ] Run the Real Integration Profile with valid credentials and network access.
- [ ] Verify <host/environment-specific behavior> on the target environment.
```

### 5.10 Traceability requirement (binds it all together)

The triangle MUST close: **every normative MUST/SHOULD in a defining section has at least one Test-Matrix entry AND at least one DoD item; conversely every test and DoD item traces back to a defining section** (by number or by reusing its exact symbol/config-key name). Reuse identical symbol names across definition, algorithm, test, and checklist so a single grep links all four. The verification subsections MUST mirror the defining-section order so coverage is auditable by a side-by-side diff. After drafting the matrix, perform the **bottom-up cross-check**: walk every MUST in the spec and confirm it has a Core-Conformance test — do not derive the matrix by analogy from any example.

---

## 6. Quality Rubric (Self-Review Before Declaring Done)

Run every check. A "no" is a defect to fix, not a judgment call to rationalize.

**Portability & tailoring**

1. Did you run the §0.2 trigger questions and ADD every net-new section your requirement triggers (durability, delivery semantics, outbound contract, tenancy, scheduling, distributed claim, API-config, SLOs)? Did you re-derive — not copy — every EXEMPLAR-ONLY architecture choice?
2. Are core correctness/interoperability guarantees (durability, delivery, isolation, idempotency) stated as MUST, never softened to `implementation-defined`?

**Orientation & architecture**

3. Can a reader who stops after §1–§4 correctly state what the system does, what it explicitly does not do, its components and layers, and every core entity — having consumed zero implementation detail?
4. Does every component in §3.1 have a downstream contract section, in the same order?
5. Reading only the section headings top-to-bottom, do they form the arc *orient → contract → coordinate → fail → assemble → verify → extend* — not a grab-bag?

**Normative language**

6. Is there an RFC 2119 block before §1, and are keywords ALL CAPS wherever they carry force, with lowercase reserved for narration?
7. Does every testable clause carry exactly one obligation level, with the safety/correctness core consistently MUST and genuine free choices MAY?
8. Is `implementation-defined` defined, does every use sit next to a "MUST document" obligation, and is it kept off load-bearing guarantees?

**Domain & data**

9. Does every field carry a parenthetical type and the exact ` or null` convention (no synonyms)? Can you grep ` or null` and recover the complete set of nullable fields?
10. For every collection, is the element type (and both map key and value types) named? Are nested shapes expanded inline?
11. Is there one §4.2 identifiers/normalization subsection classifying each identifier and pinning each derivation (with allowed char class) and each canonicalization transform? Is every equality comparison stated as post-normalization?
12. Does every optional field have a stated default; does every bounded field state its legal set and invalid-input handling; are units and ordering annotated? Is empty/degenerate-input behavior (no-op, no external call) specified and tested?
13. For repeated telemetry, is absolute-vs-incremental stated, with last-reported tracking to prevent double-counting?

**Configuration**

14. Does every config field state all six attributes (type, default, required-ness, indirection, validation, reload)?
15. Is there a numbered resolution pipeline with correct ordering (defaults → indirection → validation)? Are env vars per-value opt-in (not global overrides), with the empty-resolve case defined? Is the config-delivery model (file vs. API/DB) chosen from the requirement, with validation-on-write + versioning + effective-time if API-driven?
16. If reload is event-driven, is there a defensive boundary re-check backstop for missed events?
17. Is there a cheat sheet, labeled intentionally redundant, that matches the prose field-for-field?

**Coordination, failure, algorithms**

18. Is there exactly one named authority per piece of mutable state, with all outcomes reported back as explicit transitions? Are internal vs external states explicitly distinguished?
19. Is the two-set claim model present (claimed set vs running map), are pre-launch guards against BOTH, and is every bookkeeping-only set explicitly labeled NOT-a-dispatch-gate?
20. Are states a closed numbered list with invariants, and are terminal outcomes split by reason (not one "done")? Are triggers enumerated with ordered side effects, including separate clean-exit vs. failure-exit triggers?
21. Are the dual delay regimes present — a short fixed continuation delay after clean exit AND exponential backoff (closed-form, capped, unit-suffixed, named config) after failure?
22. Is reconciliation a closed branch set of at least three (terminal → cleanup; active → refresh; limbo → terminate-without-cleanup), placed before any new action?
23. Is there a closed failure taxonomy where **every** class has exactly one imperative recovery rule, and an invariant that non-critical failures MUST NOT crash the core loop?
24. Is there a partial-state-recovery section pointing recovery at the correct source (durable store if the system owns its state)? Does it state what is not restored?
25. Are the reference algorithms language-neutral, with every error path inline and every symbol traceable to an earlier section? Is the bounded in-unit iteration loop shown as a while-loop (first-turn vs continuation input, session reuse, between-turn re-check) where applicable? Is there a distributed-claim variant if multi-instance? Do prose and pseudocode agree on names and formulas?

**Security**

26. Is there a short, explicitly-flagged Safety Invariants subsection (irreversible-harm rules), each reducible to a runtime guard, restated under a Security `Mandatory:` heading?
27. Does the spec REQUIRE each implementation to state its trust boundary, re-evaluate it per input source (operator-trusted vs principal-untrusted), and enumerate untrusted input surfaces? If user-controlled destinations are called, is SSRF defense Mandatory?
28. Does secret handling cover all three legs (name-indirection, do-not-log, presence-without-printing)? Is bounded execution stated in BOTH dimensions — REQUIRED timeouts (no indefinite stall) AND REQUIRED max sizes (no unbounded buffer/line/payload growth)?

**Integration & delivery**

29. For each external dependency: one source-of-truth sentence, a non-overlapping "what we still control" sentence, an explicit conflict-precedence rule, a versioned + retrievable reference, pass-through enums, lenient alias-tolerant extraction, and — for list APIs — pagination with order-preservation and a pagination-integrity error?
30. Is the integration defined as an abstract REQUIRED-operations list + normalized outputs (with a "transport MAY change but outputs MUST match §4" swap clause), with vendor code isolated? Is the write boundary (read-only vs writes) stated, with the handoff-state success definition restated there?
31. If the system makes side-effecting outbound calls: is there a Delivery Semantics section (guarantee level, success classification, idempotency-key contract, overlap policy)? If it calls user-controlled URLs: is there an Outbound Callback Contract (SSRF, signing, timeout, size, redirects, TLS)?

**Scheduling, tenancy, persistence (where applicable)**

32. If time-based: is there a Scheduling Model (schedule definition, timezone & DST, next-occurrence computation, missed-occurrence/catch-up, anti-stampede jitter)?
33. If multi-principal: is there a Tenancy & Isolation section (data isolation, authz scoping, fairness/anti-starvation, per-tenant quotas), and is concurrency modeled as global + per-partition + fairness rather than one global pool?
34. If the system owns its state: is there a Persistence & Durability section (authoritative store, durable-vs-ephemeral split, transactional boundaries for claim/fire/ack, crash recovery)?

**Process lifecycle, verification & extensibility**

35. Is there a Process/Entrypoint Lifecycle section (argument precedence, missing-arg behavior, startup-failure surfacing, exit-code semantics), with a matching test subsection?
36. Are the three conformance profiles defined once and reused identically (same names, same order) in the test matrix and the DoD, with a mechanical classification convention?
37. Does the verification structure mirror the defining-section order? Does every test entry read as a behavioral assertion with literal values and a back-pointer? Was the matrix derived bottom-up (every MUST has a Core test), not by analogy?
38. Is every DoD item a present-or-absent deliverable with inline parameters, tagged by profile? Is known future work captured as explicit TODOs in the Extension subsection?
39. Do environment-dependent tests carry the honesty contract (skipped ≠ passed; enabled-profile failures fail the job; isolated + cleaned-up artifacts)?
40. Is every optional feature tagged OPTIONAL, housed in its own subsection/appendix, namespace-owned, required to document its own schema, and guarded by "MUST NOT be required for core correctness"? Are unknown keys ignored with strict-rejection surfaces named, and do any HTTP/RPC surfaces follow the status-code/typed-envelope/additive-only conventions?

**The decisive check**

41. Given only the Test Matrix plus the DoD, would two independent reviewers reach the same verdict on "done" and "conformant"? If the verdict needs subjective judgment, the loop is not closed.

---

## 7. Anti-Patterns (What Weak Specs Do)

- **Cargo-culting the example's architecture.** Inheriting in-memory/no-DB, a config *file*, poll-pull, single-authority, or trusted-config by imitation when the requirement is durable, API-driven, push/outbound, multi-instance, or multi-tenant — instead of re-deriving each choice (§0).
- **Missing a triggered section.** Shipping a structurally-correct spec that silently omits Persistence, Delivery Semantics, the Outbound Contract, Tenancy, Scheduling/DST, or SLOs because the section list was copied from the example rather than derived from the requirement (§0.2).
- **Softening core guarantees.** Marking durability, delivery, or isolation as `implementation-defined`/SHOULD because the example softened its sandbox policy.
- **No orientation runway.** Diving straight into schemas/endpoints with no Problem Statement or System Overview, forcing the implementer to infer the mental model from field names.
- **Vague or absent Non-Goals.** "Keep it simple" instead of specific rebuttals to predictable over-reach, so the implementer over-builds.
- **Unmapped components.** Listing components but never giving each a dedicated downstream contract section, so modules can't be built in isolation.
- **Inline/duplicated entity definitions.** Defining a record at first use (or three times, differently), letting identifier and normalization rules drift, instead of one §4 domain model.
- **Algorithms before contracts.** Placing pseudocode early so the reader meets `state.running[id]` before the state shape is defined and must reverse-engineer it.
- **Conflated lifecycles.** Treating an external system's "Done" as the service's own terminal state because no dedicated state-machine section drew the distinction.
- **One retry path for two exit kinds.** Collapsing a clean-but-not-final exit and a failure exit into a single backoff, losing the short continuation re-poll.
- **Two-way reconciliation.** Handling only terminal-vs-active and silently mishandling the limbo (neither active nor terminal) run, which needs terminate-without-cleanup.
- **Bookkeeping set used as a gate.** Letting a `completed`/`seen` set suppress legitimate re-dispatch because it was never labeled non-gating; or human-readable IDs as map keys so renames/casing break idempotency.
- **Adjectives instead of formulas.** "Back off exponentially with a reasonable cap" / "rate-limited" with no base, exponent origin, cap, or units — two implementations diverge and neither is testable.
- **Magic numbers.** Tunables with no default, no named config key, or no units (is `30000` ms or seconds?).
- **Untyped / inconsistently-nullable fields.** Bare `priority`, `labels`; "optional" here, "(nullable)" there, "may be empty" elsewhere — un-greppable, un-inferable.
- **Path/URL injection vectors.** A derived path component or outbound URL with no allowed char class / no SSRF allowlist becomes a traversal or server-side-request-forgery vector.
- **Scattered error handling, no failure model.** No single place to confirm every failure class has a disposition; some errors end up silently unhandled.
- **Branching on raw error text.** Recovery logic keyed to upstream message strings that break on the vendor's next wording change, instead of a normalized category enum.
- **Crashes from non-critical paths.** A logging sink, dashboard render, or cleanup hook propagates an exception that kills the core loop because no "log-and-ignore / MUST NOT crash" rule was stated.
- **Silence on restart / wrong recovery source.** Never declaring what in-memory state is lost, or pointing recovery at "re-derive from external" when the system actually owns its state and must reload from a durable store.
- **Unbounded waits or buffers.** Approval prompts, stream reads, or hooks with no timeout; or buffers/lines/payloads with no max size — one stuck or oversized input hangs or OOMs the daemon.
- **Double-counted metrics.** Treating absolute usage totals as deltas (or vice-versa) with no last-reported tracking, so re-observation inflates aggregates.
- **Loose normative language.** MUST/SHOULD/MAY used colloquially with no RFC 2119 binding; or everything marked MUST.
- **Restated foreign schema.** Hand-copying a vendor's wire shapes/enums as authoritative, creating a second stale source of truth with no precedence rule; or omitting pagination/order-preservation for a list API.
- **Vendor-welded core.** Defining the integration by the vendor's transport rather than abstract operations + normalized outputs, so swapping backends means a rewrite.
- **Trust posture inherited blindly.** Treating principal-/tenant-supplied input as trusted because the example trusted operator-owned config.
- **Dogmatic anti-redundancy.** Refusing the labeled config cheat sheet on DRY grounds; or duplicating without labeling which copy is authoritative.
- **Optionality erosion.** Mixing optional features into the core with no OPTIONAL tagging and no "MUST NOT be required for correctness" guard, inflating the conformance surface.
- **Security as an appendix.** Burying safety under "misc" with no named invariants list, no harm statement, and no separation of Mandatory MUSTs from RECOMMENDED hardening.
- **Verification by feature name.** Tests labeled "test the retry logic" that assert nothing; a test list that does not mirror the spec's structure; a matrix derived by analogy from an example rather than bottom-up from this spec; or no test matrix / DoD at all.
- **Silent-skip integration tests.** Environment-gated checks reported as passing (green CI lies) with no rule forcing skipped ≠ passed.
- **No entrypoint contract.** Leaving exit codes and argument handling unspecified, so two implementations disagree on observable process behavior.
- **Open loop.** A body MUST/SHOULD with no corresponding test or DoD entry, so conformance is undecidable for that behavior.

---

## 8. Copy-Paste Spec Scaffold

Copy everything in the block below into a new file and fill in every `<placeholder>`. **Before filling in, run the §0.2 trigger questions and insert the net-new sections you need (Persistence, Delivery Semantics, Outbound Contract, Tenancy, Scheduling, API-config, SLOs).** Delete sections that genuinely do not apply only after confirming the requirement has no such surface.

```markdown
# <System> Specification

Status: Draft v1 (language-agnostic)
Purpose: <one sentence: what this service/tool does>

## Normative Language

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and
OPTIONAL in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the behavior is part of the implementation contract,
but this specification does not prescribe one universal policy. Implementations MUST
document the selected behavior. (Core correctness, durability, delivery, and isolation
guarantees are NOT implementation-defined; they are normative MUSTs.)

## 1. Problem Statement
<System> is <one-line role>.
It solves these operational problems:
- <problem 1>
Important boundary:
- <System> is a <core role>, not a <excluded role>.
- <Excluded responsibility> is performed by <who> via <mechanism>.
- A successful run can end at <handoff state>, not necessarily <assumed-final state>.

## 2. Goals and Non-Goals
### 2.1 Goals
- <verb + bounded outcome>
### 2.2 Non-Goals
- <specific over-reach we reject>. (That logic lives in <where>.)

## 3. System Overview
### 3.1 Main Components
1. `<Component A>` — <responsibility>
N. `<Component N>` (OPTIONAL) — <responsibility>
### 3.2 Abstraction Layers
1. `<Layer>` — <what it owns / porting seam>
### 3.3 External Dependencies
- <external API / service>   - <local resource / datastore>

## 4. Core Domain Model
### 4.1 Entities
#### 4.1.1 <EntityName>
Fields (<logical | normalized-from-wire | persisted>):
- `<field>` (<type>)
- `<nullable_field>` (<type> or null)
### 4.2 Stable Identifiers and Normalization Rules
- `<Machine ID>` — Use for lookups / map keys.
- `<Human Identifier>` — Use for logs / display / paths.
- `<Derived Key>` — Derive from `<source>` by replacing any character not in `[<class>]` with `_`.
- `<Normalized Field>` — Compare after <lowercase + trim>.

# --- INSERT IF TRIGGERED (§0.2) ---
## <P>. Persistence & Durability         (system owns its state)
- Authoritative store: <choice>. Durable: <list>. Ephemeral (MAY be in-memory): <list>.
- Transactional boundaries: claim/fire/ack are atomic. Crash recovery: reload from store; <what re-derives>.
## <T>. Tenancy & Isolation               (multiple principals)
- Data isolation: every row scoped by `tenant_id`. Authz: a principal reads/writes only its own rows.
- Fairness: <round-robin/weighted> so one tenant cannot starve others. Quotas: <per-tenant limits>.
## <S>. Scheduling Model                   (time-based)
- Schedule definition: <cron|interval|one-shot>. Timezone & DST: <policy for skipped/duplicated fires>.
- Next-occurrence computation: <deterministic rule>. Missed occurrences after downtime: <catch-up policy>.
- Anti-stampede jitter: <rule>.
## <D>. Delivery Semantics                 (side-effecting outbound calls)
- Guarantee: <at-least-once | at-most-once | exactly-once-effort>.
- Success classification: <2xx? body? timeout?>. Idempotency-Key sent to callee: <= stable id>.
- Overlap policy (previous run still in flight at next fire): <skip | queue | allow-concurrent | kill-previous>.
## <O>. Outbound Callback Contract         (user-controlled destinations)
- URL policy + SSRF defense: REJECT loopback/link-local/private/metadata; TLS verify; bounded redirects.
- Request signing: <HMAC over body; header>. Per-call timeout / max response size / auth header injection.
# -----------------------------------

## <C>. Configuration Contract
### <C>.1 Resolution Pipeline
1. Select source 2. Parse 3. Apply defaults 4. Resolve $VAR indirection 5. Coerce 6. Validate
Environment variables do not globally override declared values.
### <C>.2 Fields
#### `<group>.<field>` (`<type>`)
- Type / Default / Required-ness / Indirection / Normalization / Validation / Reload
### <C>.3 Reload Semantics
- Invalid reloads MUST NOT crash the service; keep last known good config.
- Event-driven reload MUST be backstopped by a re-check at each <action boundary> (missed-event safety).
### <C>.4 Staged Validation
- Startup-fatal: <...>   Skip-this-cycle: <...>   Fail-one-unit: <...>
### <C>.5 Config-Delivery Model
- <File-based: discovery + path precedence + watch + backstop>
  OR <API/DB-driven: CRUD + validation-on-write + optimistic-concurrency + effective-time + authz scoping (untrusted input)>.
### <C>.6 Core Config Fields Summary (Cheat Sheet)
This section is intentionally redundant; §<C>.2 is authoritative.
- `<group>.<field>`: <type>, REQUIRED|default `<value>`

## <I>. <Integration> Contract (<Vendor>-Compatible)
Source of truth: the targeted <Vendor> version owns <schemas, payloads, transport, enums>.
If this spec conflicts with <Vendor>, <Vendor> controls protocol shape; this spec controls
<call ordering, normalization, recovery>. Regenerate schema via `<command>`.
Write boundary: this system <reads only | writes>; success = <handoff state>, written by <actor>.
### <I>.1 REQUIRED Operations
1. `<op_a>()` — <purpose>;  empty-selector input returns empty WITHOUT a call.
### <I>.2 Query Semantics (<Vendor>) — gated on kind == "<vendor>"
A non-<Vendor> implementation MAY change transport, but normalized outputs MUST match §4.
Pagination: page size default <N>; page fully; preserve order across pages.
### <I>.3 Normalization Rules (lenient extraction)
### <I>.4 Error Handling Contract (normalized categories + recovery effect; incl. pagination-integrity)

## <SM>. <Coordination> State Machine
<single authority sentence>
> Note: distinct from <external> states.
### <SM>.1 States   (numbered, each with invariant)
### <SM>.2 Claim Model   (claimed set vs running map; completed set = NOT a dispatch gate)
### <SM>.3 Lifecycle Phases   (terminal reasons: Succeeded/Failed/TimedOut/Stalled/Canceled)
### <SM>.4 Transition Triggers   (incl. separate clean-exit vs failure-exit; dual delays)
### <SM>.5 Reconciliation   (three-way: terminal->cleanup; active->refresh; limbo->terminate-without-cleanup)
### <SM>.6 Idempotency and Recovery Rules   (guard both claim structures; multi-instance claim variant if HA)

## <F>. Failure Model and Recovery Strategy
### <F>.1 Failure Classes   (one per subsystem; incl. integration + pagination-integrity)
### <F>.2 Recovery Behavior   (one rule per class; clean-exit continuation vs failure backoff)
### <F>.3 Partial State Recovery (Restart)   (durable-store reload if state is owned)
### <F>.4 Operator Intervention Points

## <A>. Reference Algorithms (Language-Agnostic)
### <A>.1 start_service   ### <A>.2 on_cycle (reconcile-first + config backstop)
### <A>.3 reconcile (three-way branch)   ### <A>.4 dispatch (guard both claim sets + eligibility/routing)
### <A>.5 run_unit_attempt (bounded in-unit while-loop: first vs continuation turn; session reuse)
### <A>.6 on_worker_exit (clean continuation delay vs failure backoff)
### <A>.7 (if multi-instance) distributed claim variant (row-lock / lease / fencing)
(fenced ```text```; every error path inline; fail_worker vs run_hook_best_effort)

## <SEC>. Security and Operational Safety
### <SEC>.1 Trust Boundary Assumption   (re-evaluate per input source: operator-trusted vs principal-untrusted)
### <SEC>.2 <Subsystem> Safety Requirements   (Mandatory: MUSTs / RECOMMENDED hardening; SSRF Mandatory if calling user URLs)
### <SEC>.3 Secret Handling   ($VAR indirection / do not log / validate presence without printing)
### <SEC>.4 <Privileged Component> Safety   (trust level / isolation / log truncation / REQUIRED timeout)
### <SEC>.5 Bounded Execution   (REQUIRED timeouts: no indefinite stall; REQUIRED max sizes: no unbounded buffers)
### <SEC>.6 Harness Hardening Guidance   (harm statement / untrusted surfaces / defense-in-depth menu)

## <HOST>. Process / Entrypoint Lifecycle
- Arguments + precedence + default; missing-arg -> nonzero exit + message, MUST NOT start.
- Startup failure surfaced cleanly; exit `0` clean shutdown, nonzero abnormal. Signal handling: <...>.

## <TM>. Test and Validation Matrix
Profiles: Core Conformance / Extension Conformance / Real Integration Profile.
Bullets beginning `If ... is implemented` are Extension Conformance.
(Derive bottom-up from THIS spec; every MUST gets a Core test.)
### <TM>.1 <Subsystem A>   (behavioral assertions, literal values, back-pointers)
### <TM>.x Process / Entrypoint Lifecycle   (exit codes, arg precedence, startup-failure surfacing)
### <TM>.last Real Integration Profile (RECOMMENDED)
- Skipped real-integration tests SHOULD be reported as skipped, not treated as passed.
- If the profile is explicitly enabled in CI, failures SHOULD fail that job.

## <DOD>. Implementation Checklist (Definition of Done)
### <DOD>.1 REQUIRED for Conformance (Core)   (present-or-absent deliverables w/ inline params)
### <DOD>.2 RECOMMENDED Extensions (Not REQUIRED) (Extension)   (+ TODO: deferrals)
### <DOD>.3 Operational Validation Before Production (Integration)

## Appendix A. <Optional Variant> Extension (OPTIONAL)
<own config table; "Problems to Consider"; restates core idempotency invariants unchanged;
 API surface conventions if it exposes HTTP/RPC>
```

---

## 9. Worked Micro-Example: A Webhook Delivery Service

This applies the guideline to a requirement **deliberately different** from the calibration example: a service that delivers events to customer-registered webhook endpoints with retries. Unlike the calibration example it is **push/outbound**, **durable**, and calls **user-controlled URLs** — so it exercises the §0.2 additions (Delivery Semantics, Outbound Callback Contract, Persistence). Below are representative sections filled in to demonstrate the resulting quality. (A full spec would carry every section of §8.)

### 9.x.0 §0.2 triggers applied (excerpt)

> Persists delivery state that is the source of truth → **add Persistence & Durability.** Makes side-effecting outbound calls where duplicates matter → **add Delivery Semantics.** Calls user-supplied URLs → **add Outbound Callback Contract (SSRF + signing).** Single-tenant for now → no Tenancy section. Not time-scheduled → no Scheduling Model.

### 9.x.1 Problem Statement (excerpt)

> **WebhookRelay** is a long-running service that durably accepts internal events and delivers each to its subscribers' HTTP endpoints, retrying on failure until delivered or exhausted.
>
> It solves these operational problems:
>
> - Decoupling event producers from slow or flaky subscriber endpoints.
> - Guaranteeing at-least-once delivery with bounded, observable retry behavior.
> - Giving subscribers a tamper-evident signature so they can trust payloads.
>
> **Important boundary:**
>
> - WebhookRelay is a **delivery engine**, not a subscription-management UI or an event bus. Event ingestion and subscriber CRUD are performed by the host application; WebhookRelay only reads the subscription table and the event queue.
> - WebhookRelay does **not** guarantee ordering across distinct endpoints. A successful delivery ends at HTTP 2xx receipt by the subscriber, not at any business acknowledgment.

### 9.x.2 Domain Model + Persistence (excerpt)

> #### 4.1.1 DeliveryAttempt
>
> The record the dispatcher tracks per in-flight delivery; **persisted** (it is the source of truth, so it survives restart).
>
> Fields (persisted):
>
> - `delivery_id` (string) — REQUIRED. Stable; used as the internal map key and the durable primary key.
> - `event_id` (string) — REQUIRED. Stable id of the source event.
> - `endpoint_url` (string) — REQUIRED. Absolute https URL; non-https endpoints fail validation.
> - `attempt` (integer or null) — `null` for the first try, `>=1` for retries.
> - `next_retry_at` (timestamp or null) — `null` while in flight; set when scheduled for retry.
> - `last_status` (integer or null) — last HTTP status code; `null` if no response (transport error).
> - `last_error` (string or null) — normalized error category, not raw message text.
>
> **§P Persistence & Durability (excerpt).** The authoritative store is a relational table keyed by `delivery_id`. `DeliveryAttempt` rows MUST be durable; the in-memory dispatch map is ephemeral and rebuilt on restart by loading all non-terminal rows. Claim/schedule/ack updates MUST be transactional. Recovery re-derives the in-flight set **from the durable store**, never from an external system (this system owns the state).
>
> #### 4.2 Stable Identifiers and Normalization Rules
>
> - `delivery_id` — Use for internal map keys and idempotency dedupe. Compose from `event_id` and `endpoint_id` as `<event_id>:<endpoint_id>`.
> - `Endpoint Host` (for per-host rate limiting) — Compare after lowercasing the URL host. Strip a trailing dot.
> - **Idempotency key** — The `Idempotency-Key` header MUST equal `delivery_id` so a subscriber receiving a retried delivery can dedupe deterministically.

### 9.x.3 Delivery Semantics + Outbound Contract + Retry/Backoff + matching tests (excerpt)

> **§D Delivery Semantics**
>
> - Guarantee: **at-least-once.** A subscriber MAY receive duplicates on retry; the stable `Idempotency-Key` (= `delivery_id`) lets it dedupe.
> - Success classification: HTTP 2xx = `Succeeded`. Any non-2xx, transport error, or timeout = not delivered.
>
> **§O Outbound Callback Contract**
>
> - SSRF: before connecting, resolve `endpoint_url`; REJECT loopback, link-local, private, and cloud-metadata (`169.254.169.254`) ranges. TLS verification REQUIRED; at most 3 redirects, each re-checked.
> - Signing: send `X-Webhook-Signature = HMAC-SHA256(per-endpoint secret, raw body)` so the subscriber can verify origin. The secret is `$VAR`-resolved and MUST NOT be logged.
> - Bounds: per-request timeout `webhook.request_timeout_ms` (default `10000`); max response body buffered `webhook.max_response_bytes` (default `1048576`).
>
> **§SM.4 Retry and Backoff (dual-delay)**
>
> - A delivery whose response is HTTP 2xx terminates as `Succeeded`.
> - Transport errors and HTTP 5xx/429 are a **failure exit**: schedule a retry with exponential backoff `delay = min(2000 * 2^(attempt - 1), webhook.max_retry_backoff_ms)`, default cap `webhook.max_retry_backoff_ms = 3600000` (1 hour).
> - HTTP 4xx other than 429 terminates as `Failed` immediately (no retry) — the request is malformed and retrying cannot help.
> - Retries stop after `webhook.max_attempts` (default `12`); the delivery then terminates as `Exhausted` and a `delivery.exhausted` internal event MUST be emitted.
> - A delivery MUST NOT remain in flight indefinitely: each request honors `webhook.request_timeout_ms`. Timeout is treated as a transport error (failure exit).
>
> **§TM.3 Delivery and Retry (Core Conformance)** *(mirrors §SM.4)*
>
> - 2xx response terminates the delivery as `Succeeded` and removes it from the in-flight map.
> - Transport error or 5xx/429 schedules a retry with 2s-based exponential backoff capped by configured `webhook.max_retry_backoff_ms` (as specified in §SM.4).
> - 4xx (except 429) terminates as `Failed` with no retry.
> - The `<max_attempts>`-th failure terminates as `Exhausted` and emits exactly one `delivery.exhausted` event.
> - Each request honors `webhook.request_timeout_ms`; a timed-out request is categorized as a transport error, never as success.
> - The `Idempotency-Key` header equals `delivery_id` on every attempt, including retries (no double-delivery confusion).
> - SSRF: a delivery whose `endpoint_url` resolves to a private/metadata address is rejected before any connection.
> - Restart: in-flight deliveries reload from the durable store and resume; none are lost.
>
> **§DOD.1 Definition of Done — Core (excerpt)**
>
> - [ ] Exponential backoff with cap (`webhook.max_retry_backoff_ms`, default `3600000`).
> - [ ] Attempt ceiling (`webhook.max_attempts`, default `12`) emitting `delivery.exhausted` on exhaustion.
> - [ ] Per-request timeout (`webhook.request_timeout_ms`, default `10000`) categorized as transport error.
> - [ ] Max response buffer (`webhook.max_response_bytes`, default `1048576`) — no unbounded read.
> - [ ] SSRF rejection of loopback/link-local/private/metadata targets before connect.
> - [ ] HMAC signature header over the raw payload using the per-endpoint secret (`$VAR`-resolved; never logged).
> - [ ] Durable `DeliveryAttempt` rows; in-flight set reloaded from store on restart.
> - [ ] Process entrypoint: exit `0` on clean shutdown, nonzero on startup/abnormal exit.

The example shows the full triangle closing for a single behavior: the backoff rule is **defined once** with a literal formula and named/defaulted config (§SM.4), **asserted** as a deterministic Core-Conformance test with a back-pointer and restated literals (§TM.3), and **checked off** as a present-or-absent deliverable with inline parameters (§DOD.1) — and it demonstrates the §0.2 additions (Persistence, Delivery Semantics, Outbound/SSRF) that the calibration example did not need.

---

总结陈述：本指南在原草案基础上完成定稿，新增了关键的"可移植性元层"(§0):明确区分骨架中哪些是**不变结构**、哪些需**替换领域名词**、哪些是**仅作示例须重新推导**的架构决策,并给出触发式清单——当系统涉及持久化、外发投递、不可信目标回调(SSRF)、多租户、定时调度(时区/DST)、水平扩展或 API 驱动配置时,必须新增对应章节。同时补齐了所有被评审指出的硬伤:时钟双延迟回退机制(干净退出的短续poll vs 失败退出的指数回退)、三分支对账(终态清理/活跃刷新/"悬置态"终止但不清理)、双结构认领模型(claimed 集合 vs running 映射,外加显式标注"非派发门控"的记账集合)、单工作单元内有界续轮循环、分页与顺序保持、空输入短路、防御式配置重载兜底、绝对/增量遥测去重、进程入口与退出码契约、按时间/按尺寸双重有界执行、信任边界随输入来源翻转,以及"核心正确性保证绝不可降级为 implementation-defined"的判断准则。全文保留了原有的 RFC 2119 规范、implementation-defined 模式、一致性档位双挂(测试矩阵+DoD)、可追溯三角闭环、有意冗余速查表、外部事实源让渡、归一化错误类目、安全不变量等全部优点,自检量表扩至 41 项,Worked 示例改用 push/durable/SSRF 的 webhook 场景以演示新增章节——使任何作者据此即可为**任意**需求产出 Symphony 级、可一次成型实现的规范。