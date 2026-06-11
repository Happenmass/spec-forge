---
name: quick-spec
description: >-
  Produce a tight, one-page, implementable spec for a SMALL single-point /
  single-module feature that lives inside an existing codebase — a single
  function, one endpoint, a field/param addition, a small enhancement, or a
  scoped bug fix. It anchors to the real code (pins actual file paths,
  signatures, and types), and outputs a typed behavior contract + an
  edge-case/error table + concrete acceptance examples — and nothing heavier.
  Fast, single-pass, minimal questions. Use when the user wants to "spec this
  small change", "写个小 spec / quick spec", "mini spec for this function/
  endpoint", or formalize a one-module change before implementing. NOT for large
  / system-level requirements (a new service, multi-module feature, or platform)
  — use the full-spec skill for those.
when_to_use: >-
  Scope gate: one module / function / endpoint, no new state machine, no service
  boundary, fits in one reviewer's head. Escalate to full-spec the moment the
  change grows (new persistence schema, multi-tenant/HA, an external integration
  contract, or >~2-3 modules). Triggers: "小功能/小改动 spec", "quick spec",
  "spec this helper/endpoint/bugfix".
argument-hint: "[feature description | path/to/file_or_module]"
disable-model-invocation: false
user-invocable: true
allowed-tools: "Read Grep Glob Bash AskUserQuestion Write"
---

# quick-spec — a tight, implementable spec for a small feature

You produce a **one-page** spec for a single-point / single-module feature,
**anchored to the actual codebase**, in a single fast pass. The method lives in
the bundled guideline — apply it, do not freelance a structure from memory. This
is the deliberately lightweight sibling of `full-spec`; staying lean is the
whole point.

## Bundled reference

- **The method** — `${CLAUDE_SKILL_DIR}/reference/guideline.md`
  Short and prescriptive: the boundary/escalation checklist, the compact
  one-page section skeleton (with which sections are OPTIONAL and when to
  include them), the codebase-anchoring rules, the lightweight conventions, a
  quality checklist, both-direction anti-patterns, a copy-paste scaffold, and
  worked micro-examples. Read it — it's a few minutes.

## First: is this actually small? (escalation gate)

Run the guideline's **escalation checklist before writing anything**. STOP and
recommend **`/spec-forge:full-spec`** instead if the feature trips any trigger:

- introduces or changes a non-trivial **state machine**;
- spans more than ~2–3 modules or crosses a **service boundary**;
- needs a new **persistence schema or migration**;
- has **multi-tenant / isolation** or **HA / scaling** concerns;
- defines a new **external integration contract**.

If you trip a trigger **mid-writing**, stop and escalate — do not force the small
template onto a big change.

## Process (lean, single-pass — no multi-agent workflow)

1. **Read** `reference/guideline.md`.
2. **Capture** the feature ($ARGUMENTS may hold it inline; or a path/module —
   read it).
3. **Escalation check** (above).
4. **Anchor to the codebase.** Locate and read the target code with Grep / Glob
   / Read. Pin the **real** file paths, function/type signatures, and existing
   naming and error conventions. The behavior contract MUST reuse existing types
   and match repo idioms, and cite concrete `file:line` touchpoints. If you
   cannot find the target, ask the user where it lives.
5. **Resolve ambiguity minimally.** Only use **AskUserQuestion** (one round,
   ≤3 questions) if the behavior is genuinely ambiguous *and* you cannot settle
   it from the code or conventions. Otherwise state your assumptions inline and
   proceed — do not interview for a small change.
6. **Write the one-page spec** following the compact skeleton: Title + one-line
   intent; Context & Scope (in / out bullets); **Behavior Contract** (typed I/O
   with explicit nullability, reusing existing types; `MUST` only for the
   load-bearing rules); **Edge Cases & Errors** (condition → behavior table);
   Data / State / Side Effects (*only if it touches persistent state*);
   **Acceptance Criteria** (concrete input→expected / given-when-then examples —
   the "done" gate, mandatory); Dependencies & Integration Points (*only if it
   has seams*); Notes & Assumptions (optional). **Drop OPTIONAL sections whose
   surface is absent — do not pad.**
7. **Self-review** against the guideline's quality checklist (including the
   anti-bloat item: "could this be smaller, or just a code comment?") and the
   both-direction anti-patterns (too-vague *and* over-specified).
8. **Deliver.** Write the spec to a file — default `./<feature-slug>-spec.md` in
   the project (confirm/derive a non-colliding name; never clobber). For a very
   small spec you MAY present it inline and offer to save. Then give a
   file-change card and a Chinese summary per the user's standing conventions.

## Guardrails

- **Anchor, don't abstract.** Real paths, real signatures, reuse existing types,
  cite `file:line`. A small-feature spec that ignores the codebase is wrong.
- **One page.** Keep OPTIONAL sections out unless the feature needs them. If you
  feel the urge to add layers, conformance profiles, or a state-machine section,
  that is the signal to **escalate to full-spec**, not to expand here.
- **`MUST` sparingly** — only the load-bearing contract. Don't sprinkle RFC 2119
  over a 30-minute change.
- **Acceptance examples are mandatory.** They are what makes "done" decidable.
- **Don't invent load-bearing behavior silently** — decide from the code, or ask
  one tight question.
