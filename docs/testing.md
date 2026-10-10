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

`service.test.js` tests lifecycle policy:

- compile through rollback;
- audit ordering;
- user isolation;
- unverified activation refusal;
- explicit confirmation.

`server.test.js` tests the actual application surface:

- static demo and health endpoint;
- MCP `2025-11-25` negotiation;
- tool discovery;
- end-to-end tool calls;
- missing-token rejection;
- wrong-scope safe errors;
- OAuth authorization-code PKCE.

`prisma.integration.test.js` is opt-in because it requires an isolated PostgreSQL database. It verifies persistence, ownership isolation, reconnect behavior, and cleanup.

The schema-validation script supplies a non-routable placeholder URL only when `DATABASE_URL` is absent. Prisma validation needs the variable syntactically but does not connect to it; migrations and integration tests never use this fallback.

## Commands

```powershell
npm test
npm run prisma:validate
npm run prisma:generate
node --check apps/mcp-server/public/app.js
node --check apps/mcp-server/public/mcpClient.js
```

For isolated database testing:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
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

## Claims discipline

Passing tests demonstrate software behavior, not physical device control or Alexa certification. The README, UI, video, and submission must keep that distinction clear.
