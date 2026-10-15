# Rehearse — the automation workshop

A conversational debugger and preflight checker for supported Home Assistant automations. Import your rules and expected behavior, replay a failure, verify a scoped repair, and review its YAML before exporting.

The workshop is the primary experience on `new/automation`, at `/` or `/automations`. The original day/journey planner remains at `/dayboard`. Each implementation phase has its own commit and report.

## Start here

The [complete overview](automation/overview.md) explains the idea, end-to-end flow, every engine, tools, real providers, setup, evidence and boundaries. The [final implementation report](automation/reports/final-implementation.md) records delivery and verification. Use the [deployment guide](automation/deployment.md) and [submission pack](automation/submission.md) for the final handoff.

Use Node 22.9+; keep Windows and WSL dependency directories separate.

```powershell
npm ci
npm ci --prefix apps/mcp-server
# Configure apps/mcp-server/.env using .env.example.
npm run prisma:generate
npm run prisma:migrate
npm --prefix apps/mcp-server start
```

Open http://localhost:3000/automations. Create an account, load the guided example, read/confirm its expectations, and import. Run preflight or ask: “Find why motion overrides manual hold and verify a fix without breaking normal behavior.” Follow the causal chain, compare before/after, review the exact patch, then explicitly approve its download.

For persistent accounts/projects use DATABASE_URL and REPOSITORY_MODE=prisma. Gemini conversation uses server-side GEMINI_API_KEY and GEMINI_MODEL. Direct preflight, replay and repair work without Gemini. Memory mode is explicitly temporary. Use a stable private JWT_SECRET for deployment; never commit credentials.

## What works

- Strict bounded YAML import with source lines and atomic unsupported reports.
- Pure event execution: literal state/event triggers, conditions, on/off/brightness, delays, single/restart, cancellation and causal traces.
- Confirmed expectations, explicit normal-output regressions, timing search with visible limits and counterexample reduction.
- One useful repair vocabulary: insert a literal guard before the offending action; verify it on the same searched disturbances and regression suite.
- Returning account login, owner-scoped Neon persistence, source versions and concurrency protection.
- Twelve authenticated automation MCP tools over official SDK Streamable HTTP, protocol 2025-11-25; validated Gemini operation selection.
- The workshop itself is an actual MCP client: initialization, notification, tool discovery and tool calls.
- HTML/CSS/modular-JS workshop: conversation, editor, saved projects, state/causal replay, same-input before/after comparison, patch review/download and independent runtime evidence. Optional voice produces an editable transcript.
- Actual isolated Home Assistant 2024.12.5 observations using virtual helpers, authenticated REST and WebSockets. Actual exported YAML is parsed with HA's YAML semantics and executed in the same testbed.

A passing check covers a finite declared model. Unknown values, pending work and exhausted budgets remain incomplete. Clock/DST triggers, templates, queued/parallel, general repair synthesis, exhaustive cycle proofs and physical-device effects are outside v1. No live-home installation or physical rollback is performed.

## Verification and reports

```powershell
npm test
npm run check
npm run check:release
npm run automation:evaluate
npm run test:automation
npm run prisma:validate
npm run prisma:status
node apps/mcp-server/scripts/automationLlmSmoke.js
```

The provider command is opt-in and consumes a live Gemini request. Default tests skip external database checks. See the [overview](automation/overview.md) for the separately enabled, isolated automation Neon test and actual HA reproduction.

| Phase | Report |
| --- | --- |
| 1: Contract/import and integration feasibility | [Phase 1](automation/reports/phase-1.md) |
| 2: Execution/replay and HA conformance | [Phase 2](automation/reports/phase-2.md) |
| 3: Bounded search and verified repair | [Phase 3](automation/reports/phase-3.md) |
| 4: Conversation/MCP, identity and persistence | [Phase 4](automation/reports/phase-4.md) |
| 5: Integrated workshop and export verification | [Phase 5](automation/reports/phase-5.md) |
| 6A: Real browser MCP client | [Phase 6A](automation/reports/phase-6a.md) |
| 6B: Frozen acceptance set and live LLM comparison | [Phase 6B](automation/reports/phase-6b.md) |
| 6C: Clean-release and HTTPS configuration | [Phase 6C](automation/reports/phase-6c.md) |
| Final architecture, delivery and owner actions | [Final report](automation/reports/final-implementation.md) |

Source modules: `apps/mcp-server/src/automation/`; browser modules: `apps/mcp-server/public/automation/`; fixtures, reports and independent testbed: `automation/`.

## Alexa and submission status

The server and web client use real MCP; the product is a simulated Alexa+ experience. The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs), checked October 16, says toolkit access is unavailable to ordinary entrants and permits a locally runnable repository/demo. Native Alexa linking and the MCP App extension remain future work.

Phase 6 engineering preparation is delivered: the actual browser MCP workflow, frozen synthetic evaluation, live LLM-only comparison, clean-source release checks and submission materials. Final checks passed 130 tests (two external tests skipped) and all 13 acceptance cases. On ten shared synthetic cases the engine matched 10/10 labels and Gemini-only 6/10; see the protocol/raw report rather than treating this as representative accuracy. Owner licensing/access review, human trials, video publication and Devpost submission remain. Licensing was explicitly left pending. Optional production deployment also requires reviewing the four current Prisma-chain high-severity audit entries and configuring stable secrets. Recheck the [official rules](https://amazonappdev2026.devpost.com/rules) before submitting.

The original planner retains Gemini, TomTom, Open-Meteo, calendar export and simulated recovery at `/dayboard`. Its always-on traffic worker/private notification channel remains explicitly deferred. Weather/traffic are not required for automation debugging.

Private root notes (`overview.md`, `integration.md`, `docs/`) and generated captures remain ignored. Public reproducible guides and reports are intentionally tracked under `automation/`.
