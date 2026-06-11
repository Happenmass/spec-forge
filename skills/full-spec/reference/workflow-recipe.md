# full-spec — Multi-Agent Drafting & Verification Recipe

This is the Phase-2 engine for the `full-spec` skill. It turns a confirmed
**Section Plan** (produced in Phase 1) into a drafted, adversarially-verified,
synthesized specification using the `Workflow` tool.

> The script below is a **skeleton you adapt at runtime**, not a fixed program.
> The section list, the per-section guideline template, and the fixed
> architecture decisions all come from *this* requirement's Section Plan. Author
> the script inline, parameterized by that plan.

## Inputs you must thread in

- `REQUIREMENT` — the captured requirement (verbatim, plus any read-in file).
- `DECISIONS` — the architecture decisions fixed in Phase 1 (durability, claim
  model, push/pull, trust boundary, config-delivery model, etc.).
- `SECTIONS` — the ordered Section Plan. Each item: `{ key, title, guidelineRef,
  kind }` where `guidelineRef` names the §5 template / §3 section to follow and
  `kind` ∈ INVARIANT | PARAMETERIZED | TRIGGERED.
- `GUIDELINE_PATH` / `EXAMPLE_PATH` — the bundled `reference/guideline.md` and
  `reference/example-symphony-spec.md` (pass the absolute `${CLAUDE_SKILL_DIR}`
  paths so agents can Read them).

## Providing inputs — read this first (the #1 failure mode)

You author this script at runtime from the Phase-1 Section Plan. **Inline those
values as constants — do not rely on `args` threading.** The crash to avoid: if
the script reads `const SECTIONS = args.sections` and the Workflow tool call's
`args` was left unset or passed as a JSON-*string* (a documented footgun — `args`
must be a real JSON object, never a stringified blob), then `args.sections` is
`undefined` and the script throws at the first line that uses it, **before any
agent spawns** (0 agents, nothing drafted). Inlining removes that boundary
entirely:

```javascript
const REQUIREMENT = `<the captured requirement, verbatim + any read-in file>`
const DECISIONS   = `<the architecture decisions fixed in Phase 1>`
const SECTIONS = [
  { key: 'domain', title: 'Domain Model',           guidelineRef: '§5.2', kind: 'INVARIANT' },
  { key: 'config', title: 'Configuration Contract',  guidelineRef: '§5.4', kind: 'PARAMETERIZED' },
  // …one entry per section, in skeleton order
]
const GUIDELINE = '/abs/path/reference/guideline.md'              // ABSOLUTE — ${CLAUDE_SKILL_DIR}/reference/guideline.md
const EXAMPLE   = '/abs/path/reference/example-symphony-spec.md'  // ABSOLUTE — ${CLAUDE_SKILL_DIR}/reference/example-symphony-spec.md
```

Whatever the source, **guard before the fan-out** so a wiring mistake fails loud,
not cryptic (see the skeleton). If you do prefer `args`, set the tool call's
top-level `args` to a real object `{ requirement, decisions, sections,
guidelinePath, examplePath }` and read from it — but inlining is the default
precisely because it cannot mis-thread. Pass the `${CLAUDE_SKILL_DIR}` paths as
**absolute** so the drafting and verifying agents can Read the guideline and
example.

## Shape of the workflow

1. **Draft** (fan-out, one agent per section) → each returns its section
   markdown + the list of normative claims it introduced.
2. **Assemble** (plain code) → concatenate in skeleton order into a single draft,
   prepend front matter + Normative Language block.
3. **Verify** (barrier; four independent adversarial lenses over the *whole*
   assembled draft) → structured findings.
4. **Synthesize** → one agent rewrites the draft applying all critical/major
   findings into the final spec.

Drafting fans out (sections are independent given the plan); verification needs
the *whole* assembled draft, so it is a barrier after assembly.

## Verification lenses (run all four, in parallel)

- **Rubric & anti-pattern critic** — score against guideline §6 rubric; flag §7
  anti-patterns (vague obligations, undefined nullability, no normalization
  rules, missing failure→recovery mapping, untestable requirements, scope creep).
- **Traceability checker** — for every MUST/SHOULD behavior in the body, confirm
  a matching Test-Matrix entry AND a Definition-of-Done item, each profile-tagged
  (Core / Extension / Integration). Report unmatched behaviors and orphan tests.
- **Normative-discipline checker** — verify RFC 2119 calibration: no
  load-bearing correctness/interop guarantee softened to `implementation-defined`
  or SHOULD (guideline §0.4); no MAY where a MUST is required; every
  `implementation-defined` carries a "MUST document" obligation.
- **Implementer dry-run** — read as a coding agent about to build it; list every
  point where you'd have to *invent* an unspecified decision (data shape, state
  transition, formula, error behavior). Each such point is a defect.

## Adaptable script skeleton

```javascript
export const meta = {
  name: 'full-spec-build',
  description: 'Draft + adversarially verify a Symphony-grade spec from a Section Plan',
  phases: [
    { title: 'Draft' }, { title: 'Verify' }, { title: 'Synthesize' },
  ],
}

// === Inline these from the Phase-1 Section Plan (recommended — no args boundary to mis-thread). ===
const REQUIREMENT = ''   // the captured requirement (verbatim + any read-in file)
const DECISIONS   = ''   // string: the architecture decisions fixed in Phase 1 (durability, claim model, …)
const SECTIONS    = []   // [{key,title,guidelineRef,kind}, ...] in skeleton order
const GUIDELINE   = ''   // ABSOLUTE path — ${CLAUDE_SKILL_DIR}/reference/guideline.md
const EXAMPLE     = ''   // ABSOLUTE path — ${CLAUDE_SKILL_DIR}/reference/example-symphony-spec.md

// Fail loud, not cryptic: catches an empty inline list OR an args.* that came through undefined/stringified.
if (!Array.isArray(SECTIONS) || SECTIONS.length === 0) {
  throw new Error('full-spec-build: SECTIONS is empty — inline the Section Plan (or check that args.sections was not left undefined / passed as a JSON string) before running.')
}
if (!REQUIREMENT) throw new Error('full-spec-build: REQUIREMENT is empty — inline the captured requirement (or check args.requirement was not undefined/stringified).')
if (!GUIDELINE) throw new Error('full-spec-build: GUIDELINE is empty — set the absolute path to reference/guideline.md.')

const SECTION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' },
    markdown: { type: 'string', description: 'The full section, ready to paste, following the guideline template' },
    normative_claims: { type: 'array', items: { type: 'string' },
      description: 'Each MUST/SHOULD behavior this section introduces (for traceability)' },
    open_questions: { type: 'array', items: { type: 'string' },
      description: 'Decisions left unspecified that an implementer would have to invent' },
  },
  required: ['title', 'markdown', 'normative_claims', 'open_questions'],
}

phase('Draft')
const drafted = (await parallel(SECTIONS.map((s) => () =>
  agent(
    `You are drafting ONE section of an implementable, RFC 2119-normative specification.\n\n` +
    `=== REQUIREMENT ===\n${REQUIREMENT}\n\n=== FIXED ARCHITECTURE DECISIONS ===\n${DECISIONS}\n\n` +
    `Your section: "${s.title}" (kind: ${s.kind}). Follow the guideline template/section "${s.guidelineRef}" EXACTLY.\n` +
    `Read the method at ${GUIDELINE} (focus on ${s.guidelineRef}, plus §2 principles and §4 conventions). ` +
    `Read ${EXAMPLE} ONLY to calibrate quality/shape — re-derive all domain content from THIS requirement; never copy the example's choices.\n\n` +
    `Rules: typed fields with explicit nullability ("X or null"); define each identifier/normalization once; ` +
    `calibrate MUST/SHOULD/MAY deliberately; keep load-bearing guarantees normative (never soften to implementation-defined); ` +
    `prefer enumerated states, exact formulas, and language-agnostic pseudocode over prose. ` +
    `Return the section markdown, the normative_claims it introduces, and any open_questions you could not resolve.`,
    { label: `draft:${s.key}`, phase: 'Draft', schema: SECTION_SCHEMA },
  ),
))).filter(Boolean)

// === Assemble (plain code — no agent needed) ===
const body = drafted.map((d) => d.markdown).join('\n\n')
const draft = `# <System> Specification\n\nStatus: Draft v1 (language-agnostic)\n\n` +
  `## Normative Language\n\nThe key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, RECOMMENDED, MAY, ` +
  `and OPTIONAL are to be interpreted as described in RFC 2119. "Implementation-defined" means the behavior ` +
  `is part of the implementation contract but this spec does not prescribe one policy; implementations MUST document the selected behavior.\n\n` +
  body
const allClaims = drafted.flatMap((d) => d.normative_claims)
const openQs    = drafted.flatMap((d) => d.open_questions)
log(`Drafted ${drafted.length} sections, ${allClaims.length} normative claims, ${openQs.length} open questions`)

phase('Verify')
const FINDINGS = {
  type: 'object', additionalProperties: false,
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        location: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' },
        severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
      }, required: ['location', 'problem', 'fix', 'severity'],
    } },
  }, required: ['lens', 'findings'],
}
const LENSES = [
  ['rubric',        `Score against guideline §6 rubric and flag §7 anti-patterns. Read ${GUIDELINE}.`],
  ['traceability',  `For every normative claim, confirm a matching Test-Matrix entry AND a profile-tagged Definition-of-Done item. List unmatched claims and orphan tests. Claims:\n${JSON.stringify(allClaims, null, 2)}`],
  ['normative',     `Verify RFC 2119 calibration: no load-bearing guarantee softened to implementation-defined/SHOULD (guideline §0.4); every implementation-defined carries a MUST-document obligation. Read ${GUIDELINE} §0.4 and §4.1–4.2.`],
  ['implementer',   `Read as a coding agent about to BUILD this. List every point where you'd have to invent an unspecified decision (data shape, transition, formula, error behavior). Pre-seed with these author-flagged gaps:\n${JSON.stringify(openQs, null, 2)}`],
]
const reviews = (await parallel(LENSES.map(([lens, brief]) => () =>
  agent(
    `You are an adversarial verifier (lens: ${lens}) of a draft specification. Default to finding defects; a clean bill is suspicious.\n` +
    `${brief}\n\n=== DRAFT SPEC ===\n${draft}`,
    { label: `verify:${lens}`, phase: 'Verify', schema: FINDINGS },
  ),
))).filter(Boolean)
const findings = reviews.flatMap((r) => r.findings)
log(`Verification: ${findings.filter((f) => f.severity === 'critical').length} critical, ${findings.filter((f) => f.severity === 'major').length} major`)

phase('Synthesize')
const final = await agent(
  `You are the lead author producing the FINAL specification. Rewrite the draft applying EVERY critical and major finding ` +
  `and minor ones that improve it without bloat. Keep the guideline's section skeleton, RFC 2119 discipline, typed domain model, ` +
  `state machines, config contract, failure model, reference algorithms, security invariants, test matrix, and profile-tagged DoD. ` +
  `Output ONLY the final markdown spec.\n\n=== DRAFT ===\n${draft}\n\n=== FINDINGS ===\n${JSON.stringify(findings, null, 2)}`,
  { label: 'synthesize-spec', phase: 'Synthesize' },
)
return { spec: final, sections: drafted.length, defectsClosed: findings.length }
```

## After the workflow returns

- The returned `spec` is the finalized markdown. Run the skill's **Phase 3**
  checks once more yourself (rubric / traceability / normative discipline) as a
  final gate before writing the file — the workflow verifies, but you own the
  final sign-off.
- Scale the fan-out to the requirement: a handful of sections for a moderate
  system, more for a platform. Do not silently cap coverage — if you bound it,
  say so.
