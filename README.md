# Spec Forge

**中文** | [English](README.en.md)

一个 Claude Code 插件，为编码智能体跑通完整的 **spec → plan → execute** 流水线：
把需求变成**可实施的规范**（spec），把规范变成**细粒度的 TDD 实施计划**，再以
**每个任务一个全新子智能体**的方式执行计划——每个任务路由到与复杂度匹配的模型，
评审强度随风险分级。流水线之外还附带两个伴生组件：**`arch-triage`**，面向既有
系统的系统性问题并行调查器，其报告可回流到流水线作为输入；以及
**session-ledger**（MCP + hooks），跨 session 变更台账，让共享同一工作目录的
多个 Claude Code session 互不干扰。

spec 方法论是从一份 Symphony 级参考规范逆向提炼而来，固化为可复用的撰写指南，
分**两个高度**（大型与小型）。planning + execution 两个 skill 移植自
[Superpowers](https://github.com/obra/superpowers)（MIT）并接入了流水线。

## Skills

| 命令 | 阶段 | 适用范围 | 状态 |
| --- | --- | --- | --- |
| `/spec-forge:full-spec` | spec | **大型 / 系统级**需求（一份 PRD、一个新服务或平台、跨模块特性） | ✅ 已交付 |
| `/spec-forge:quick-spec` | spec | **单点 / 单模块**小特性（一个函数、一个端点、一个开关、一次范围明确的 bug 修复） | ✅ 已交付 |
| `/spec-forge:writing-plans` | plan | 把 spec 变成细粒度、TDD 结构的实施计划 | ✅ 已交付 |
| `/spec-forge:executing-plans` | execute | 以每任务一个全新子智能体（Workflow）执行计划，每个任务路由到复杂度匹配的模型，评审随风险分级 | ✅ 已交付 |
| `/spec-forge:arch-triage` | triage | **架构级 / 系统性问题**调查（静默失败、卡死、事件丢失、间歇性无响应）——并行只读 lane 子智能体 + 交叉验证 → 排序后的根因报告 | ✅ 已交付 |

**流水线：** `full-spec` / `quick-spec` → `writing-plans` → `executing-plans`。
每个阶段交接给下一个；如果你已经有上游产物，也可以从任意阶段进入。
`arch-triage` 是**面向既有系统的侧门**：它调查一个系统性症状，其报告作为
`quick-spec`/`full-spec` 的动机回流进流水线。

不确定该用哪个 spec skill？先从 `quick-spec` 开始——它会先跑一个升级闸门，
一旦改动实际上很大（新状态机、持久化 schema、服务边界、多租户、外部集成契约），
就会提示你切换到 `full-spec`。

### `/spec-forge:full-spec`

把大型需求变成一份完整 spec：带类型的领域模型、状态机、配置契约、失败模型、
语言无关的参考算法、安全不变量、测试/验证矩阵，以及带一致性档位
（conformance profiles）的 Definition-of-Done 清单——全部使用 RFC 2119
规范化用语。

它分三个阶段工作：

1. **范围与章节集推导** —— 应用指南的可移植性规则与触发问题，然后向你提问
   （若干轮成批问题），敲定真正的未知项与架构决策。
2. **起草 + 对抗性校验** —— 展开多智能体 `Workflow`：每个章节一个起草智能体，
   然后四个独立校验器（评分细则与反模式、可追溯性、规范化用语纪律、实现者
   干跑），最后合成。`Workflow` 不可用时降级为单智能体线性起草。
3. **校验、定稿、交付** —— 跑质量评分细则和可追溯性 / 规范化用语闸门，
   然后把 spec 写入文件。

### `/spec-forge:quick-spec`

轻量级的同胞。把存在于既有代码库内的小改动变成一页纸的紧凑 spec：带类型的
行为契约、边界情形/错误表、具体的验收示例——不附带任何更重的东西。

刻意做到快速、单遍（不用多智能体工作流）：

1. **升级闸门** —— 检查改动是否真的小；一旦触发条件（状态机、持久化 schema、
   服务边界、多租户、外部集成），就停下并指向 `full-spec`。
2. **代码库锚定** —— 读取目标模块，钉死*真实的*文件路径、签名和类型，
   让 spec 复用现有习语，而不是发明一套平行词汇。
3. **撰写 + 自查** —— 填充紧凑骨架，丢掉所有对应表面不存在的可选小节，
   然后跑一个简短的反臃肿清单。

### `/spec-forge:writing-plans`

接一份 spec（来自任一 spec skill），产出由**细粒度 TDD 任务**构成的完整实施
计划——精确的文件路径、每一步都是真实代码、带预期输出的精确测试命令、频繁
提交、零占位符。包含一个对照 spec 的自查环节和可选的计划文档评审模板。
交接给 `executing-plans`。默认输出：`docs/plans/YYYY-MM-DD-<feature>.md`。

### `/spec-forge:executing-plans`

通过 `Workflow` 把写好的计划**以每任务一个全新子智能体**的方式执行：加载计划、
批判性评审、按复杂度对每个任务分类并路由到匹配的模型（`haiku` 机械型 /
`sonnet` 标准型 / `opus` 复杂型 / `fable` 罕见的前沿顶尖型），任务**顺序**执行
（每个建立在上一个 commit 之上），复杂任务追加独立评审者，遇到任何 blocker
即停止并上报，全绿后收尾分支（给出 merge/PR 选项）。`Workflow` 不可用时降级
为线性的会话内执行。未经同意绝不在 `main`/`master` 上开工。引擎配方
（可改编的 Workflow 脚本 + 路由细则）在
`executing-plans/reference/execution-workflow.md`。

### `/spec-forge:arch-triage`

调查既有代码库中的**架构级 / 系统性问题**——静默失败、卡死、消息丢失、
间歇性无响应，任何"日志里什么都看不到"的问题。它把症状映射到端到端架构链路，
派出**并行只读调查子智能体**（每个链路段一个，最密集的段用 `opus`，外加一个
横切的可观测性盲区审计员），强制每条 lane 输出可对比的统一契约（编号的失败
模式、触发条件、`file:line` 证据、日志为何静默、高/中/低可能性），随后在写
报告前**亲自交叉验证头部发现**，最终把排序后的根因报告写到
`docs/arch-investigations/YYYY-MM-DD-<slug>.md` —— 附带按优先级排序的修复
建议、日志补充清单和现场诊断手册。严格只读；修复交接给 `quick-spec` /
`writing-plans`。lane 简报与报告模板在 `arch-triage/reference/`。

## Session Ledger（MCP + hooks）

随插件捆绑的伴生组件（`session-ledger/`），解决*另一种*多 session 问题：
多个 Claude Code session 共享**同一个工作目录**，各自被不是自己做的未提交
改动搞糊涂。它给每个 session（按工作目录索引，即 git toplevel）提供：

- **确定性记录** —— `PreToolUse` hook 自动把每次
  `Write`/`Edit`/`MultiEdit`/`NotebookEdit` 记入按目录共享的台账
  （谁、哪个文件、何时、在哪个声明的目标下）。不依赖模型记得汇报。
- **写前冲突提示（warn-once）** —— 第一次试图碰另一个 session 正在编辑的文件
  （或一个没人记录的脏文件）会被拒绝并附上解释；知情后重试即放行。
  把"事后回溯"变成"事前规避"。
- **session 启动简报** —— `SessionStart` hook 把其他 session 进行中工作的摘要
  注入新 session 的上下文。
- **MCP 工具** —— `start_task(goal, planned_files?)` 声明意图（并在声明时就对
  冲突预警），`list_active_changes()` 列出目录内所有进行中的工作，
  `who_changed(file)` 归因一个具体 diff。
- **提交后自动归档** —— 文件重新变干净的条目会对照 `git status` 惰性对账，
  归档时附上简短的 commit 溯源（sha + subject）。

零依赖纯 Node；通过插件的 `.mcp.json` 和 `hooks/hooks.json` 自动注册。
设计笔记、存储布局与限制：[`session-ledger/README.md`](session-ledger/README.md)。
回归测试：`bash session-ledger/smoke-test.sh`。

> **互操作：** 两个 planning skill 移植自 Superpowers 并与之保持兼容。
> 当 Superpowers 插件已安装时，它们会在相关步骤提供其 skill ——
> `subagent-driven-development`（执行，作为 `writing-plans` 的交接备选）、
> `using-git-worktrees`（隔离）、`finishing-a-development-branch`
> （收尾，在 `executing-plans` 中）；否则回退到自包含的内联行为。

## 目录结构

```
spec-forge/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── full-spec/                            # spec — 大型 / 系统级需求
│   │   ├── SKILL.md                          # 编排（精简）
│   │   └── reference/
│   │       ├── guideline.md                  # 方法本体（大型）——可复用的撰写指南
│   │       ├── workflow-recipe.md            # Phase-2 多智能体 Workflow 配方 + 脚本骨架
│   │       └── example-symphony-spec.md      # 校准示例（Symphony spec）
│   ├── quick-spec/                           # spec — 单模块小特性
│   │   ├── SKILL.md                          # 编排（精简、单遍）
│   │   └── reference/
│   │       └── guideline.md                  # 方法本体（小型）——一页纸轻量指南
│   ├── writing-plans/                        # plan — spec → 细粒度 TDD 计划（移植，MIT）
│   │   ├── SKILL.md
│   │   └── plan-document-reviewer-prompt.md  # 可选的评审子智能体模板
│   ├── executing-plans/                      # execute — 经 Workflow 每任务一个子智能体（移植 + 扩展，MIT）
│   │   ├── SKILL.md                          # 编排（精简）+ 模型路由细则
│   │   └── reference/
│   │       └── execution-workflow.md         # Workflow 引擎配方 + 脚本骨架 + 路由细则
│   └── arch-triage/                          # triage — 并行 lane 的系统性问题调查
│       ├── SKILL.md                          # 编排：链路映射、lane 派发、交叉验证
│       └── reference/
│           ├── lane-brief-template.md        # 链路段 lane + 可观测性审计简报骨架
│           └── report-template.md            # 排序根因报告结构
├── session-ledger/                           # 跨 session 变更台账（MCP server + hooks，零依赖 Node）
│   ├── core.mjs                              # 存储、git 对账、冲突检测、PID 绑定
│   ├── hook.mjs                              # SessionStart 简报 + PreToolUse warn-once 提示/记录
│   ├── server.mjs                            # stdio MCP server：start_task / list_active_changes / who_changed
│   ├── smoke-test.sh                         # 一次性临时仓库中的端到端回归
│   └── README.md                             # 设计笔记、存储布局、限制
├── .mcp.json                                 # 注册 session-ledger MCP server
├── hooks/hooks.json                          # 注册 session-ledger hooks
├── NOTICE.md                                 # 第三方署名（Superpowers，MIT）
├── README.md                                 # 中文（默认，本文件）
└── README.en.md                              # English
```

- 每个 **spec** skill 都是自包含的：其 `reference/guideline.md` 就是它所应用的
  方法。两份指南同源（无歧义的行为、带类型的 I/O、枚举的边界情形、可验证的
  完成态），但小型版剥掉了重型机制（抽象层、一致性档位、状态机）——
  体积约为大型版的 1/5。
- **`full-spec/reference/example-symphony-spec.md`** 仅用于校准*质量与形态*——
  其架构选择每次都按需求重新推导，绝不照抄。
- **planning** skill（`writing-plans`、`executing-plans`）移植并改编自
  Superpowers；见[致谢](#致谢)与 `NOTICE.md`。

## 本地安装 / 测试

```bash
# 直接从本目录加载插件（无需 marketplace）：
claude --plugin-dir /Users/guhappen/code/claude_local_plugins_dir/spec-forge

# 会话内编辑后热重载：
/reload-plugins

# spec → plan → execute（产物可内联给出，也可给路径）：
/spec-forge:full-spec       我们需要一个多租户的定时任务服务，要求……
/spec-forge:quick-spec      给 src/http/client.ts 加一个 `parseRetryAfter` 辅助函数
/spec-forge:writing-plans   ./SPEC.md
/spec-forge:executing-plans ./docs/plans/2026-06-06-scheduled-jobs.md
/spec-forge:arch-triage     用户输入后 SSE 经常没有任何响应，日志也看不到异常
```

如果把本目录放进 Claude Code 已扫描的插件路径，插件也会自动发现 `skills/`
目录。

## 致谢

`writing-plans` 与 `executing-plans` 两个 skill **移植并改编自
[Superpowers](https://github.com/obra/superpowers) v5.1.0**（作者
Jesse Vincent），依 MIT 许可使用。它们被命名空间化进本插件、接入
spec → plan → execute 流水线，其仅依赖 Superpowers 的子 skill 改为可选
（带内联回退）。完整署名与 MIT 许可文本见 [`NOTICE.md`](NOTICE.md)。
spec skill 及其指南为原创工作。

## 路线图

- spec + plan + execute + triage 各阶段及 session-ledger 伴生组件均已交付。
  可能的下一步：`arch-triage` 的单点功能性 bug 同胞 skill、用于一键安装的
  `marketplace.json`，以及一个小巧的 `spec-lint` skill，用对应指南的质量清单
  检查一份既有 spec。
