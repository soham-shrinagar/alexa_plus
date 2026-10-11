# Architecture

## Runtime flow

```text
Browser -> MCP initialize/list/call -> authenticated tool handlers
                                      |
                          RehearseService (policy + lifecycle)
                             |                    |
                      PlannerService       EnvironmentProvider
                      Gemini adapter       Open-Meteo / optional TomTom
                             |
                    schema + semantic plan validation
                             |
                    deterministic domain verifier
                             |
                per-user transaction -> repository -> memory / Neon
                             |
                   exact-version human approval
                             |
                   simulated runtime -> recovery / rollback
```

Gemini interprets requests and chooses an allowlisted next operation. It receives the catalog built from the same tool definitions registered with the MCP SDK, including their input schemas and annotations. It does not receive credentials or unrestricted function execution.

## Household model

Three built-in profiles (school, work, evening guests) and user-owned custom profiles declare people, capabilities, device power/noise/minimum duration, start policies, quiet hours, power budget, coordinates, and optional routes. Built-ins cannot be overwritten. Custom saves require explicit confirmation.

Profiles persist under reserved `rehearse.household.<id>` keys in the existing UserPreference table. This is an intentionally reviewed reuse of the legacy table, not an additional schema migration. Proposals store a complete household snapshot for interpretation and a minimal referenced micro-twin for verification/display. Later profile edits do not mutate old proposals.

## Safety model

Plans map extracted tasks to known step IDs. Unknown entities/capabilities/tools, unmapped steps/tasks, required optional steps, cross-day timing, short device durations, and cyclic dependencies are rejected before persistence. Device power/noise comes from trusted declarations, never the model. Household constraints are always inserted by application code.

The verifier checks power, quiet windows, departure/readiness, earliest starts, capability availability, dependencies, per-task deadlines, and exclusive resources. Unsupported constraints and invalid timing fail closed. The deterministic fixture remains a regression/demo mode, not a claim of LLM reasoning.

Repair changes timing without relaxing constraints, removing required work, or shortening duration. It may fail: unresolved family choices require explicit revision. Named earliest-start permissions must include a supported clock time and correct weekday scope. Other policy relaxation is blocked.

## Versions and transactions

Draft -> needs repair/input -> verified -> awaiting approval -> active/suspended -> rolled back.

Repair, revision, and context refresh increment versions. Approval hashes bind the proposal ID/version and expire after five minutes. Live evidence older than 15 minutes requires refresh. Activated proposals are immutable; runtime artifacts are separate.

External calls happen before opening a transaction. The service then checks ownership/version and performs proposal/evidence/audit writes atomically under a per-user lock. Memory snapshots on failure; PostgreSQL row-locks and rolls back. Stale concurrent revisions/refreshes are refused. Idempotent activation cannot consume approval twice.

## Runtime boundary

Device effects, disturbances, recovery reports, schedules, and snapshot restoration are virtual. Required failure suspends virtual schedules. Recovery restores only approved actions and re-verifies; unresolved conflicts remain suspended. A zero total-delay report can clear a simulated delay. Rollback is available from active/suspended states.

There is no physical executor, wall-clock scheduler, continuous weather/traffic watcher, general Alexa/Echo connection, or complete house twin. Production needs vendor adapters, identity/consent, telemetry validation, and operational review.

See [providers.md](providers.md), [mcp-tools.md](mcp-tools.md), and [security.md](security.md).
