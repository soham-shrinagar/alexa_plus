# Rehearse

Rehearse is a safety and verification layer for Alexa+ household autonomy. Gemini extracts tasks from a natural-language goal and reads the real MCP tool catalog. Rehearse grounds the candidate in a declared household, fetches live weather, deterministically checks conflicts, repairs timing, asks about family choices, and activates only the exact verified version after explicit approval.

School, work-commute, and evening-guest households are included; custom profiles are editable and user-scoped. The labelled school fixture remains available for offline regression/demo use. Device effects and disturbance/recovery events are simulated; Gemini, weather, MCP, and Neon persistence are real integrations.

## Run locally

Requirements: Node.js 22.9+ and npm. Run these commands from your checkout root.

With the server stopped, `npm run setup` installs both dependency trees, generates Prisma, and runs offline checks. It refuses an occupied server port and stops at the first failure; it does not migrate/reset the database. The individual commands are:

```powershell
npm ci
npm --prefix apps/mcp-server ci
npm run prisma:generate
npm start --prefix apps/mcp-server
```

Open [http://localhost:3000](http://localhost:3000). The web experience obtains a short-lived demo token and makes real MCP `initialize`, `tools/list`, and `tools/call` requests to `/mcp` using protocol version `2025-11-25`.

For the LLM experience, configure `GEMINI_API_KEY` and `GEMINI_MODEL` in the ignored server `.env`, then restart. Open-Meteo weather needs no key for non-commercial use. TomTom traffic is optional and requires its own key plus route coordinates. See [provider setup](docs/providers.md). Without Gemini, explicitly select the labelled fixture; there is no fake LLM fallback.

Stop the running server before repeating `npm ci` or Prisma generation, because its Windows Prisma DLL stays locked. Do not share this checkout's `node_modules` between PowerShell and WSL.

The server loads `apps/mcp-server/.env`. A configured `DATABASE_URL` automatically selects Prisma/Neon unless `REPOSITORY_MODE=memory` is explicit. Without a database URL, the local demo uses memory. The configured Neon database was additively migrated on 2026-10-11; existing LifeOps tables were preserved. See [integration.md](integration.md) for a new database or deployment.

## Verify

```powershell
npm test
npm run check
npm run prisma:validate
npm run prisma:status
```

Optional live Gemini/weather check (uses quota, memory storage, no activation): `npm run smoke:providers`.

The opt-in database test writes synthetic users and deletes only their exact IDs in cleanup. Use an isolated Neon branch for future test runs:

```powershell
$env:RUN_NEON_INTEGRATION="true"
npm run test:neon
Remove-Item Env:RUN_NEON_INTEGRATION
```

## Project map

- `apps/mcp-server/src/domain`: pure compiler, micro-twin, simulation, repair, revision, and runtime logic.
- `apps/mcp-server/src/services`: lifecycle orchestration and approval policy.
- `apps/mcp-server/src/providers`: server-only Gemini, weather, and optional traffic adapters.
- `apps/mcp-server/src/tools`: MCP contracts.
- `apps/mcp-server/src/repositories`: memory and Prisma persistence adapters.
- `apps/mcp-server/public`: same-origin web MCP client and demo experience.
- `apps/mcp-server/test`: domain, service, protocol/security, and optional persistence tests.
- `prisma`: additive database schema and migrations.
- `integration.md`: exact configuration and deployment checklist.
- `docs`: public architecture, decisions, tool, testing, and security guides.

Private planning notes, the local overview, progress log, and recording/submission notes are intentionally excluded from Git. The public setup and technical guides remain included so reviewers can reproduce the demo.

## Important demo boundary

There is no physical executor, clock-driven scheduler, continuous external-data monitor, or actual Alexa/Echo connection. The browser simulates Alexa+ and exposes real MCP calls to 18 tools. Gemini can misunderstand a goal: inspect its task extraction and candidate before approval. The verifier checks implemented constraints, not every possible household risk. Strict production identity-provider login/consent, secret handling, retention, and abuse controls remain deployment work.
