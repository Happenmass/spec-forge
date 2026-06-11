# Quick-Spec Authoring Guideline — A Lightweight Method for Single-Module Small Features

This is the small-feature sibling of the full-spec guideline. Its job: take a small, single-point change inside an existing codebase — implementable in well under a day — and turn it into a tight **one-page spec** an independent implementer can build without inventing decisions, and without over-documenting.

**Brevity is a feature.** The full guideline makes a *system* one-pass-implementable; this makes a *change* one-pass-implementable. Same load-bearing DNA, almost none of the machinery. If your spec grows abstraction layers, conformance profiles, state machines, or a multi-component overview, you have hit an escalation trigger (§1).

---

## 1. When to Use

Use a quick-spec for a change inside existing code: one function, one endpoint, a CLI flag, a field/param addition, or a scoped bug fix. Picking the wrong track is the main failure mode, so make one decision before writing.

**Escalation triggers — if ANY fires, use the full-spec process instead:**

1. **A non-trivial state machine** — more than ~2 states, or new terminal reasons, retry/backoff, reconciliation, or a claim/idempotency model.
2. **More than ~2–3 modules, or any service boundary** — crossing a deploy boundary brings call-ordering, partial-failure, and versioning a quick-spec cannot hold.
3. **New persistence schema or migration** — any new table/column/index, backfill, or new source-of-truth state.
4. **Multi-tenant / isolation, or HA / scaling** — per-principal scoping, fairness/quotas, or a distributed claim/lease.
5. **A new or changed external integration contract** — a new outbound call whose duplication/success matters, a user-controlled destination (SSRF surface), a new webhook/API shape, or a new third-party schema dependency.

If none fires, write the quick-spec.

*Not a trigger:* reporting, previewing, or dry-running side effects **without performing any new call or write** does not trip 1, 3, or 5 — a read-only preview of existing behavior (`--dry-run`, `--plan`) stays on the quick track.

*Trip a trigger mid-writing?* Stop — don't stretch the quick-spec. Fold the draft into the full-spec scaffold and restart there. Escalation moves the *ceremony*, not the *rigor floor*: a quick-spec still owes everything in §2.

---

## 2. Principles (the surviving DNA)

Load-bearing at any size; none can be dropped without the spec failing its own acceptance examples.

- **Unambiguous behavior.** One defined output per input. The implementer never invents a decision the author owed them.
- **Typed I/O + explicit nullability.** Every input, output, and touched field is typed. (Nullability and MUST-discipline conventions live in §5.)
- **Enumerated edge cases & errors.** Empty / null / zero / boundary, and what each does. Listing these *is* the spec's value-add over a one-line ticket.
- **Verifiable done-ness.** Concrete `input → expected output` examples make "done" decidable without the author. A 3–6 row table replaces the entire test matrix.
- **Define each term once.** Even a one-function spec drifts if "valid" or "normalized" means two things.

---

## 3. Codebase Anchoring

A small feature lives inside an existing codebase, so its spec is anchored to that reality, not derived in a vacuum. The biggest quality gap is inventing a parallel vocabulary — new type names, error shapes, helpers — the implementer must then reconcile with what the repo already does.

1. **Read first, then pin.** Open the target module before writing. Cite the real `path/to/module.ext:line` and the **verbatim current** signature you will touch (param types, return type, error type); quote what exists, then state the delta. Never paraphrase a signature into a wished-for one. Non-function surfaces (CLI, event) legitimately have 2–3 anchors — label each (`Anchor (flag registration):`, `Anchor (action path):`, `Anchor (exit/output):`) and cite all.
2. **Reuse existing types and conventions.** Express the contract in the repo's existing types, enums, DTOs, error/result/status enums, validation helpers, and logging idioms; cite each at its definition. Introduce a new type only when none fits, and justify it in one line. Where this guideline's generic advice conflicts with an established repo idiom, the idiom wins.
3. **Map each edge case to a real branch.** State each edge case against the actual guard, early-return, or switch arm it lives in. An edge case the implementer cannot map to a line is not yet anchored.

---

## 4. Compact Section Skeleton

A small fixed shape, not a section menu to prune. **Required:** Title, Context & Scope, Behavior Contract, Edge Cases & Errors, Acceptance Criteria. **Optional:** Data/State/Side Effects, Dependencies, Notes.

**Optional sections:** include only if the surface is genuinely present. If absent, **delete the heading** — never write "N/A" (the rule, stated once, for all optional sections). A spec fits on a screen by omission, not by stubs.

### Title + Intent — *(required)*
One sentence: what it does and who/what calls it. No background essay.
```markdown
# <Feature Name>
<One sentence: what it does and who/what consumes it.>
```

### Context & Scope — *(required — the creep fence)*
1–3 in-scope bullets, 1–3 out-of-scope bullets. Make each out-of-scope a *specific* rebuttal to a likely over-reach, and name where that concern lives if it lives somewhere.
```markdown
## Context & Scope
In scope:
- <bounded behavior this change owns>
Out of scope:
- <predictable over-reach we reject>. (Lives in <where>, or: not built.)
```

### Behavior Contract — *(required — the load-bearing core)*
The signature, typed I/O with nullability, and 2–6 precise rules. Pick the signature form for your surface:

```markdown
## Behavior Contract
Signature: `<fn(args) -> ret>` | `<METHOD /path -> status>` | `<cmd [--flag] -> exit_code>`
Inputs:
- `<arg>` (<type>[ or null]) — <units / legal values / meaning if non-obvious>
Output:
- `<ret>` (<type>[ or null]) — <shape; success vs not>
Rules:
- MUST <load-bearing rule>.
- <normal-case rule (lowercase = narration)>.
```

**CLI surface** — type all four channels, not just `<ret>`:
```markdown
Args:    `--flag` (<type>, default <val>) — <meaning>
Stdout:  <typed; machine-consumable result only; format + sort key/tie-breaker named once>
Stderr:  <diagnostics / progress / warnings — never the result stream>
Exit:    `0 → <meaning>` · `1 → <meaning>` · `2 → <meaning>`  (every reachable code, one meaning each)
```
If output is consumed by humans or scripts, define its **format and ordering once with an explicit tie-breaker** (model: §9.2's `(created_at, id)`).

### Edge Cases & Errors — *(required)*
A condition → behavior table. Include empty/null/degenerate input, invalid input (reject vs coerce vs ignore), and any boundary/limit. Each row states what the caller **observes** — for a fn/HTTP surface, the error value/code/exception (not just "fails"); for a CLI, the `(stdout, stderr, exit)` tuple, split into columns when they diverge.
```markdown
## Edge Cases & Errors
| Condition | Behavior |
|---|---|
| <empty / null input> | <e.g. returns empty, no side effect> |
| <invalid input> | <reject with <error/code> | coerce | ignore> |
| <boundary / limit hit> | <defined outcome> |
```

### Data / State / Side Effects — *(OPTIONAL)*
**Include if** the feature touches **or deliberately suppresses** persistent state, an external system, or a non-idempotent side effect. Pure in-memory transforms: delete this heading.
```markdown
## Data / State / Side Effects
- Writes: <store/field/external call>.
- Suppressed: MUST NOT <write/call> — <when this is the feature's core guarantee, e.g. dry-run>.
- Invariant: <what must stay true>.
- Idempotency: <idempotent on <key> | not idempotent — caller must <X>>.
```
For suppression, prefer **one blanket invariant** (`MUST NOT perform any create/update/delete the non-dry-run path would`) over enumerating every suppressed write; enumerate only writes whose suppression is non-obvious.

### Acceptance Criteria — *(required — makes "done" decidable)*
3–6 concrete examples with literal values, covering at least one happy path plus the key edge/error rows. **Every MUST in the contract must be checkable against at least one example here.** This list *is* the Definition of Done; do not write a separate one.

Use `input -> output` for value returns; use **Given/when/then** when an example must assert a post-condition or a *negative* effect (the canonical form for CLI / side-effecting features — `input -> output` cannot encode "and nothing was written").
```markdown
## Acceptance Criteria
- `<concrete input>` -> `<concrete expected output>`.
- <error case>: `<bad input>` -> `<exact error/code>`.
- Given <state>, when <action>, then <observable result> and <store byte-identical to before>.
```

### Dependencies & Integration Points — *(OPTIONAL)*
**Include if** the feature calls, or is called by, a seam someone must wire in. Self-contained change: delete.
```markdown
## Dependencies & Integration Points
- Calls: `<module/API>` — <assumed contract / failure handling>.
- Called by: `<caller>` — <when / with what>.
```

### Notes & Assumptions — *(OPTIONAL)*
**Include if** there is a real assumption or deferral that changes how it's built. Otherwise delete — do not pad.
```markdown
## Notes & Assumptions
- Assumes <condition the implementer may rely on>.
- TODO (deferred, out of scope): <thing>.
```

---

## 5. Conventions

- **MUST-discipline.** Bold **MUST** / **MUST NOT** only for clauses that, if broken, make the feature incorrect — correctness, data integrity, the security guard (2–4 of them). Everything else is lowercase narration.
- **Nullability.** Annotate every nullable value with ` or null` where it is typed; if a field can be absent, say so. For CLI flags, type the resolved value and state the absent-default (`--dry-run (bool, default false)`) — not ` or null`; keep ` or null` for value-bearing options that can be genuinely omitted.
- **One term, one definition.** Define each domain term ("valid", "normalized", "cursor") exactly once and use it consistently.
- **Literal values in examples.** Acceptance rows use concrete values (`"120"` → `120`), never descriptions ("a valid number").

---

## 6. Quality Checklist

- [ ] Every input and output is **typed**; every nullable value marked ` or null`; for a CLI, every reachable **exit code is enumerated** with one meaning each.
- [ ] Every edge/error condition has **exactly one** defined behavior, stated as what the caller observes.
- [ ] Output consumed by humans/scripts has its **format and ordering** defined once with an explicit tie-breaker.
- [ ] Acceptance examples use **literal values** and cover every `MUST` in the contract (including negative/no-side-effect post-conditions).
- [ ] Every change point and reused type carries a real **`file:line`** that resolves to current source.
- [ ] No escalation trigger is hiding inside the spec (no smuggled state machine, migration, or new service hop).
- [ ] **Anti-bloat:** could this have been a code comment or a smaller spec? Cut any section that is padding.

---

## 7. Anti-Patterns (both directions)

The risk is bidirectional; the dominant failure is **bloat-back**.

**Too vague — under-specified**
- **No types / no nullability.** "Takes a header, returns a delay" — implementer guesses the type and the absent-value case.
- **Unstated edge cases.** No row for empty/null/boundary; the implementer invents behavior the author owed them.
- **Untestable done-ness.** "Works correctly" with no concrete `input → output`. "Done" becomes a conversation.
- **Vague anchoring.** "In the auth module" instead of `auth/session.ts:42`.
- **Invented vocabulary.** New error shape or helper the repo already has under a different name.

**Over-specified — full-spec machinery on a 30-minute change**
- **Sections marked "N/A."** Delete the heading instead.
- **Cargo-culted architecture.** A state machine, reconciliation, or dual-delay regime on a stateless transform — copying the full example's shape, not its altitude.
- **Pseudocode the signature already determines.** Use pseudocode *only* when the logic is genuinely non-obvious (a tricky ordering, off-by-one, or dedup rule).
- **Ceremony.** RFC-2119 preamble, conformance profiles, a separate Definition of Done, a traceability triangle — all amortize over a large surface and cost more than they save on one screen.
- **Background essays.** A page of context for a one-line behavior change.

> Adding a heavy section because the feature "kind of" needs it is usually an **escalation trigger** (§1), not a section to grow.

---

## 8. One-Page Scaffold (copy-paste)

```markdown
# <Feature Name>
<One sentence: what it does and who/what consumes it.>

## Context & Scope
In scope:
- <bounded behavior this change owns>
Out of scope:
- <predictable over-reach we reject>. (Lives in <where>, or: not built.)

## Behavior Contract
Anchor: `<path/to/module.ext:line>` — current `<verbatim signature>`.
Signature: `<fn(args) -> ret>` | `<METHOD /path -> status>` | `<cmd [--flag] -> exit_code>`
Inputs:
- `<arg>` (<type>[ or null]) — <units / legal values / meaning>
Output:
- `<ret>` (<type>[ or null]) — <shape; success vs not>
Rules:
- MUST <load-bearing rule>.
- <normal-case rule>.

## Edge Cases & Errors
| Condition | Behavior |
|---|---|
| <empty / null> | <defined outcome> |
| <invalid> | <reject with <code> | coerce | ignore> |
| <boundary> | <defined outcome> |

## Acceptance Criteria
- `<concrete input>` -> `<concrete expected output>`.
- <error case>: `<bad input>` -> `<exact error/code>`.

<!-- OPTIONAL — delete the heading if the surface is absent (never write N/A):
## Data / State / Side Effects
## Dependencies & Integration Points
## Notes & Assumptions
-->
```

---

## 9. Worked Micro-Examples

Three specs across the band. **9.1 is the typical case;** 9.3 is the *heaviest a quick-spec should ever get* — most specs sit closer to 9.1. Each keeps the load-bearing core — typed contract, edge table that pins every branch, acceptance examples that double as the test matrix — and drops everything else as absent surface, not skipped work.

### 9.1 `parseRetryAfter(header)` — a pure helper (typical)

```markdown
# parseRetryAfter
Parse a `Retry-After` response header into a delay in whole seconds for the HTTP client's backoff logic.

## Context & Scope
In scope:
- Parse both RFC 7231 forms (delta-seconds and HTTP-date) into a non-negative integer of seconds.
Out of scope:
- Deciding the fallback backoff. (Caller owns it; this returns null to mean "no server-directed delay".)
- Any network I/O or state — pure function.

## Behavior Contract
Anchor: `src/http/retry.ts:1` (new export); reuses the client's seconds-based delay convention at `retry.ts:88`.
Signature: `parseRetryAfter(header: string | null, now?: Date): number | null`
Inputs:
- `header` (string or null) — raw header value; null when absent.
- `now` (Date) — injectable clock for HTTP-date math; defaults to current time. Injectable so tests are deterministic.
Output:
- (number or null) — non-negative whole seconds, or null when absent/invalid. Caller treats null as "fall back to client backoff".
Rules:
- MUST parse digits-only delta-seconds as an integer (RFC 7231 §7.1.3), after trimming ASCII whitespace.
- MUST parse IMF-fixdate as `max(0, ceil((date - now) / 1000ms))`; a past date clamps to 0, never negative.
- MUST NOT throw on any input; every invalid case returns null.

## Edge Cases & Errors
| Condition | Behavior |
|---|---|
| `null` / `""` / `"   "` | null (absent or empty after trim) |
| `"0"` | 0 (zero delay is valid, not null) |
| `"-5"` / `"12.5"` | null (digits-only ABNF) |
| HTTP-date 60s in future | 60 |
| HTTP-date 500ms in future | 1 (sub-second rounds up via ceil) |
| HTTP-date in the past | 0 (clamp) |
| `"tomorrow"` / malformed | null |

## Acceptance Criteria
- `parseRetryAfter(null)` -> `null`; `parseRetryAfter("  120 ")` -> `120`; `parseRetryAfter("0")` -> `0`.
- `parseRetryAfter("-1")` -> `null`; `parseRetryAfter("1.5")` -> `null` (never throws).
- With `now = 2026-10-21T07:27:00Z`: `parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", now)` -> `60`; with `now` one minute later -> `0`.
```

### 9.2 `sync --dry-run` — a read-only CLI flag

```markdown
# sync --dry-run
Add `--dry-run` to the `sync` command: print the plan of changes it would make, perform none of them.

## Context & Scope
In scope:
- Compute the same plan the real sync would, render it as a stable sorted list, exit without mutating anything.
Out of scope:
- New diff logic. (Reuses the existing planner; this only suppresses the apply step and renders.)
- Any new outbound call — read-only preview of existing behavior, stays on the quick track.

## Behavior Contract
Anchor (flag registration): `cmd/sync.go:31` — current `sync` cobra command, no `--dry-run`.
Anchor (action path): `cmd/sync.go:74` — `applyPlan(plan)` runs the mutations.
Anchor (exit/output): `cmd/sync.go:96` — exit-code path; reuses `render.Plan` at `render/plan.go:12`.
Signature: `sync [--dry-run] -> exit_code`
Args:    `--dry-run` (bool, default false) — when set, plan and print only.
Stdout:  the plan, one change per line, sorted by `(resource_type, resource_id)` (tie-breaker `resource_id`); machine-consumable, no diagnostics.
Stderr:  progress and warnings only — never plan lines.
Exit:    `0 → ran successfully (dry-run or real)` · `1 → planning failed` · `2 → bad usage`.
Rules:
- MUST compute the plan via the existing planner, unchanged.
- MUST NOT perform any create/update/delete that the non-dry-run path would (`applyPlan` is skipped entirely).
- MUST print the plan to stdout in the sorted order above; warnings go to stderr so stdout stays parseable.
- exit 0 on a successful dry-run whether or not the plan is empty; a non-zero exit means a planning error, not "changes pending".

## Data / State / Side Effects
- Suppressed: MUST NOT perform any create/update/delete the non-dry-run path would — this is the feature's core guarantee.
- Invariant: the target store is byte-identical before and after a `--dry-run` invocation.

## Edge Cases & Errors
| Condition | Stdout | Stderr / Exit |
|---|---|---|
| no changes needed | (empty) | exit 0 |
| 3 changes across 2 types | 3 sorted lines | exit 0 |
| warning during planning | clean plan only | warning on stderr, exit 0 |
| planner error | (nothing) | error on stderr, exit 1 |

## Acceptance Criteria
- Given a store needing 3 changes, when `sync --dry-run`, then stdout is exactly those 3 lines sorted by `(resource_type, resource_id)`, exit 0, and the store is byte-identical to before.
- Given no changes needed, when `sync --dry-run`, then stdout is empty and exit 0.
- Given a warning is emitted while planning, when `sync --dry-run`, then stdout contains only the plan, the warning is on stderr, and exit 0.
- Given the planner errors, when `sync --dry-run`, then exit 1 and nothing is written to stdout.
```

### 9.3 `?cursor=` keyset pagination on `GET /items` (top of the band)

```markdown
# Keyset pagination for GET /items
Add opt-in keyset pagination (`?cursor=`, `?limit=`) to the existing endpoint, which currently returns all rows.

## Context & Scope
In scope:
- Seek pagination over the stable order `(created_at, id)`, returning `next_cursor` when more rows remain.
Out of scope:
- Offset pagination. (Rejected — skips/duplicates rows under concurrent insert.)
- New persistence. (Reuses the existing `items` read path; index assumed present.)

## Behavior Contract
Anchor: `api/items_handler.go:54` — current `GET /items` returns the full list.
Signature: `GET /items?cursor=<str>&limit=<int> -> 200`
Inputs (query params):
- `cursor` (string or null) — opaque base64url keyset position from a prior `next_cursor`; null/absent = start from beginning.
- `limit` (integer or null) — page size; default 50, clamped to [1, 200]. Non-integer is a 400.
Output (body):
- `items` (list of Item) — up to `limit` rows ordered by `(created_at ASC, id ASC)`.
- `next_cursor` (string or null) — cursor for the next page, or null on the last page.
Rules:
- MUST order by the total order `(created_at, id)`; `id` is the tiebreaker so the keyset is unique and stable.
- MUST fetch `limit + 1` rows; drop the extra and encode its predecessor's key as `next_cursor`, else null.
- MUST seek with `WHERE (created_at, id) > (cursor.created_at, cursor.id)`; MUST NOT use `OFFSET`.
- A cursor that fails to decode MUST return 400 `{ error: { code: "invalid_cursor" } }` — never a silent reset to page one.

## Edge Cases & Errors
| Condition | Behavior |
|---|---|
| no cursor, no limit | first 50 rows; `next_cursor` set iff >50 rows exist |
| `limit=0` / `limit=999` | clamp to 1 / 200 |
| `limit=abc` | 400 (non-integer) |
| cursor past the last row | `items: []`, `next_cursor: null` |
| malformed/tampered cursor | 400 `invalid_cursor` |
| row inserted before cursor position | not re-served (keyset is `> cursor`) |

## Acceptance Criteria
- Seed 120 rows. `GET /items` -> 50 items + non-null `next_cursor`. Following it twice yields rows 51–100 then 101–120, `next_cursor: null`, with zero overlaps and zero gaps.
- `GET /items?limit=200` on 120 rows -> all 120, `next_cursor: null`.
- Insert a row with `created_at` before the cursor between page 1 and page 2; page 2 MUST NOT include it.
- `GET /items?cursor=not-a-real-cursor` -> 400 `{ error: { code: "invalid_cursor" } }`.
- `GET /items?limit=abc` -> 400; `GET /items?limit=0` behaves as `limit=1`.

## Notes & Assumptions
- Assumes a composite index on `(created_at, id)` exists; if not, that is a migration — escalate to full-spec.
```

All three omit any System Overview, state machine, or security chapter — their surfaces are genuinely absent. What survives is the typed contract, the exhaustive edge table, the load-bearing MUSTs, and acceptance examples that close every rule. The omissions are absent surface, not skipped work.