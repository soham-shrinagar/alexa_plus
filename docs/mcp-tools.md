# MCP tool contract

Streamable HTTP endpoint: `/mcp`; protocol `2025-11-25`. All 18 tools require bearer authentication, `mcp:tools`, and a user identity. Results include text and structured content; application errors use `isError: true` with `error.code/message/retryable`. IDs are opaque UUIDs or CUIDs.

| Tool | Main inputs | Effect |
| --- | --- | --- |
| household.list_profiles | none | Built-in plus user-owned profiles |
| household.configure | profile, confirmed | Confirmed per-user profile save |
| home.list_capabilities | scenarioId | Declared entities/capabilities |
| household.get_constraints | scenarioId | Trusted policies and fixture context |
| weather.get_forecast | latitude, longitude, date?, time? | Real hourly Open-Meteo evidence |
| travel.get_estimate | origin, destination | Optional current TomTom traffic route |
| assistant.respond | message, proposalId?, planning options | Gemini chooses one permitted next operation |
| routine.compile | goal, mode, planning options | Inert candidate or clarification |
| simulation.run | proposalId | Persist deterministic findings |
| routine.repair | proposalId | Timing repair + version + simulation |
| routine.revise | proposalId, instruction, mode | Explicit timing/permission revision |
| routine.refresh_environment | proposalId | Live refresh + version + reverify |
| routine.request_activation | proposalId | Verified, fresh, five-minute bound approval |
| routine.activate | proposalId, approvalId, confirmed, idempotencyKey | Simulated activation and snapshot |
| routine.get_status | proposalId | Owned proposal/runtime |
| routine.inject_event | activationId, event | Simulated disruption/recovery + verification |
| routine.rollback | activationId, confirmed | Stop and restore virtual snapshot |
| audit.get_trace | proposalId | User-owned ordered audit |

## Planning options

`scenarioId` selects a built-in or custom household ID. `mode=gemini` uses the model; `mode=fixture` uses only the school fixture. For backward-compatible MCP callers, compile/revise default to fixture: always explicitly supply gemini for an LLM request. The UI defaults to Gemini.

`dataMode` is live (default), fixture, or none. Optional `date` is local YYYY-MM-DD, `time` is HH:MM, and `includeTraffic` enables optional TomTom with a configured route/key. Fixture planner mode ignores provider options and always labels the synthetic school scenario.

Assistant allowlist: compile, simulate, repair, Gemini revise, get status, request approval. Activation, rollback, events, and household configuration are never model-executed. The browser may present the returned approval request, but still requires a real confirmation action.

Clarification responses contain `needsClarification: true`, questions, and no new proposal. Send a complete revised request including the missing details; the assistant uses current proposal context, not a persistent free-form chat-memory service.

## Events

- DEVICE_UNAVAILABLE: capability referenced by the approved routine.
- DEVICE_RECOVERED: capability referenced by the approved routine.
- TRAVEL_DELAY: total minutes, integer 0–60; zero clears the delay.
- WEATHER_CHANGED: raining boolean.

All events are explicitly synthetic in the UI. Recovery cannot invent new actions or bypass verification. A remaining critical violation leaves the runtime suspended.

## Consistency

Active/suspended/rolled-back proposals reject edits. Same-key activation retries return the original result. Other versions cannot use stale approvals. Live refresh and Gemini revisions detect intervening version changes. The tool catalog passed to Gemini is generated from these registered definitions, not a parallel hard-coded list.

Stable errors include LLM_NOT_CONFIGURED, LLM_INVALID_OUTPUT, LLM_INVALID_PLAN, PROVIDER_AUTH_FAILED, PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE, WEATHER_DATA_MISSING, TRAFFIC_NOT_CONFIGURED, ENVIRONMENT_STALE, STALE_PROPOSAL, HOUSEHOLD_NOT_FOUND, INVALID_HOUSEHOLD, VERIFICATION_REQUIRED, CONFIRMATION_REQUIRED, PROPOSAL_LOCKED, FORBIDDEN, and DATABASE_UNAVAILABLE.

Provider HTTP endpoints are not MCP tools by themselves; adapters normalize evidence and tools expose the actual functionality. See [providers.md](providers.md).
