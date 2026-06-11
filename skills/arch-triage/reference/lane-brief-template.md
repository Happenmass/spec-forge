# Lane Brief Templates

How to write the prompt for each investigation subagent ("lane"). Write briefs
in the language the user is working in — lane output flows into a report the
user will read. Every brief follows the same skeleton; what separates a deep
lane from a shallow grep is the **named suspects** block, which carries your
Phase-0 recon into the lane. A lane that starts from "here are the 5 classes
and 2 configs most likely involved, and a known-issues doc to cross-check"
produces evidence; a lane that starts from "look around the queue layer"
produces vibes.

Why the output contract is rigid: four lanes report back to one orchestrator.
Forced numbering, forced `file:line` evidence, forced why-silent, and forced
high/med/low likelihood are what make the four reports mergeable into a single
ranking. The "your final message is the deliverable" line matters because a
subagent's last message returns raw to the orchestrator — pleasantries and
hedging are pure loss.

---

## Segment-lane template

```text
You are a READ-ONLY code analysis agent (do not modify any files).
Project root: {ABSOLUTE_PROJECT_ROOT}. {ONE_LINE_STACK_AND_DEPLOYMENT_SHAPE —
e.g. "Spring Boot conversational agent, multi-instance, Redis queue +
distributed lock".}

Symptom: **{EXACT_SYMPTOM, including the negative evidence — e.g. "after user
input, the SSE stream emits no events at all, and logs show no obvious
errors"}**.

Your task: analyze the「{SEGMENT_NAME — e.g. "entry layer → event queue →
drain"}」segment ONLY, and exhaustively enumerate every code path in it that
could cause {SYMPTOM_CLASS — e.g. "a request to be accepted (200/accepted
returned) yet never processed"} **silently**.

Key analysis targets (use Glob/Grep to locate the actual files):
1. {NAMED_SUSPECT — class/file + the specific doubt, e.g. "RedisSessionEventQueue:
   what happens when the queue is full (max-size=10) — reject, drop, or
   silent? is the return value checked by callers?"}
2. {NAMED_SUSPECT — e.g. "distributed lock lifecycle: Lua acquire/release/renew;
   the lock held by a dead pod; whether the 30s TTL expires on every path"}
3. {NAMED_SUSPECT — e.g. "drain thread: where is it started, what happens on an
   uncaught exception, what happens when deserialization fails after LPOP"}
4. {…3–7 entries. Each names a concrete artifact AND the specific failure
   doubt to chase — not just a class name.}

{IF_A_KNOWN_ISSUES_DOC_EXISTS — non-optional when one does:}
You MUST also read {DOC_PATH — e.g. "docs/p0-concurrency-hang-fixes-spec.md"}.
It records known issues of this class. Audit item by item whether each
documented fix has actually landed in the current code (cite file:line as
proof) and which have not.

Output format (your final message IS the deliverable — raw conclusions, no
pleasantries):

## Silent-failure mode list
For each one:
- number + one-line description
- trigger condition
- evidence: file:line (relative path) + a minimal key code snippet
- why current logs show nothing for this path (missing log / swallowed
  exception / wrong level)
- likelihood high/med/low + reasoning

{IF_KNOWN_ISSUES_DOC:}
## Known-issues doc audit
Item by item: documented problem → landed or not (evidence)

## Recommended log additions for this segment
Concrete to class.method: suggested level and message content (must include
the correlation id — {CORRELATION_ID, e.g. sessionId} — and the key variables:
queue length, lock owner, etc.)

## Runtime diagnostic commands
{IF_APPLICABLE} A few copy-pasteable commands (redis-cli / curl / jstack /
SQL…) that let an operator determine, at the next live occurrence, exactly
where in this segment the data is stuck — use the real key/endpoint formats
from the code.
```

### Adapting the skeleton per lane

- **{SYMPTOM_CLASS} is per-lane, not global.** Translate the user-visible
  symptom into what it means *for this segment*: the entry/queue lane hunts
  "accepted but never processed"; the processing-loop lane hunts "loop hangs or
  terminates without emitting"; the delivery lane hunts "event produced but
  never received". Same symptom, three different prey.
- **The opus lane** (densest concurrency/state logic, or your #1 suspicion)
  deserves the most detailed suspects block — list the exact methods, the
  async/callback paths, the timeout configs with their default values, and any
  "is this config actually honored?" doubts.
- **Boundary overlap is fine.** If two lanes both look at the lock handoff,
  good — races live at boundaries. Dedupe at synthesis.

---

## Observability-audit lane template

This lane is cross-cutting: it walks the *whole* chain, but its prey is the
blind spots, not the bug. Its output doubles as the instrumentation plan when
no root cause is provable from code alone.

```text
You are a READ-ONLY code analysis agent (do not modify any files).
Project root: {ABSOLUTE_PROJECT_ROOT}. {ONE_LINE_STACK}.

Symptom: **{EXACT_SYMPTOM}** — and crucially, logs show no obvious errors,
which means the critical path has logging blind spots.

Your task: audit existing log coverage across the entire request chain, find
the blind spots, and produce a directly implementable logging supplement list.

Chain stages (audit each in order):
1. {STAGE → e.g. "entry endpoints receive request → submit to queue"}
2. {STAGE}
3. {…every hop from the Phase-0 chain, in order}

Method:
- Grep each listed class for log.info/debug/warn/error; per stage record: what
  is logged, at what level, and whether it carries {CORRELATION_ID}
- Check the logging config ({LOGGING_CONFIG_PATH — logback-spring.xml /
  log4j2.xml / logging setup}): which packages are at which level; how MDC /
  correlation ids are injected — and whether MDC survives thread handoffs
  (worker pools, async callbacks, message-listener threads — the classic blind
  spot); any log filters that might be suppressing the very evidence we need
- Check existing observability bridges ({METRICS_OR_TRACING, if any}) for
  which events they already cover
- Grep catch blocks for swallowed exceptions: caught then only log.debug'd or
  dropped entirely

Output format (final message IS the deliverable):

## Per-stage log coverage table
| Stage | Class/method | Existing logs | Level | Has {CORRELATION_ID}? | Blind spot |

## Swallowed-exception list
file:line + what gets swallowed

## MDC / correlation-id propagation gaps
Exactly which thread handoff points lose the id (pool name, code location)

## Recommended log additions (priority-ordered)
Each: class.method + level + message template (which variables) + which blind
spot it closes. Specific enough to write the code directly from.
```

---

## Worked example (condensed)

From a real triage of "after input, SSE emits nothing and logs are clean" in a
Spring Boot multi-instance agent. Chain: API submit → Redis queue/distributed
lock → drain → orchestrator loop → LLM streaming → event listeners → Redis
Pub/Sub → SSE delivery. Four lanes were dispatched in one message:

| Lane | Model | Mission (symptom class for the segment) |
| --- | --- | --- |
| Orchestrator loop + LLM streaming + async tool callbacks | opus | loop hangs or terminates silently, emitting nothing |
| Entry → queue → drain (+ idempotency, lock lifecycle) | sonnet | accepted (200) but never processed |
| Event listeners → Pub/Sub → SSE subscriber/emitter | sonnet | event produced but client never receives it |
| Whole-chain log coverage audit | sonnet | blind spots: where could the above hide without a log line |

Notable mechanics that paid off:
- The opus brief ordered a line-item audit of `docs/p0-concurrency-hang-fixes-spec.md`
  ("are the documented fixes actually in the code? cite file:line") — the audit
  found none had landed, which became the head suspect.
- The queue-lane brief asked for ready-to-run `redis-cli` commands keyed to the
  real key formats, so an operator could localize the stall at the next live
  occurrence.
- After results returned, the orchestrator personally re-verified the two
  headline claims (a `JsonNull` deserialization crash silently eating queued
  messages; the Pub/Sub subscription being created per-connection, losing
  events published before subscribe) with targeted greps before reporting.
