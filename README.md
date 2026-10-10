# Rehearse

Rehearse is a safety and verification layer for Alexa+ household autonomy. It converts a natural-language household goal into a temporal routine, creates a temporary model containing only the relevant people/devices/constraints, simulates the plan, repairs mechanical conflicts, asks the family about value-dependent choices, and activates only the exact verified version after explicit approval.

The included “rainy school morning” is a polished demo fixture, not the product boundary. The engine is organized around generic entities, capabilities, actions, conditions, constraints, routines, simulations, approvals, runtime events, and rollbacks.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
cd C:\Users\shrin\OneDrive\Desktop\alexa_plus
npm install
npm --prefix apps/mcp-server install
npm start --prefix apps/mcp-server
```

Open [http://localhost:3000](http://localhost:3000). The web experience obtains a short-lived demo token and makes real MCP `initialize`, `tools/list`, and `tools/call` requests to `/mcp` using protocol version `2025-11-25`.

## Verify

```powershell
npm test
npm run prisma:validate
npm run prisma:generate
```

The opt-in database test must only target an isolated disposable database:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
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
- `docs`: architecture, tool, testing, security, demo, and competition notes.

## Important demo boundary

Device side effects are intentionally simulated. That is honest, safer, and consistent with the competition’s permitted simulated Alexa+ experience. The MCP server, OAuth surface, approval binding, state machine, runtime adaptation, browser MCP client, and deterministic verification are real.
