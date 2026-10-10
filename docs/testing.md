# Testing strategy

## Automated suites

`domain.test.js` tests the compiler and safety logic without HTTP or persistence:

- time extraction;
- relevant-entity selection;
- initial conflict detection;
- mechanical repair behavior;
- preservation of unrelated constraints;
- explicit revision;
- runtime failure/delay adaptation.
- aggregate power across three devices, unsupported constraints, invalid times;
- Friday-only exceptions, repeated delay reports, and changed weather.

`service.test.js` tests lifecycle policy:

- compile through rollback;
- audit ordering;
- user isolation;
- unverified activation refusal;
- explicit confirmation.
- concurrent activation, immutable active versions, stale approvals;
- transaction rollback on a persistence error and retry;
- unsafe-runtime suspension and restored virtual device state after rollback.

`server.test.js` tests the actual application surface:

- static demo and health endpoint;
- MCP `2025-11-25` negotiation;
- tool discovery;
- end-to-end tool calls;
- missing-token rejection;
- wrong-scope safe errors;
- OAuth authorization-code PKCE.
- cross-site origin/host rejection and authenticated session ownership.

`config.test.js` tests database auto-selection and required production HTTPS/authentication/secrets.

`approvalDialog.test.js` verifies explicit confirmation, cancellation, and Escape after a previous confirmation, using the actual browser confirmation module.

`prisma.integration.test.js` is opt-in because it writes to PostgreSQL. It exercises real MCP initialize/list/call and the complete lifecycle using Prisma-generated CUIDs, concurrent activation, repeated delays, unsafe suspension, rollback state restoration, ownership, and reconnect persistence. It creates two random synthetic users and deletes only their exact IDs and cascaded test data in `finally`. Prefer an isolated Neon branch for future runs.

The schema-validation script supplies a non-routable placeholder URL only when `DATABASE_URL` is absent. Prisma validation needs the variable syntactically but does not connect to it; migrations and integration tests never use this fallback.

## Commands

```powershell
npm test
npm run check
npm run prisma:validate
npm run prisma:generate
npm run prisma:status
```

For isolated database testing:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

## Manual checks before recording

- Guided run completes without refreshing.
- Initial simulation shows all expected conflicts.
- Repair leaves exactly the family decision.
- Revision produces a passing result.
- Canceling approval leaves the proposal inert.
- Confirming approval changes state to active.
- Adaptation removes coffee and moves departure to 07:25.
- Rollback changes state to rolled back.
- Narrow/mobile layout remains readable.
- Browser console contains no uncaught error.

After source changes, restart the Node server and reload the browser; there is no hot-reloading build framework. Automated results on 2026-10-11: 27 ordinary tests passed; the additional opt-in live Neon test passed separately. Neither result establishes support for arbitrary natural-language goals or real device execution.

A clean copy of tracked/new source (without `.env`, `.git`, or dependencies) also passed both `npm ci` installs, Prisma generation, 27 ordinary tests, syntax/schema checks, and the actual `node --env-file-if-exists=.env src/server.js` startup. Its health endpoint reported memory mode and its demo page returned 200. Browser verification found no console errors/warnings, and no horizontal overflow at 360px or 1440px.

## Claims discipline

Passing tests demonstrate software behavior, not physical device control or Alexa certification. The README, UI, video, and submission must keep that distinction clear.
