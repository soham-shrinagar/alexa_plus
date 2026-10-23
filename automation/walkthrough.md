# What we built: Rehearse

## The short explanation

Rehearse is a debugging workshop for Home Assistant automations. It helps someone answer: “Why did my smart-home rules do that, and does this proposed change fix the problem without breaking ordinary behavior?”

The user brings supported automation YAML, a selected snapshot of entity states, an explicit intention and test scenarios with expected outputs. Rehearse runs those scenarios, shows the action that violated the intention, explores nearby event timings and checks a small repair. The user can compare the same inputs before and after, inspect the exact YAML change and approve a download.

Its conversational interface simulates an Alexa+ experience in a browser. The MCP server and tool calls are real. It is not currently connected to an Echo account and does not install or execute changes in a physical home.

## The problem in one concrete example

There are two rules:

1. Motion turns the lamp on, waits 600 milliseconds, then turns it off.
2. Enabling manual hold turns the lamp on because the user wants it kept on.

Either rule makes sense alone. Together, their timing causes a problem:

| Virtual time | Input or action | Result |
| --- | --- | --- |
| 0 ms | Motion becomes on | Motion rule turns the lamp on and schedules its delayed off action |
| 250 ms | Manual hold becomes on | Hold rule turns/keeps the lamp on |
| 600 ms | Old motion timer resumes | Lamp turns off even though hold is still on |

The confirmed intention says that hold-on must mean lamp-on. Rehearse catches the violation at 600 virtual milliseconds, records the chain of events and maps the action back to its source.

The repair adds a literal state condition immediately before the delayed off action: proceed only while hold is off. Checking at the start would miss a hold enabled during the delay. Rehearse then checks the failure again and also checks normal motion completion and hold enabled after completion.

The 600 ms interval is a compact virtual demonstration; the office and bathroom fixtures use longer realistic timers. The engine does not wait that long on a physical clock.

## What the user actually does

### 1. Start a workspace

The app is at `/automations`. A local account scopes projects to an owner. With no environment file it uses temporary memory, so the user can evaluate the core workflow without a key, database or hardware. With configured Prisma/Neon persistence, returning users can restore saved projects and investigations.

### 2. Import and confirm intent

The user loads the guided example or selects YAML and its JSON snapshot. They review selected states, expectations and independently specified scenario outputs, then explicitly confirm and import. Editing the input clears confirmation.

The importer accepts a documented subset. It rejects unsupported syntax atomically rather than executing only the parts it happens to understand. Accepted YAML is normalized into an internal rule model with source locations.

### 3. Ask a question or run preflight

The direct Run preflight control always works without Gemini. If Gemini is configured, a request such as “Run preflight and check why motion overrides manual hold” goes through `automation.respond`. Gemini chooses an allowed operation; it does not supply the final verification result or approve export.

### 4. Execute the investigation

The deterministic engine processes triggers, conditions, state writes and delayed continuations on a virtual clock. It supports `single` and `restart`, so retrigger behavior is explicit. Each action has a trace entry and causal parent.

Preflight combines regression execution, bounded timing search and eligible guard proposals. The guided example reports one failed regression out of three, 26 timing experiments and one eligible repair. Those counts describe this fixture; other projects can differ.

### 5. Explain the cause

The Investigation view presents a confirmed failure. Replay follows the causal chain to the responsible action and source. A dependency edge alone is not treated as proof of a conflict; the evidence is an executed scenario that violates the declared intention/output.

### 6. Compare the candidate

Repair proposes a narrowly scoped literal guard. The same inputs are rerun against the original and candidate model. Ordinary outputs must still hold, and the candidate is rechecked against the explored disturbances. An incomplete or truncated search cannot authorize export.

### 7. Review and download

The user reviews exact normalized YAML and regression evidence. Review creates an expiring record bound to the owner, project, source version, tests and candidate. Explicit approval consumes that record once. Reuse, expiry, stale source or competing consumption cannot silently release another patch.

Downloading YAML is the end of the implemented change workflow. Installation and a separate household review remain the owner's decision.

## How the components fit together

```text
Browser: import, conversation, investigation, replay, repair, review
    |
    | authenticated MCP Streamable HTTP, spec 2025-11-25
    | initialize -> initialized -> tools/list -> tools/call
    v
Express + MCP SDK + validated automation service
    |
    +-- YAML/Zod contract and source mapping
    +-- deterministic event engine and causal trace
    +-- regression checks and finite timing experiments
    +-- scoped guard candidates and same-input comparison
    +-- exact review, approval binding and one-use export
    |
    +-- memory store OR Prisma/Neon persistence
    +-- optional Gemini operation selection/drafts
```

Ordinary HTTP serves login, the fixed example and supporting guides/evidence. The investigation workflow actually uses MCP. The twelve automation tools are import, list, get, inspect, preflight, search, repair, trace, compare, review, export and respond, each under the `automation.` namespace.

Gemini receives the relevant request and validated project context when conversation is used. Its key stays on the server. Source, confirmed intent, expected outputs and engine results remain explicit rather than hidden in a prompt.

## What makes the contribution useful

The contribution is the complete investigation and review workflow around a proposed change: a reproducible failure, causal explanation, ordinary-behavior checks, visible uncertainty and an exact approved artifact. It lets someone inspect why a repair is being proposed and what the passing result actually covers.

The app combines conversation with deterministic tools. It can also demonstrate the core reasoning without a model key, which makes reviewer reproduction practical.

## Evidence and its limits

The final offline suite has 144 tests: 142 pass, none fail and two optional database tests skip. The frozen synthetic acceptance corpus passes 13/13 and six historical HA semantic cases match. Representative office, fan and porch fixtures use the actual browser MCP client to check diagnosis, comparison, export and reimport.

Separate October 23 checks passed for the configured Gemini workflow and isolated Neon identity/persistence/concurrent export. Historical isolated Home Assistant Core 2024.12.5 captures include actual export execution with virtual helpers. The offline gate compares those saved observations; it does not launch HA anew.

No independent human trial or physical-household study has been conducted. The historical ten-case engine-versus-model comparison is small and author-written; it is not a general accuracy score. Do not use “100% accurate,” “all conflicts found” or “guaranteed safe.”

## Supported scope

State/event triggers, flat literal event filters, literal state conditions, sequential on/off/light-brightness actions, constant delays, and single/restart execution are supported. Entity domains are input_boolean, binary_sensor, switch and light; binary sensors are input-only.

Templates, clock/DST triggers, blueprints, dynamic/group/area targets, queued/parallel execution, `for` and arbitrary services are rejected. The repair vocabulary is one literal guard. Experiments are finite, with explicit budgets; unknown state and pending work remain visible. Export normalizes YAML and does not preserve comments/layout.

## The older planner

The repository began with a day/journey planner and later added the automation workshop. The older planner remains at `/dayboard`, with its separate scheduling/weather/routing workflows. For this submission, keep the explanation and video centered on `/automations`; showing both products would spend limited video time on two different stories.

## A natural 30-second explanation

“We built Rehearse to debug interactions between smart-home rules. You import your Home Assistant automations and confirm what you expect to happen. Rehearse runs scenarios on a virtual clock, shows the action that broke that intention, and tests a small repair while checking normal behavior too. You compare the same inputs before and after, review the exact YAML, and approve a download. The browser simulates an Alexa+ conversation, and a real MCP server runs the investigation.”
