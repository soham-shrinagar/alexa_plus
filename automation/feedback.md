# Developer feedback and friction log

Prepared October 23, 2026 from the implementation and recorded checks in this repository. These observations concern this project and its author-written test cases. They do not represent native Alexa device testing or independent participant research.

## Tools used

The submitted automation workshop uses Node.js, Express, the official Model Context Protocol TypeScript/JavaScript SDK, Zod, `yaml`, Gemini, Prisma and optional Neon/PostgreSQL persistence. An isolated Python/Home Assistant Core 2024.12.5 harness supplies reference observations. The browser uses HTML/CSS/JavaScript and optional Web Speech transcription. Git, npm and GitHub Actions support development and reproducibility; OpenAI Codex assisted implementation, review, tests and documentation.

The retained `/dayboard` additionally uses Open-Meteo and optional TomTom routing. Those providers are not dependencies of the submitted automation debugging flow. No native Alexa SDK, gated Amazon simulator, AWS runtime, Bee device or Ring integration was tested or is claimed.

## What worked

- **MCP:** real initialization, tool discovery and structured results let the browser and service share a validated operation contract. Browser transport tests catch failures that isolated tool calls miss.
- **Gemini:** natural-language requests can select a permitted investigation workflow while execution supplies the findings. Direct checks remain usable without a provider key.
- **Zod and YAML:** schema validation and source mapping make unsupported input explicit and let a trace point back to the responsible action.
- **Prisma and Neon:** additive migrations, returning account identity, saved investigations and conditional updates support durable work and one-use export even across concurrent service instances. The opt-in test cleans its own records.
- **Home Assistant:** virtual helpers allow independent execution without physical hardware. Testing the actual exported YAML caught a serialization mismatch.
- **Node/Express and browser APIs:** a local workflow needs no build pipeline, paid hardware or provider account. Voice transcription stays editable and needs explicit submission.
- **Git/npm/GitHub Actions:** two lockfiles, clean installation and the same offline release gate in CI make the evaluation reproducible. Codex assisted source inspection and test development; checked outputs and runtime evidence remain the basis for claims.
- **Retained planner providers:** Open-Meteo supplies weather without a key; TomTom supplies optional route estimates. They remain separate from the automation evidence.

## Friction 1 — discovering the permitted Alexa development route

**Task:** identify how an entrant can demonstrate an Alexa+ integration.

**Steps:** read the competition requirements and Alexa documentation, then compare individual setup guides with the competition FAQ.

**Expected:** required access restrictions would be visible before following native-tool setup instructions.

**Observed:** the official FAQ explains that native add-on tools are gated and ordinary entrants cannot obtain them. Some individual guides omit that restriction. This was documentation/access friction; no failed native installation or account-linking test is claimed.

**Severity:** Important.

**Workaround:** implement the permitted web simulation with a real Streamable HTTP MCP server; label the experience in the UI and README.

**Suggestion:** put preview-access requirements and the supported self-hosted simulation route beside each setup entry point, with a minimal browser client example.

**Reference:** [competition FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## Friction 2 — MCP client lifecycle

**Task:** make the actual browser operate the authenticated MCP service reliably.

**Steps:** implement initialization, the initialized notification, discovery and tool invocation; exercise session expiration and ambiguous transport failures in browser-client tests.

**Expected:** successful server tool tests would be sufficient to integrate a small browser client.

**Observed:** the browser additionally needs protocol negotiation, session headers, expiry handling and careful treatment of failed writes. A request can finish server-side even when the browser never receives its result.

**Severity:** Important.

**Workaround:** use the explicit lifecycle in `apps/mcp-server/public/automation/mcp.js`. Retry only the server's pre-dispatch invalid-session rejection; do not automatically retry an ambiguous tool submission. Preserve editor text and direct the user to restore the project.

**Suggestion:** provide an authenticated browser example covering lifecycle, expiry, origin policy and ambiguous write outcomes alongside basic MCP examples.

## Friction 3 — model output versus executed evidence

**Task:** diagnose delayed interactions using conversation.

**Steps:** compare engine and Gemini-only labels on the same ten author-written cases; retain raw responses in `reports/phase-6-evaluation.json`.

**Expected:** the model would recognize delayed overrides and distinguish incomplete evidence from a pass.

**Observed:** this historical sample recorded engine 10/10 and Gemini-only 6/10. It is a small, author-written comparison, not a representative accuracy benchmark.

**Severity:** Important for this workflow.

**Workaround:** restrict Gemini to validated operation selection/drafts; use the deterministic engine for findings, show uncertainty and require review before export.

**Suggestion:** include examples of tool-grounded debugging that separate a hypothesis from a completed check and preserve an explicit inconclusive result.

## Friction 4 — Home Assistant YAML scalar behavior

**Task:** execute the exported repair in an independent Home Assistant instance.

**Steps:** export the actual candidate YAML, load it in the isolated HA 2024.12.5 testbed and replay virtual-helper events.

**Expected:** a YAML file that round-tripped through the JavaScript parser would preserve state strings in HA.

**Observed:** unquoted `on`/`off` scalars needed different treatment for the HA loader. In-memory model checks alone did not establish correct export behavior.

**Severity:** Important.

**Workaround:** quote state strings in exported HA YAML; parse and execute the exact output artifact. Recorded export evidence is in `reports/phase-5-ha-export.json`.

**Suggestion:** include explicit scalar-serialization compatibility examples in automation-export tooling and test the generated file in the target runtime.

## Friction 5 — persistence startup connection budget

**Task:** restore workspaces against configured Neon persistence.

**Steps:** run the isolated account/workspace/export test; check connectivity after a timeout; rerun with a longer bounded connection timeout.

**Expected:** the default connection budget would be sufficient for a reachable database.

**Observed:** an initial connection timed out despite working DNS/TCP. A 20-second setting allowed the test to complete.

**Severity:** Important.

**Workaround:** add `connect_timeout=20` for Neon URLs only when the operator did not supply a value. Preserve explicit settings, never replay a failed write, and generate Prisma clients/apply migrations as documented.

**Suggestion:** surface connection-budget configuration in first-run guidance and distinguish connection availability from migration/client-generation errors.

## Further feedback

Browser speech recognition is optional and browser-dependent; its transcription quality has not been evaluated. The original planner's Open-Meteo/TomTom paths are separate from the workshop; no current field-accuracy study or provider-wide reliability claim is made. For npm dependencies, audit both package roots: the October 23 check found and updated transitive `ip-address` 10.7.3 to 10.7.4, then reran the release gate.

We would reuse MCP, Gemini with validated tools, and Prisma/Neon for this architecture. We would retain independent Home Assistant execution. Any decision to adopt native Alexa tooling depends on obtaining access and evaluating it directly. Personal onboarding impressions and future tool preferences should be reviewed by the submitter before pasting into the competition form.
