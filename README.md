# Rehearse

Rehearse is a safety and verification layer for Alexa+ household autonomy. It converts a natural-language household goal into a temporal routine, creates a temporary model containing only the relevant people/devices/constraints, simulates the plan, repairs mechanical conflicts, asks the family about value-dependent choices, and activates only the exact verified version after explicit approval.

The included “rainy school morning” is a polished demo fixture, not the product boundary. The engine is organized around generic entities, capabilities, actions, conditions, constraints, routines, simulations, approvals, runtime events, and rollbacks.

## Run locally

Requirements: Node.js 22.9+ and npm. Run these commands from your checkout root.

```powershell
npm ci
npm --prefix apps/mcp-server ci
npm run prisma:generate
npm start --prefix apps/mcp-server
```

Open [http://localhost:3000](http://localhost:3000). The web experience obtains a short-lived demo token and makes real MCP `initialize`, `tools/list`, and `tools/call` requests to `/mcp` using protocol version `2025-11-25`.

The server loads `apps/mcp-server/.env`. A configured `DATABASE_URL` automatically selects Prisma/Neon unless `REPOSITORY_MODE=memory` is explicit. Without a database URL, the local demo uses memory. The configured Neon database was additively migrated on 2026-10-11; existing LifeOps tables were preserved. See [integration.md](integration.md) for a new database or deployment.

## Verify

```powershell
npm test
npm run check
npm run prisma:validate
npm run prisma:status
```

The opt-in database test writes synthetic users and deletes only their exact IDs in cleanup. Use an isolated Neon branch for future test runs:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

## Project map

- `apps/mcp-server/src/domain`: pure compiler, micro-twin, simulation, repair, revision, and runtime logic.
- `apps/mcp-server/src/services`: lifecycle orchestration and approval policy.
- `apps/mcp-server/src/tools`: MCP contracts.
- `apps/mcp-server/src/repositories`: memory and Prisma persistence adapters.
- `apps/mcp-server/public`: same-origin web MCP client and demo experience.
- `apps/mcp-server/test`: domain, service, protocol/security, and optional persistence tests.
- `prisma`: additive database schema and migrations.
- `overview.md`: complete product-to-submission guide.
- `integration.md`: exact configuration and deployment checklist.
- `docs/submission-checklist.md`: remaining owner tasks, deadlines, and honest demo boundaries.
- `docs`: architecture, tool, testing, security, demo, and competition notes.

## Important demo boundary

Device side effects and virtual device schedules are intentionally simulated; there is no physical device executor or clock-driven scheduler. The MCP server, OAuth surface, approval binding, state machine, runtime adaptation, browser MCP client, and deterministic verification are real. The rule parser and revision support are bounded to the included scenario, not general AI reasoning. Strict production identity-provider login is future work.
