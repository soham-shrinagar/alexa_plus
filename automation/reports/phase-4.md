# Phase 4 — Conversation, MCP, persistence, and reviewed export

## Delivered

Eleven `automation.*` MCP tools share one service with authenticated HTTP endpoints for the workspace UI. Import, restore, inspection, finite preflight/search, trace, repair, review, export, and conversation are owner scoped. The existing Streamable HTTP transport and protocol version 2025-11-25 are retained. This does not establish an Alexa connection by itself.

Gemini selects a validated operation from inspect, preflight, repair, explain, draft, what-if, and clarify. Preflight/repair execute the whole bounded analysis workflow: regression replay, timing search, reduced counterexamples and candidate verification. Findings, summaries, and export eligibility come from the engine. YAML drafts and hypothetical scenarios are validated against the same strict contract; drafts need an explicit reviewed import. Conversation cannot approve, export, install, invent an entity, or replace confirmed expectations. Missing Gemini leaves direct deterministic operations usable. Previous conversation and project facts accompany follow-up requests.

Returning users register/sign in with a username and a password of at least 12 characters. Salted scrypt hashes are persisted; plaintext passwords are never stored. Sessions are one-hour Bearer tokens with the existing audience, issuer and scope checks. Registration defaults off outside demo mode; rate and password-hashing concurrency limits apply. Production account recovery/OIDC remains future work. Keep a stable strong JWT_SECRET when deploying; random demo signing keys expire on server restart, after which users can sign in again with the same account.

Two additive Neon tables store accounts and versioned workspace documents. Owner + revision compare-and-swap prevents lost updates and concurrent approval reuse. A project retains the last five previous source/snapshot/suite versions, up to twelve conversation turns, current runs, analysis and bounded reviews. Reimport increments source version and clears analysis/approvals. At most 20 projects are accepted per account. Memory mode is deliberately ephemeral and reported as such; configured Prisma failures do not silently fall back to memory.

Review rederives a passing candidate and returns before/after YAML. Its ten-minute approval binds owner/project, source hash, canonical project hash, source version, regression suite, exact edit and candidate hash. Explicit export rechecks the repair and all bindings, consumes approval once using revision compare-and-swap, and returns YAML. Replays and source edits invalidate reviews. No physical command or installation API exists.

## Verification completed

Full suite: 120 tests, 118 passed, zero failed, two opt-in database tests skipped by default. The automation Neon test was separately enabled and passed. Syntax check passed for 93 JavaScript files; Prisma schema validation and client generation passed.

- Authenticated MCP initialization, catalog, import, full preflight, patch review, approval/export, and login/session restoration passed over actual HTTP.
- Service tests cover owner isolation, stale versions/revisions, concurrent consumption, missing providers, invalid model operations/entities, unsupported drafts, and source changes during model latency.
- The additive migration `20261014000000_automation_workspace` was applied successfully to the configured Neon database. Existing tables/data were not altered.
- The opt-in Neon integration test passed with separately constructed stores/services, matching returning identity, persisted runs, owner isolation and simultaneous export consumption. Only its generated account/project records were removed in cleanup.
- A live Gemini smoke request with the configured `gemini-3.5-flash-lite` succeeded: preflight selected; one of three regressions failed; 26 timing experiments; one candidate passed verification. Credential values were never logged. This is one live provider check, not a language-understanding benchmark.

## Reproduce

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run test:automation
node apps/mcp-server/scripts/automationLlmSmoke.js
$env:AUTOMATION_NEON_TEST='1'
node --env-file=apps/mcp-server/.env --test apps/mcp-server/test/automation/neon.test.js
Remove-Item Env:AUTOMATION_NEON_TEST
```

For durable storage set REPOSITORY_MODE=prisma and DATABASE_URL. Conversation uses server-side GEMINI_API_KEY. Deterministic analysis needs neither Gemini nor weather/traffic providers. OAuth metadata already exists for MCP; production identity consent and authorized Alexa toolkit testing remain separate deployment work. Phase 5 supplies the integrated UI.
