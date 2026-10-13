# Rehearse Automations

This branch develops an isolated automation-preflight engine. The original planner remains operational. This is not connected to Alexa and does not edit a live home.

## Six-phase roadmap

1. Strict import contract, provenance, fixtures, and a real Home Assistant testbed.
2. Deterministic execution, causal replay, interaction detection, and runtime conformance.
3. Bounded scenario search, scoped repairs, and regression verification.
4. Conversational MCP orchestration, identity, projects, and approvals.
5. Integrated decision/replay UI and optional MCP App.
6. Independent evaluation and submission assets.

## Phase 1 contract

Install with `npm ci --prefix apps/mcp-server`. Import the example:

```powershell
node apps/mcp-server/scripts/automationCli.js import automation/fixtures/manual-hold.yaml automation/fixtures/manual-hold.json
node --test apps/mcp-server/test/automation/*.test.js
```

Supported: explicit entities (input_boolean, binary_sensor, light, switch); state triggers with required `to` and optional `from`; event triggers with literal flat event data; literal state conditions; sequential on/off actions, light brightness, constant delays, condition steps; single/restart modes. Entity IDs, source lines, hashes and confirmed expectations are retained. Binary sensors are inputs only. Time is virtual milliseconds within a bounded scenario, not wall-clock scheduling.

**Explicit scope adjustment:** clock/time triggers are rejected in v1 rather than implementing unvalidated timezone/DST behavior. Templates, aliases, tags, blueprints, `for`, queued/parallel modes, dynamic/area targets, missing entities and unknown fields reject the whole import. No partial global-pass claim is possible. Files are bounded at 128 KB, 40 rules, 100 entities, 40 actions/rule. No YAML executes code.

Expectations are user-confirmed invariant or final requirements, optionally guarded by literal state conditions. Differing commands alone are an interaction warning, not proof of an unwanted behavior. Unknown/unavailable input must not become a success claim.

## Integration boundary

The read-only server-side HA adapter reads selected states over authenticated REST. Rules are explicitly imported YAML, not inferred from `/api/states`. Tokens never appear in results. Remote connections require HTTPS. Its read-only limit is application enforcement, not a claim of restricted token privileges.

The independent testbed uses actual Home Assistant Core **2024.12.5**, pinned for available Python 3.12 and run with virtual helpers. This historical runtime is a conformance reference only, not a production recommendation or evidence of compatibility with every later HA version. No production instance/device is connected. Test setup and evidence are described in the phase reports.

Reference semantics: [HA modes](https://www.home-assistant.io/docs/automation/modes/), [triggers](https://www.home-assistant.io/docs/automation/trigger/), [REST](https://developers.home-assistant.io/docs/api/rest/), [WebSocket](https://developers.home-assistant.io/docs/api/websocket/). The exact pinned runtime is the independent authority used by conformance tests.
