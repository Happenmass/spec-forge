---
name: writing-plans
description: >-
  Use when you have a spec or requirements for a multi-step task, before
  touching code. Turns the spec into a comprehensive, bite-sized, TDD-structured
  implementation plan an engineer or subagent can execute task-by-task — exact
  file paths, real code in every step, exact test commands with expected output,
  frequent commits. Pairs with spec-forge:full-spec / spec-forge:quick-spec
  (which produce the spec) and hands off to spec-forge:executing-plans. Use when
  the user wants to "write an implementation plan", "plan this feature before
  coding", "把 spec/需求写成实施计划", or turn a design into actionable tasks.
when_to_use: >-
  After a spec or clear requirements exist and before implementation. If there
  is no spec yet, write one first (spec-forge:full-spec for large, quick-spec
  for small). Hands off to spec-forge:executing-plans (inline) or
  superpowers:subagent-driven-development (if that plugin is installed).
argument-hint: "[spec path | feature name]"
allowed-tools: "Read Grep Glob Bash Write Edit"
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context
for our codebase and questionable taste. Document everything they need to know:
which files to touch for each task, the code, the tests, docs they might need to
check, and how to test it. Give them the whole plan as bite-sized tasks. DRY.
YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset
or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the
implementation plan."

**Upstream:** This skill consumes a spec. If you don't have one yet, write it
first with `spec-forge:full-spec` (large / system-level) or
`spec-forge:quick-spec` (single-module), then come back.

**Context:** If execution will run in an isolated worktree/branch, ensure it
exists at execution time — via your harness's native worktree tooling, or the
`superpowers:using-git-worktrees` skill if the Superpowers plugin is installed.

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default.)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken
into sub-project specs already. If it wasn't, suggest breaking this into
separate plans — one per subsystem. Each plan should produce working, testable
software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what
each one is responsible for. This is where decomposition decisions get locked
in.

- Design units with clear boundaries and well-defined interfaces. Each file
  should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are
  more reliable when files are focused. Prefer smaller, focused files over large
  ones that do too much.
- Files that change together should live together. Split by responsibility, not
  by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large
  files, don't unilaterally restructure — but if a file you're modifying has
  grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce
self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use `spec-forge:executing-plans` to implement this
> plan — it runs one fresh subagent per task via a Workflow, routing each task to
> a model matched to its complexity (or `superpowers:subagent-driven-development`
> if the Superpowers plugin is installed). Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

**Optional risk hint.** For a security-, concurrency-, migration-, or
public-API-sensitive task, add a `**Risk:** <why this is sensitive>` line under
its heading. `spec-forge:executing-plans` treats a stated risk as a **floor** when
it routes the task to a model and review level — it may route higher, never lower.

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan
failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out
  of order)
- Steps that describe what to do without showing how (code blocks required for
  code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the
plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point
to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns
from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you
used in later tasks match what you defined in earlier tasks? A function called
`clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on.
If you find a spec requirement with no task, add the task.

*Optional independent check:* for a high-stakes plan you MAY dispatch a reviewer
subagent using the template in `plan-document-reviewer-prompt.md`.

## Execution Handoff

After saving the plan, offer an execution choice:

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution
options:**

**1. Workflow Execution (this plugin)** — `spec-forge:executing-plans`: one fresh
subagent per task via a Workflow, each routed to a complexity-matched model
(haiku/sonnet/opus, fable for rare frontier tasks) with an independent reviewer
on complex tasks; checkpoints on blockers. Degrades to linear in-session
execution if Workflow is unavailable.

**2. Subagent-Driven (if Superpowers is installed)** —
`superpowers:subagent-driven-development`: a fresh subagent per task with
two-stage review, fast iteration.

**Which approach?"**

- **If Workflow Execution chosen:** use `spec-forge:executing-plans` (it runs the
  Workflow engine, degrading to linear in-session execution if Workflow is
  unavailable).
- **If Subagent-Driven chosen:** use `superpowers:subagent-driven-development`
  (requires the Superpowers plugin). If it isn't installed, fall back to
  `spec-forge:executing-plans`.

---

*Ported and adapted from [Superpowers](https://github.com/obra/superpowers)
v5.1.0 by Jesse Vincent, used under the MIT License. See `NOTICE.md` at the
plugin root.*
