# Testing and verification

## Offline regression suite

`npm test` makes no live Gemini/weather calls and skips the database integration suite unless explicitly enabled.

- Domain: clock parsing, micro-twin selection, power/quiet/deadline conflicts, timing, repair, explicit weekday permissions, delay idempotency, weather adaptation.
- Lifecycle: exact-version approval, ownership, concurrency/idempotency, failed-write rollback, immutable active proposals, suspension, recovery, and snapshot restoration.
- Planner: grounded entities/capabilities, protected household floors, extracted-task mappings, dependency cycles, explicit permission, clarification without persistence, assistant activation refusal, non-school routines.
- Providers: valid/invalid weather, cache expiry, missing forecasts, malformed JSON, optional traffic, sanitized failures, and Gemini credentials confined to server request headers.
- MCP/security: initialize/list/call, authenticated ownership/scope, origin/host guard, input validation, static UI, OAuth PKCE, and provider configuration.
- Approval dialog: cancel/confirm/Escape cannot reuse a previous confirmation.

```powershell
npm test
npm run check
npm run prisma:validate
npm run prisma:status
```

## Live provider smoke (opt-in)

```powershell
npm run smoke:providers
```

Requires a configured Gemini key. Makes real Gemini and Open-Meteo requests through MCP, consumes quota, uses a temporary memory repository, and never activates devices or writes Neon. Tests task extraction, assistant-selected simulation, timing repair, and a Gemini revision. A deliberately conflicting work goal should yield findings, not a forced initial passing result. Model wording/grouping may vary; do not assert exact prose.

## Neon integration (opt-in)

Use an isolated disposable branch for routine runs:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

The suite creates random synthetic user IDs, tests real MCP persistence and isolation/concurrency, reconnects Prisma, then deletes only those exact test identities and their cascaded records. It does not reset the schema or delete existing users. Household profiles reuse the existing UserPreference table; no new migration is required.

## Browser checks

1. Select Work commute, Gemini, live weather; submit the provided concrete request.
2. Inspect actual extracted tasks, selected tools, forecast timestamp/attribution, and candidate timeline.
3. Simulate: power and quiet conflicts should be visible.
4. Repair/revise: inspect changes and remaining findings; model prose is not verification.
5. Cancel approval: no active runtime. Confirm explicitly: exact version becomes active.
6. Fail a required declared device capability: SUSPENDED.
7. Recover: approved actions reverify before ACTIVE.
8. Roll back: virtual snapshot restored.
9. Try evening guests/custom profile and unsupported/ambiguous requests.
10. Refresh live evidence: new version and stale prior approval.
11. Run labelled fixture demo for repeatable failure/repair/family-decision/recovery footage.
12. Check narrow/wide screens, safe text rendering, and browser errors.

Restart Node after source/environment changes and reload the browser; no hot-reloading framework is present. Stop the server before dependency reinstalls or Prisma generation, especially on Windows.

## Claims discipline

Software tests do not establish Alexa certification, physical execution, universal household coverage, or perfect LLM interpretation. Live TomTom remains unverified until an owner key/route is supplied. Keep mocked provider results and synthetic disruptions visibly separate from live weather/Gemini.

## Completed checks — 2026-10-11

- Final offline suite: 46 passed, zero failures, one intentionally skipped Neon test.
- Separate opt-in Neon test passed, including lifecycle/concurrency/ownership, reconnect persistence, and custom-profile persistence/isolation; only its random test users were cleaned up.
- Syntax check passed for all 44 JavaScript files; Prisma schema valid; four migrations current. Existing database preserved; no new migration required.
- Clean source copy without environment secrets completed both installs, client generation, offline tests, syntax/schema checks via npm run setup. Latest dialog/planner regressions were then checked in the final offline suite.
- Live MCP smoke at 14:10 UTC: Gemini extracted five tasks, the assistant chose simulation, real Open-Meteo evidence was returned, initial POWER_OVERLAP/QUIET_WINDOW findings failed verification, timing repair passed, and a real Gemini timing revision passed. No Neon writes or activation in that smoke.
- Browser exercised real Gemini work planning, cancelled/confirmed approval, required-capability suspension/recovery, and the full labelled guided flow ending in separately confirmed ROLLED_BACK with 11 audit events. Browser warnings/errors were absent during the completed guided flow.
- Live checks exposed model departure inconsistencies: departure is now derived from grounded capabilities, leave-by plans require a separate departure action, and requested start times are not silently turned into completion deadlines. Invalid model candidates still fail closed.
- Custom profile save was explicitly confirmed in the browser and preserved the existing proposal snapshot. Both 360px and 1440px layout checks found no horizontal overflow; viewport overrides were reset.
- Real evening planning extracted four non-departure tasks, exposed the vacuum/quiet conflict, and passed after moving vacuuming to 18:00 while preserving dinner's completion deadline. Final browser error/warning logs were empty. A secret-free preview is saved locally under screenshots (ignored by Git).
- The temporary verification server was stopped at handoff to avoid Windows Prisma engine locks. Start it again with npm start --prefix apps/mcp-server; do not reinstall/generate Prisma while it runs.
