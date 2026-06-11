# Triage Report Template

Location: `docs/arch-investigations/<YYYY-MM-DD>-<slug>.md` (date from
`date +%F`, slug from the symptom, e.g. `2026-06-10-sse-no-response`). Write
the report in the language the user is working in.

The report serves three readers: the engineer who fixes (needs §3–§4), the
operator at the next live occurrence (needs §6), and future-you when the
symptom recurs in six months (needs §1–§2 and §7 to avoid re-investigating
dead ends). Don't drop §7 — knowing what was *ruled out and why* is half the
value next time.

```markdown
# <Symptom> — Architecture Triage

## 1. Symptom & Scope
- Observed: <exact behavior>
- NOT observed (negative evidence): <no events / no error logs / …>
- Frequency & environment: <intermittent? prod? multi-instance?>
- Investigated at: <commit hash> on <date>

## 2. Suspect Chain
<The end-to-end chain, hop by hop, with real class names:>
A (ClassA) → B (ClassB) → … → Z (ClassZ)

Inference rule applied: any segment failing silently produces exactly this
symptom.

| Lane | Segment | Model | Verdict in one line |
| --- | --- | --- | --- |

## 3. Ranked Root-Cause Candidates
| # | Mechanism (one line) | Segment | Likelihood | Verified | Evidence |
| --- | --- | --- | --- | --- | --- |
<"Verified" = the orchestrator re-checked the mechanism against the code
personally, not just trusted the lane. Only verified findings may rank top.>

### Candidate 1: <name>
- Mechanism: <how it produces the symptom, 2–4 sentences>
- Trigger condition: <when it fires>
- Evidence: `path/File.java:123`
  ```<lang>
  <minimal snippet>
  ```
- Why logs are silent: <swallowed where / missing log / wrong level>

### Candidate 2: …

## 4. Recommended Fixes
| Priority | Fix | Files | Kills which candidates | Suggested route |
| --- | --- | --- | --- | --- |
| P0 | … | … | #1, #3 | spec-forge:quick-spec |
<"Suggested route": quick-spec (scoped) / full-spec or writing-plans
(systemic) / executing-plans (a fix spec already exists in the repo).>

## 5. Logging & Observability Supplements (priority-ordered)
| Pri | Class.method | Level | Message template (variables) | Blind spot closed |
| --- | --- | --- | --- | --- |
<Implementable as-is. This section is the primary deliverable when no
candidate is provable from code alone.>

## 6. On-Site Diagnostic Playbook
<For the operator at the next live occurrence. Each entry:>
- **Question it answers:** <e.g. "is the input still queued?">
  ```bash
  <copy-pasteable command with real key/endpoint formats>
  ```
  <How to read the result: value X means stuck at segment B; empty means …>

## 7. Appendix
### Demoted / discarded findings
| Claim (lane) | Why demoted |
| --- | --- |
### Lane inventory
<Which lanes ran, with models — so a future triage knows what was covered.>
```
