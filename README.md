# Rehearse

## Plan with evidence. Rehearse the unexpected. Keep the final say.

Rehearse turns natural-language outcomes into inspectable, verified plans. Gemini extracts tasks and selects tools; deterministic code grounds travel in TomTom routing and Open-Meteo forecasts, checks constraints, and requires human approval before a **simulated** runtime starts.

The dayboard is one coherent workspace: Plan, Rehearse, Saved plans, Household and Connections. Start from a blank personal context, plan a single arrival-deadline journey with preparation tasks, ask for a forecast, or describe a household routine using declared people/devices. Examples are optional contexts, not a three-scenario limit. A labelled offline household benchmark lives in Rehearse.

**Real:** Gemini, address search, traffic-aware route estimates, weather, MCP, Neon persistence, downloadable iCalendar.
**Simulated:** Alexa conversation, device effects, runtime disruptions/recovery.
**Not implemented:** an Echo connection, background monitoring, automatic calendar updates, actual Alexa reminders, production account login/consent/refresh tokens.

## Quick start

Use Node.js 22.9+ and npm in PowerShell for this Windows checkout. Do not share node_modules between Windows and WSL. Stop the server before installing dependencies or generating Prisma.

```powershell
npm run setup
# Edit apps/mcp-server/.env using .env.example as a reference.
npm start --prefix apps/mcp-server
```

Setup installs root/server dependencies, generates Prisma and runs offline checks; it does not reset/migrate the database. Open [the dayboard](http://localhost:3000/). The legacy /lab.html URL redirects to the same workspace.

The server reads apps/mcp-server/.env:

```dotenv
GEMINI_API_KEY=<your-key>
GEMINI_MODEL=gemini-3.5-flash-lite
TOMTOM_API_KEY=<your-key>
# Optional persistence:
DATABASE_URL=<your-Neon-PostgreSQL-connection-string>
DEMO_MODE=true
PUBLIC_URL=http://localhost:3000
```

Never commit keys. The model must be available to your account. With DATABASE_URL, Prisma is selected automatically; without it, memory is used. REPOSITORY_MODE=memory explicitly overrides persistence. For a new database, run `npm run prisma:generate`, `npm run prisma:migrate`, then `npm run prisma:status`. Migrations are additive; never use reset against your database.

The browser obtains a 30-minute demo identity and sends real MCP initialize, tools/list and tools/call requests. The token, selected plan and form context are kept in sessionStorage; reload restores the selected owned plan while the token is valid. Saved plans and audit are owner-scoped. This is not returning-user authentication: expiry creates a new identity; a restart without a stable private JWT_SECRET also invalidates tokens. Memory storage disappears on restart; Neon records persist but this demo has no returning-user login.

## Try the main experience

1. Search a public starting address and destination, then select the correct results. A matching name alone is not proof of the intended place.
2. Choose a future date within six days and the route's local timezone. Drive, walk and cycle are supported; transit is not.
3. Ask: “Reach the selected destination by 10am on the selected date. Check traffic and weather. Allow 20 minutes to get ready and 10 more to pack my laptop. Plan a reminder.”
4. Inspect the inferred tasks, departure time, preparation, provider evidence and buffers. The model can misunderstand; review before approval.
5. Rehearse +15 minutes of traffic. The original proposal remains unchanged. A failed branch explains why earlier departure conflicts with readiness.
6. Compare concrete choices: start preparation earlier while preserving the deadline and buffers, or explicitly accept a later arrival deadline while keeping the preparation window. Earliest-start policies can block an option. Choose a feasible alternative and review it; saving does not activate it.
7. Separately approve the virtual runtime. Inject a synthetic delay, observe suspension if unsafe, then compare recovery choices. The paused source remains unchanged until a fresh approval transactionally restores/stops it and activates the replacement. Alternatively restore baseline conditions, or stop the simulation.
8. Download the calendar reminder and import it into your calendar. Check that alerts are enabled. Export alone does not deliver an alert or create an Alexa reminder; replace imported events yourself after replanning.

For non-travel planning, try “Read for 30 minutes starting at 18:00, then pack a bag for 20 minutes; finish both by 19:00.” No location or weather request is needed. Use Household to save people, devices, capabilities, earliest-start/power/quiet policies using the form or advanced JSON. Unknown actions remain manual tasks or require clarification. Existing proposals retain their snapshots.

Rehearsal is counterfactual, not a provider refresh. Accepted alternatives retain original evidence timestamps and still expire for approval after 15 minutes. Changing the source runtime invalidates old recovery choices. If recovery evidence has expired, stop its source and build a fresh plan; refreshing must not silently remove its replacement binding.

### Calculation and limits

Departure = arrival deadline − estimated route duration − explicit extra contingency − safety buffer − applicable rain buffer.
Preparation starts before departure; the calendar reminder precedes preparation by the chosen lead time.

Route duration **already includes traffic**. Future routing is predictive/historical, not a live view of tomorrow. Weather buffers are user-adjustable policy, not a provider-measured rain delay. Forecasts are sampled at relevant hours, not across every road segment.

One journey, one day and one timezone per proposal. Cross-day preparation, past reminders, DST ambiguity, cross-timezone routes, unavailable forecasts and unsupported durations fail closed. Multi-stop optimization, public transit, appliance-plus-journey scheduling across several people and recurring calendar management are future work. The constraint engine verifies implemented rules, not universal real-world safety.

## Free-tier providers

- [Open-Meteo](https://open-meteo.com/en/pricing): keyless non-commercial forecasts, attribution and usage limits. Commercial usage requires appropriate terms.
- [TomTom](https://docs.tomtom.com/pricing): account/key with Geocoding and Routing access. Published free allowances currently include 20K monthly requests for each; verify your account's quota and billing settings. This app does not enroll you in a paid plan.
- Gemini: use an account/model with available quota; no guarantee that every model/account is free. The key stays server-side.

Provider endpoints are fixed, errors are sanitized, requests time out, and responses are bounded. A five-minute cache retains original timestamps. Live approval rejects evidence older than 15 minutes. Recalculation creates a new journey proposal; it does not alter an approved version or a downloaded calendar file. No silent fixture fallback.

## Verify

```powershell
npm test
npm run check
npm run prisma:validate
npm run prisma:status
npm run check:alexa
```

Offline tests cover model validation, routing arithmetic, DST/calendar safety, ownership, approval races, rollback, real HTTP MCP contracts and provider failure. The Neon test is opt-in:

Current verification: 93 offline tests pass, zero fail, one optional Neon test skips by default; the separately enabled Neon integration passed. Syntax checks cover 71 JavaScript files. Microphone capture/voice quality still needs a manual permitted-browser test. Traffic monitoring is explicitly deferred; no scheduled checks or notification delivery are active.

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

Use an isolated Neon branch for this test. It creates synthetic records and cleans up its own IDs.
`npm run smoke:providers` is an opt-in live Gemini/weather household test that consumes quota.
`npm run smoke:journey` verifies the new Gemini/TomTom/weather journey flow, what-if branch and calendar generation over MCP using public test locations and memory storage.
`npm run check:alexa -- https://your-server.example` is a read-only readiness report, **not** certification or connection.

## Architecture and MCP

Express + official MCP SDK + Zod, modular browser JavaScript and shared dayboard CSS, Prisma/PostgreSQL. There are 27 authenticated tools:

| Area                  | Tools                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Intent and grounding  | planner.respond, place.search, journey.plan, weather.get_forecast, travel.get_estimate                                            |
| Context               | household.list_profiles, household.configure, home.list_capabilities, household.get_constraints                                   |
| Household planning    | assistant.respond (legacy conversational lifecycle), routine.compile, routine.repair, routine.revise, routine.refresh_environment |
| Verification/delivery | simulation.run, simulation.what_if, reminder.export                                                                               |
| Rehearsal/history     | rehearsal.compare, rehearsal.compare_set, rehearsal.adopt, routine.list                                                           |
| Lifecycle             | routine.request_activation, routine.activate, routine.get_status, routine.inject_event, routine.rollback, audit.get_trace         |

planner.respond gives Gemini validated, bounded tool selection and extraction. The server executes the selected workflow through the same service/provider implementations exposed as tools. This is constrained orchestration, not an unrestricted autonomous agent loop. Calls inside journey.plan are service calls, not separate network MCP round-trips; the UI distinguishes these execution steps from browser MCP activity.
MCP defaults use personal-day, Gemini planning and no unsolicited external data call. Weather-dependent requests fetch weather when selected. The offline school flow requires mode=fixture and scenarioId=school-morning; routine.revise automatically chooses the stored proposal's planner unless a mode is explicit.

Source map (under apps/mcp-server): src/domain contains pure schedule/constraint/rehearsal logic; src/services orchestrates planning, explicit choices and approvals; src/providers wraps external APIs; src/tools defines MCP contracts; src/repositories stores state. public/workspace splits browser orchestration, state, views, household editing and DOM helpers; public/workspace.css is the shared theme. public/mcpClient.js implements the transport; public/approvalDialog.js isolates approval/cancellation.

Rehearsal adoption recomputes an option server-side and binds source version/runtime state. Recovery activation restores the previous virtual snapshot and creates its replacement in one transaction; failed persistence restores the old runtime and unconsumed approval. The verifier checks declared implemented rules, not universal safety. Repeated runtime delay reports are totals relative to the approved plan, not additive events. No wall-clock execution or polling runs in the background.

## Alexa+ status and submission

### Advanced rehearsal

The Plan view is conversation-first: editable text/voice transcripts, opt-in browser speech synthesis, compact plan and contextual alternatives. Say “what if traffic is 15 minutes worse?”, “what if it rains?”, “choose the second option”, “show me the details” or “cancel”. Ambiguous/unknown edits ask for clarification; new outcomes use “new plan: …”. Selecting a choice never activates it. Recognition varies by browser and may use the browser vendor's speech service; permission is requested only on a microphone click. Text works without voice support. Full technical facts remain in Plan details.

Combine up to six typed hypothetical events: travel delay, rain, capability failures and extra time for specific manual/preparation tasks. Conflicts include deterministic expected/observed facts. Every alternative is independently checked and remains inert until separate approval. Evidence summaries distinguish verification, freshness, minimum-input completeness and uncalibrated uncertainty; stale/incomplete live evidence cannot authorize activation or calendar export.

`rehearsal.compare_set` checks up to eight scenarios and three fixed candidates. Optional candidates come from an explicitly supplied seed scenario. Its shocks are **additional beyond each candidate's retained allowances**; safety buffers are not silently consumed. Counts are not success probabilities. A one-second evaluation budget is checked between synchronous runs, not a preemptive real-time guarantee.

Owner-scoped `/metrics` separates Gemini, provider, journey/verification and database spans. Browser tool traces report round-trip latency. Spans are inclusive and overlap; do not add them. Percentiles require 20 samples. Run `node scripts/benchmark.js` for 30 offline in-memory MCP comparisons, not an Alexa/live-provider benchmark. Optional consent-based preference persistence is deferred.

The [competition FAQ](https://amazonappdev2026.devpost.com/details/faqs) accepts a browser that actually uses MCP Streamable HTTP as a simulated Alexa+ experience; local reproducibility plus a video is sufficient. Amazon's [developer home](https://developer.amazon.com/docs/alexaplus/add-ons/home.html) limits MCP Toolkit access to selected partners. Do not describe this repository as already connected to Alexa.

The [MCP Toolkit quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) is the eventual onboarding path, but remote HTTPS alone is insufficient. Remaining engineering includes customer sign-in/consent, durable refresh tokens and latency work. The documented sub-500ms target is not met by synchronous Gemini/provider workflows. A future Alexa client can orchestrate granular tools directly; asynchronous preparation/caching still needs measurement.

OAuth discovery, registered-client credentials, resource binding, scope separation and PKCE exist. Production consent is deliberately not faked. Standard MCP challenges are default; ALEXA_AUTH_COMPATIBILITY=true opts into the preview's no-WWW-Authenticate behavior while still returning 401.

Before submission: record the actual working app; disclose simulation boundaries; supply accessible GitHub source and a license/private reviewer access as applicable; include setup, a public video under three minutes, and truthful product feedback. Recheck the [official rules](https://amazonappdev2026.devpost.com/rules) before submitting.

No deployment or GitHub push is performed by setup. Local owner notes (overview.md, integration.md and docs/) are intentionally ignored by Git. **This README is self-contained for reviewers.**
