# Rehearse Automations — complete product and setup guide

## What we are building

Rehearse is a conversational debugger and preflight checker for a supported subset of Home Assistant automations. A household describes what should happen, imports its rules and selected entity state, and supplies experiments with expected outputs. Rehearse runs those rules, shows the sequence that breaks the expectation, tries a narrowly scoped repair, and checks that normal behavior survives. The owner reviews the exact change before exporting YAML.

The useful differentiator is evidence behind an assistant's recommendation: an executable counterexample, an inspectable causal chain, a repair tested against the same disturbances, and explicit normal-behavior regressions. Natural-language suggestions alone do not establish that an automation works. Winning a competition still depends on a convincing demo, independent evaluation, execution and judging; these five implementation phases do not establish a winning claim.

The demonstration involves motion switching a lamp on, waiting, then switching it off. A separate manual-hold rule turns it on. At 600 virtual milliseconds the delayed motion rule overrides the requested hold. Rehearse inserts a state guard immediately before off and verifies that ordinary motion still completes normally. This is a reference example; imports accept arbitrary combinations of the supported constructs, within declared size and execution limits.

## Where the two ideas live

The `new/automation` branch contains this workshop. The original Rehearse day/journey planner remains accessible at `/dayboard`; its code and existing data are retained. The new workshop opens at `/` and `/automations`. The original main branch is preserved independently. Work was committed and pushed separately after phases 1, 2, 3, 4 and 5. Reports are tracked under `automation/reports/`; private root notes and `docs/` remain ignored.

## End-to-end flow

1. Register a workshop account or sign in again. With Neon configured, identity and projects survive application restarts. Tokens expire after an hour; logging in restores the same owner.
2. Load the guided example, or supply your own Home Assistant YAML and snapshot/tests JSON. Read and confirm the expectations and normal outputs. Import atomically validates every rule. Unsupported constructs reject the complete project with issues.
3. Ask a question such as “Check why manual hold loses to the motion rule and verify a fix.” Gemini chooses a bounded permitted operation. Direct Run preflight is available without an LLM.
4. The engine executes every declared experiment, checks invariant and final expectations, builds replay traces, explores disruption timing, and reduces selected counterexamples.
5. The repair engine proposes a guard only where the declared intent and offending action support it. It replays the same explored experiments and supplied normal-behavior regressions. Unknown evidence, pending work and exhausted budgets prevent a successful verification claim.
6. Follow a finding into causal replay. Step backward/forward or move the slider. Observe entity state at that event and inspect the parent chain and original source line.
7. Replay a verified candidate before and after against identical inputs. The repaired replay is hypothetical until you review its YAML; it does not replace your source project.
8. Review the exact normalized before/after YAML and regression table. Explicitly check approval and download the export. Server-side verification and immutable-source bindings are rechecked; approval expires after ten minutes and is consumed once.
9. Review and manually install the export separately if appropriate. The workshop has no live-home installation or rollback endpoint.

## The engines and their responsibilities

### Contract and import

`apps/mcp-server/src/automation/schema.js` defines version `rehearse-automations/1`: entities, rules, triggers, actions, expectations and scenarios. Zod rejects unknown fields and invalid references. Canonical JSON hashes bind facts, rules and experiments independent of object-key order.

`importYaml.js` parses bounded YAML using HA YAML 1.1 scalar semantics without evaluating code. Quote on/off state literals and boolean-like mapping keys. An explicit YAML 1.2 directive is rejected rather than interpreted differently from the HA testbed. It accepts legacy singular and modern plural HA keys, rejects ambiguous combinations, and retains rule/action source paths and lines. Import is atomic. Normalized export quotes state literals but does not preserve original comments/layout.

Supported entities are input_boolean, binary_sensor, switch and light. Binary sensors are input-only. State values are on/off/unknown/unavailable. Light brightness is 0–255. Supported rules have explicit state triggers with required `to` and optional `from`, or event triggers with flat literal data filters; literal state conditions; sequential on/off actions; constant delays; condition steps; and single/restart mode. Action targets are explicit entity IDs in one matching service domain.

Unsupported: time/clock triggers, DST scheduling, templates/Jinja, aliases/anchors/tags, blueprints, dynamic/group/area targets, `for`, queued/parallel, arbitrary service calls and missing entities. No unsupported rule is silently dropped. Limits: 128 KB YAML, 100 entities, 40 rules, 40 actions/rule, 40 expectations, 12 regression scenarios, 100 input events/scenario, 24-hour virtual horizon, and at most 10,000 interpreter steps. Normal preflight uses smaller declared search budgets.

### Deterministic execution and causal replay

`engine.js` is pure: no Gemini, HTTP, database or device command. Its stable minimum-heap queue orders virtual time and insertion sequence. Both execution steps and queued fan-out are bounded; exhausting either reports incomplete execution. Its virtual clock jumps to timestamped inputs and delayed continuations. State changes trigger rules. Single skips additional triggers while active; restart cancels previous continuation after entry conditions pass. A failed condition step stops remaining actions. Unknown/unavailable targets are not treated as successful writes.

Trace events contain parent IDs, virtual time, rule/run/action IDs, source keys and state changes. The stored initial snapshot supports accurate replay, including scenario-specific initial state. Invariants are evaluated after reactions at a timestamp settle; final expectations at the horizon. That explicit microstep convention is a model assumption, not a physical timing guarantee.

Statuses: VIOLATION means a confirmed expectation failed; NO_VIOLATION_FOUND covers one complete finite experiment; INCONCLUSIVE means evidence or coverage is incomplete; UNASSESSED means no confirmed expectations were supplied. Opposing commands are interactions, requiring intent before they become a bug. Budget exhaustion reports possible feedback without claiming a proven cycle. Full cycle proofs remain future work.

### Search, counterexample reduction and repair

`verification.js` constructs potential read/write dependencies and varies later disruption-event timing at constant-delay boundaries and neighboring milliseconds. The first seed input stays fixed. Two input/rule tie orders are tested. Search defaults to 32 experiments, maximum 64, and exposes truncation. It does not enumerate all snapshots, all joint disruptions, all trigger-relative times, or all possible schedules.

Greedy event deletion reduces a counterexample while preserving the same failed expectation, up to 100 attempts. It does not claim global minimality. Repair currently inserts one literal guard before a causally responsible set action when intent has exactly one `when` clause. More complex or unconditional intent requires manual source changes. There are at most eight candidate edits. No expectation relaxation, complete rule deletion or automatic substitution is permitted. Transparent cost is one inserted guard; this limited vocabulary is not general program synthesis.

Every regression includes independently declared final-state outputs. The same candidate must preserve these outputs, exercise all declared intent across the suite, and leave no violation/substantive uncertainty in all searched experiments. “Expectation not exercised” in one scenario can be covered by another scenario in that same suite; unknown condition values or unfinished work cannot. Passing counts are not probabilities or universal safety guarantees.

### Conversation and orchestration

`service.js` receives a user request and supplies Gemini with current rules, selected entities, confirmed expectations, scenarios and the last six conversation messages. The validated operation can inspect, preflight, repair, explain, draft, simulate a what-if or ask for clarification. Preflight/repair run the deterministic analysis flow in one request. A draft is strictly reimported for validation; a hypothetical scenario cannot invent an entity. The model cannot approve exports, change confirmed intent, install anything or bypass verification. Engine-derived results produce factual summaries. Missing or invalid model output returns an error without fabricating a successful result.

### Persistence, identity and approval

`store.js` has an explicitly ephemeral memory implementation and a Prisma/Neon implementation. Two additive tables, AutomationAccount and AutomationWorkspace, are separate from existing planner tables. The workspace JSON retains the selected model, source/line mapping, suite, version/hash, current analysis, runs, up to twelve conversation turns, last five prior source versions and bounded approval records. Accounts have salted scrypt password hashes. No plaintext password is stored. There is a 20-project limit per account and owner/revision compare-and-swap on saves.

`identity.js` issues scoped one-hour Bearer tokens. `routes.js` applies login attempt and password-hashing concurrency limits. Registration defaults on in demo mode and off in production. Stable returning identity is available today; production OIDC, recovery and revocation are future work. Do not equate local login with production Alexa account linking.

Patch review binds owner, project, source version/hash, canonical project hash, regression suite, candidate hash and exact payload. Export rederives the candidate, rechecks all bindings, and consumes approval with revision compare-and-swap. Concurrent exports cannot both succeed. Source edits and new analysis invalidate previous review. An export is a file; database transactions are not physical-device rollback.

## Tools and interfaces

All automation tools are available through authenticated MCP Streamable HTTP at `/mcp`, protocol 2025-11-25. The workshop UI is an actual MCP client: initialize, initialized notification, tool discovery and tools/call. Its returning-account token authorizes the same owner-scoped operations. The authenticated `/automation/api/<operation>` facade remains available, but the workshop uses MCP. Public fixed examples/evidence and login use ordinary HTTP. Browser findings come from the service.

| Tool | Purpose |
| --- | --- |
| automation.import | Confirmed YAML/snapshot/intent/suite import or version update |
| automation.list / automation.get | Owner-scoped discovery and restoration |
| automation.inspect | Rules, selected entities, scenarios, dependency graph |
| automation.preflight | Regression replay, timing search, reduced failures and verified candidates |
| automation.search | Read-only bounded search |
| automation.trace | Saved replay or causal parent chain |
| automation.repair | Full repair-analysis workflow |
| automation.compare | Read-only before/after replay of one verified candidate |
| automation.review | Rechecked before/after patch and expiring review |
| automation.export | Explicitly approved, source-bound, one-use YAML release |
| automation.respond | Gemini-routed bounded conversation |

The server also retains the original planner tools. Public workshop endpoints serve only the fixed reference example, sanitized reference runtime captures, and this guide. Home Assistant credentials are not accepted in browser input.

## Providers and actual integrations

Gemini is the real language provider and its key stays in the server environment. One live request has been tested successfully; this is not an accuracy benchmark. Neon Postgres is the real persistent store, with additive migrations and an independently enabled reconnection/concurrency test.

The independent HA testbed is actual Home Assistant Core 2024.12.5 on Python 3.12, with disposable virtual input_boolean helpers and authenticated REST/WebSocket communication. It is a historical conformance target, not a production recommendation or blanket compatibility with later releases. Eight semantic/reference cases and six before/after repair cases passed. Phase 5 additionally parses the actual exported YAML using HA's YAML 1.1 semantics and executes all six before/after cases. On/off literals are quoted to preserve strings. The UI shows the captured version/date and distinguishes reference fixtures from your own project. These observations validate software behavior on virtual helpers, not physical devices.

`haClient.js` is a separate server-side read-only adapter for explicitly selected entity states. It requires an HA origin/token supplied by an operator, restricts remote HTTP to HTTPS, blocks redirects and never returns the token. It is implemented and tested but is not configured to a real household or exposed as a public arbitrary-origin proxy. HA REST state snapshots do not automatically reveal all routine definitions; supported YAML is explicitly imported.

Weather (Open-Meteo) and traffic (TomTom) remain used by the original journey planner. They are not needed to validate local automation rules. The previously deferred always-on traffic worker and private notification destination remain deferred; no live monitoring is claimed.

The self-hosted MCP endpoint and browser MCP client are real; the product is a simulated Alexa+ conversational experience. The [official FAQ](https://amazonappdev2026.devpost.com/details/faqs), checked October 16, 2026, states the native toolkit is unavailable to ordinary hackathon entrants and permits local repository judging. Use that supported simulation route. Hosting is optional. Native Alexa account linking and MCP App packaging remain future work; no local MCP test establishes a device connection.

## Setup from a clean checkout

Install Node 22.9+ and clone/check out `new/automation`.

```powershell
npm ci
npm ci --prefix apps/mcp-server
# Copy .env.example into apps/mcp-server/.env and supply actual secrets there.
npm run prisma:generate
npm run prisma:migrate
npm test
npm run check
npm run check:release
npm --prefix apps/mcp-server start
```

Open `http://localhost:3000/automations`. Create an account with a username (3–60 letters/digits/underscore/hyphen, normalized lower-case) and password (12–128 characters). Load the guided example, read the JSON's expectation and expected outputs, confirm and import. Ask for preflight or press Run preflight. Click Follow the causal chain, then Repair review → Replay before & after → Review exact patch → explicitly approve/download.

Server environment:

| Setting | Why it is needed |
| --- | --- |
| DATABASE_URL + REPOSITORY_MODE=prisma | Durable account/project storage; migration adds only the two automation tables |
| GEMINI_API_KEY + GEMINI_MODEL | Natural-language operation selection and validated drafts; direct engine checks work without them |
| JWT_SECRET | Stable strong signing secret for deployment; random demo secrets require login again after restart |
| PUBLIC_URL / PORT / HOST | Correct service origin and bind address; production PUBLIC_URL must be HTTPS |
| AUTH_REQUIRED=true | Owner-scoped requests; retain for deployment |
| AUTOMATION_REGISTRATION_ENABLED | Account creation policy; defaults off outside demo mode, can disable after reviewer accounts exist |
| DEMO_MODE=false / ALLOWED_ORIGINS | Production host/origin and HTTPS configuration |
| OAUTH_CLIENTS_JSON | Authorized OAuth clients for external MCP identity setup; not required for the local workshop |

Do not copy keys into YAML, JSON examples, source, browser storage or Git. Environment files, captures and private notes are ignored. Previously shared API keys should be rotated before deployment. Browser sessionStorage retains the short-lived Bearer token for this tab; server keys never enter the browser. Source/YAML and confirmed intent are stored in the owner's database workspace.

Memory-only local setup: set REPOSITORY_MODE=memory and omit DATABASE_URL. The UI warns that accounts/projects disappear on server restart. It does not silently promise persistence. If configured Neon is unavailable, repair/import operations report an error instead of switching to memory.

## Your own import format

The snapshot JSON has exactly `entities`, `expectations` and `suite`. Each entity supplies a state and optional light brightness. Each expectation has `id`, `description`, `confirmed: true`, `kind` (invariant/final), optional literal `when`, target `entityId`, desired on/off `state`, and optional on-light `maxBrightness`. Each suite entry contains `{scenario, expected}`. A scenario has an ID, optional initial overrides, timestamped state/event inputs, and `until` in virtual milliseconds. `expected` maps known entities to independent on/off final outputs. At least one output is required per regression. See `automation/fixtures/override-debug.json` for a complete readable example.

Confirming intent matters: the debugger cannot know that a difference between two commands is undesirable without an expectation. Include an ordinary run as a regression so a proposed repair cannot “succeed” by preventing useful behavior. Include unavailable/unknown inputs when relevant and treat inconclusive results as evidence that more context or a smaller supported model is needed.

## Reproduce verification

```powershell
npm run test:automation
node apps/mcp-server/scripts/automationCli.js import automation/fixtures/override-debug.yaml automation/fixtures/override-debug.json
node apps/mcp-server/scripts/automationCli.js run automation/fixtures/override-debug.yaml automation/fixtures/override-debug.json
node apps/mcp-server/scripts/automationCli.js search automation/fixtures/override-debug.yaml automation/fixtures/override-debug.json
node apps/mcp-server/scripts/automationCli.js repair automation/fixtures/override-debug.yaml automation/fixtures/override-debug.json
node apps/mcp-server/scripts/automationLlmSmoke.js
$env:AUTOMATION_NEON_TEST='1'
node --env-file=apps/mcp-server/.env --test apps/mcp-server/test/automation/neon.test.js
Remove-Item Env:AUTOMATION_NEON_TEST
```

The opt-in Neon test creates and removes only its own unique test records. Never run the older broad planner integration test on a production database without inspecting its isolation requirements. The default suite skips external database tests. Provider smoke is opt-in and consumes one Gemini request; it logs only sanitized status/model/summary.

For real HA reproduction, follow `automation/testbed/README.md`. Prepare cases with `haCases.js` or `repairEvidence.js --prepare`, execute `testbed/run_ha.py` in an isolated pinned Python environment, then compare with `compareHa.js` or `repairEvidence.js`. Capture only virtual helpers in a disposable loopback runtime. The source has no operator's HA token embedded. Syntax tests alone do not establish runtime conformance; the checked-in sanitized captures are the independent execution evidence.

## Phases and acceptance

1. Contract/import and real HA integration feasibility — strict normalization, line mapping, unsupported reports, read adapter and two observed cases.
2. Execution/replay and conformance — deterministic queue, cancellation, expectations, bounded feedback uncertainty and six independent semantic comparisons.
3. Bounded search and verified guard — timing variation, counterexample reduction, explicit normal-output checks, normalized patch and six actual before/after HA runs.
4. Conversation/MCP/persistence — validated Gemini workflow, returning identity, owner-scoped saved state, versions, stale/concurrent approval protection, live Neon and Gemini checks.
5. Workshop experience — common theme, import/editor, saved projects, conversation, state/causal replay, before/after candidate comparison, patch review, explicit download, optional editable-transcript voice and runtime-evidence view.
6. Evaluation and release preparation — actual browser MCP transport, frozen 13-case synthetic acceptance set, recorded ten-request Gemini-only comparison, configuration/release checks, clean-source installation and complete submission materials. Engineering preparation is complete; human trials, owner licensing/access review, video and final submission remain. The synthetic set is author-written, not a blinded independent benchmark.

## What remains for you and the submission

1. Review licensing or private reviewer access (licensing is explicitly pending by your choice). Test your own realistic supported automations and their independently specified normal outputs; use the prepared worksheet for actual user trials.
2. Use local judging, or optionally choose hosting/domain and follow deployment.md. Configure Neon, stable secrets, registration/origin policy and backups for deployment. Four high-severity npm audit entries remain through Prisma config dependencies; review/remediate through a separately verified dependency upgrade before production deployment.
3. Submit the clearly labeled web simulation and real MCP implementation. The current FAQ says native toolkit access is unavailable to ordinary entrants; no OAuth client is needed for local workshop login. Future native integration needs authorized platform access and finished production identity/consent.
4. Record the end-to-end demo: request → reproducible 600 ms failure → causal chain → same-input repaired replay → normal regression preserved → approved patch export → reference HA evidence. Show limits rather than claiming all homes or all rules are verified.
5. Finish Devpost fields, source/reviewer access, video and required disclosures according to the live rules. Confirm the actual deadline and any track-specific access requirements directly on the competition site.
6. Keep the always-on traffic worker/private notification setup marked remaining if you revisit the original planner; it is not required for this automation MVP. Production HA writes, physical rollback, current-release compatibility testing, broader repair vocabulary, exhaustive search, OAuth identity provider and MCP App support are future scope.

Read [the final implementation report](reports/final-implementation.md) for complete delivery, architecture, flow, verification and owner checklist; [the submission pack](submission.md) for the description/demo/trial materials; and [deployment instructions](deployment.md) for clean installation and optional HTTPS. Phase 1–6 reports and raw evidence are under `automation/reports/`. Final clean-source checks passed 130 tests with zero failures and two external tests skipped; syntax checked 107 JavaScript files. The acceptance corpus passed 13/13; on the shared first ten cases Gemini-only matched 6/10 and the engine 10/10. This small synthetic result is not a representative benchmark. See the raw report and protocol.
