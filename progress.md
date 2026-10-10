# Implementation progress

Last verified: 2026-10-11. No GitHub push was performed.

## Complete

- Product pivot from LifeOps to Rehearse.
- Generic domain modules for goal parsing, temporal compilation, micro-twin selection, constraint evaluation, repair, revision, runtime adaptation, and time handling.
- Rainy-school-morning fixture kept separate from the core engine.
- Twelve Rehearse MCP tools over Streamable HTTP with protocol `2025-11-25`.
- Same-origin visual web MCP client.
- Explicit, payload-hashed activation approval and confirmation gate.
- Runtime device-failure and travel-delay adaptation.
- Snapshot-based demo rollback and append-only audit events.
- Memory repository and Prisma/PostgreSQL repository.
- Additive migration for proposals, simulations, activations, and audit events.
- OAuth metadata, PKCE authorization-code flow, client credentials, JWT bearer validation, origin guard, rate limiting, session TTL, and user isolation.
- Rewritten project documentation.
- Old LifeOps runtime services and tools removed; old database models remain temporarily in Prisma only to avoid destructive migration.

## Verification evidence

- `npm test`: 27 passed, 0 failed, 1 intentionally skipped database integration test.
- Opt-in `npm run test:neon`: 1 passed against the configured Neon database. This covers the complete real MCP lifecycle, CUID identifiers, concurrent activation, isolation, repeated delay, unsafe-runtime suspension, actual virtual snapshot restoration, and reconnect persistence.
- `npm run prisma:validate`: passed.
- `npm run prisma:generate`: passed with Prisma Client 6.19.1.
- `npm run check`: all project JavaScript syntax checks passed.
- `npm run prisma:status`: four migrations recorded, database current.
- Prisma schema difference: no difference detected.
- Real MCP integration test: initialize, tool discovery, compile, simulate, repair, revise, request approval, and activate passed.
- OAuth PKCE and wrong-scope tests passed.
- Clean source copy without `.env`: both `npm ci` installs, Prisma client generation, all 27 ordinary tests, syntax/schema checks, and the actual start command passed. HTTP health reported memory mode and the demo page returned 200.
- Browser console had no errors/warnings during the final guided lifecycle; 360px and 1440px layout checks found no horizontal overflow.

## Corrections from the codebase review

- Prisma CUIDs now pass MCP input validation alongside memory UUIDs.
- A configured database URL automatically selects persistence; the migration CLI loads the app `.env` correctly.
- Legacy schema declarations match actual timestamp precision, defaults, and foreign-key actions, preventing unwanted migration drift.
- Lifecycle changes, approval consumption, evidence, and audit writes are atomic; per-user locks prevent double activation and concurrent revision races.
- Approved active/suspended/rolled-back versions are immutable; stale approvals cannot activate new versions.
- Power verification sums all simultaneous devices; unknown constraints and malformed action times fail safely.
- Friday permissions stay Friday-only, preserving unrelated constraints.
- Delay reports no longer compound; weather changes recompute departure and related cues.
- Unsafe runtime plans suspend the virtual schedule; rollback restores device state and context rather than merely a label.
- Sessions are bound to authenticated users/clients; every demo visit gets a separate synthetic identity; host/origin guards also protect demo endpoints.
- Guided playback requires explicit approval, stops on cancellation, and prevents overlapping actions. Escape resets the dialog result rather than reusing an earlier confirmation.
- Timeline labels and narrow-screen layout were corrected.

## Neon migration performed

The configured database contained legacy tables but no Prisma migration history. After inspection, the three matching legacy migrations were recorded as already applied. Only `20261010000000_rehearse_domain` was executed, adding the four Rehearse tables. Existing tables and data were preserved. All four migrations are recorded and Prisma reports zero schema drift.

The live test cleaned up only its two exact, randomly generated synthetic user IDs and their dependent test records. Existing household records were not deleted. Browser demo records remain synthetic demo records.

## Honest implementation boundaries

One scenario is polished; parsing and revision grammar remain bounded, despite generic data structures and evaluators. Device effects are virtual schedules: there is no physical executor or clock-driven scheduler. Production identity-provider login, vendor adapters, data-retention/deletion controls, and independent security review are future work. Audit events are append-only through the application interface, not tamper-proof against a database administrator.

Persistence survives server restarts, but fresh browser visits have new demo identities and do not restore prior history automatically. Stable JWT secrets are needed for existing tokens to survive restarts.

## Intentionally pending human-owned items

- Choose/create the public GitHub repository and push only when ready.
- Record and publish the public demo video.
- Create the final Devpost submission and supply required profile/submission text.
- Decide whether to deploy; hosting is optional under the current competition FAQ.
- The configured Neon migration is complete; use an isolated branch when testing future migration changes.
- Rotate/create production secrets and configure the final OAuth client/redirect URLs.
- Complete the final product feedback and optional friction log from genuine experience.
- Choose/add a detectable open-source license if submitting a public repository; alternatively arrange private reviewer access as allowed by the rules.

See [the final submission checklist](docs/submission-checklist.md) for the full sequence and deadline.

## Known maintenance note

`npm audit` reports four high-severity findings in the Prisma CLI chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect`) for Prisma 6.19.1. The CLI is a development/migration dependency, not browser code. Do not use `npm audit fix --force`; it recommends an incompatible downgrade. Resolve through a deliberate compatible upgrade and full retesting before production use. This is not a clean security-audit claim.
