# Phase 1 — Contract, import, and integration feasibility

Implementation date: 14 October 2026. Branch: `new/automation`. The original Rehearse planner and database remain unchanged.

## Delivered

- Versioned canonical contracts for entities, triggers, actions, rules, confirmed expectations, bounded scenarios, and stable content hashes.
- Atomic Home Assistant YAML import with source-line/action mapping and normalized export. Both modern plural and legacy singular keys are supported without permitting ambiguous combinations.
- Explicit unsupported reports. No unsupported rule is silently discarded. Unknown/missing entities, cross-domain writes, duplicate IDs, aliases, explicit tags, templates, duplicate YAML keys, extra fields, oversized/deep input, and unconfirmed expectations are rejected.
- A server-side selected-entity read adapter: GET only, redirects rejected, request timeout, response limit, sanitized HTTP errors, server-held token, HTTPS for non-loopback origins.
- A manual-hold fixture expressed using virtual boolean helpers. The delayed-off behavior is intentionally unfixed at this phase.
- CLI import command and tracked setup/contract documentation under `automation/`. Existing private docs remain ignored; reports required for review are tracked separately.
- A disposable real-Home-Assistant harness with authenticated REST and WebSocket traffic, virtual entities, independent expected-state assertions, and credential-free JSON observations.
- The full six-phase roadmap in `automation/README.md`. Future MCP conversation and product UI are not claimed as implemented.

## Scope decision

The v1 subset supports explicit state/event triggers, literal state conditions, constant delays, condition steps, on/off actions and light brightness, plus single/restart modes. Clock/time triggers are deliberately rejected rather than shipping untested time-zone behavior. Queued/parallel, arbitrary templates, dynamic targets, groups/areas, and physical-device semantics remain unsupported. No Alexa-native import or integration is claimed.

Home Assistant 2024.12.5 is an isolated historical conformance target because the available WSL Python is 3.12. This is not a production deployment or blanket support for current HA releases. No external household instance or user's device is touched.

## Verification

- Six new import/adapter tests passed.
- Full existing-plus-new suite: 100 tests, 99 passed, zero failed, one optional Neon integration skipped. No database schema or data was changed.
- Syntax check: 77 JavaScript files passed. Python harness syntax compiled successfully.
- `yaml` is pinned to 2.9.1 after auditing the initial dependency selection. Four existing Prisma-chain high-severity advisories remain; a forced Prisma downgrade is outside this phase and was not performed.
- Independent runtime validation passed both scenarios against Home Assistant Core 2024.12.5. `phase-1-ha.json` records independently asserted final states and authenticated REST/WebSocket observations. These are virtual helpers in a real HA runtime, not physical devices.

## Reproduce

```powershell
npm ci --prefix apps/mcp-server
npm run test:automation
npm run automation:import -- automation/fixtures/manual-hold.yaml automation/fixtures/manual-hold.json
npm run automation:ha-cases
```

Follow `automation/testbed/README.md` to install/run the isolated HA dependency. The testbed needs neither physical devices nor a user-provided token. It creates ephemeral test-only credentials internally and stops each runtime after testing. Generated captures are ignored; reviewed evidence is tracked here.

## Remaining

The import is a contract boundary, not an execution engine. Phase 2 adds event simulation/replay and semantic conformance; phase 3 adds bounded search and verified repairs. Returning-user auth, conversational MCP tools, integrated UI, and production deployment are later phases.
