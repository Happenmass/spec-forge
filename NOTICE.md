# Third-Party Notices

This plugin (`spec-forge`) includes two skills **ported and adapted from
Superpowers** by Jesse Vincent, used under the MIT License.

- **Source:** https://github.com/obra/superpowers (v5.1.0)
- **Ported skills:**
  - `skills/writing-plans/` — `SKILL.md` and `plan-document-reviewer-prompt.md`
  - `skills/executing-plans/` — `SKILL.md` (port + substantial original extension)
- **Adaptations made during the port:**
  - Namespaced to this plugin (`spec-forge:writing-plans`, `spec-forge:executing-plans`).
  - Cross-references rewired into the spec-forge pipeline (`full-spec` /
    `quick-spec` → `writing-plans` → `executing-plans`).
  - Superpowers-only sub-skills (`subagent-driven-development`,
    `using-git-worktrees`, `finishing-a-development-branch`) made **optional**,
    with inline fallbacks, so the skills work standalone but interoperate with
    Superpowers if it is installed.
  - Default plan path changed to `docs/plans/`.
  - Frontmatter aligned to this plugin's conventions.
  - `executing-plans` was given a **Workflow-first execution engine** —
    `skills/executing-plans/reference/execution-workflow.md` and the per-task
    model-routing rubric (one fresh subagent per task, complexity-matched model,
    independent review on complex tasks). This engine is **original spec-forge
    work**, inspired by the `superpowers:subagent-driven-development` pattern but
    not derived from its source; the linear in-session path remains the adapted
    port.

The `spec-forge:full-spec` and `spec-forge:quick-spec` skills and their bundled
guidelines are original work and are **not** covered by this notice.

---

Superpowers is licensed under the MIT License:

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
