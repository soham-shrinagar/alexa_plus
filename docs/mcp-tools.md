# MCP tool contract

All tools require a bearer token with `mcp:tools` and a user identity. Successful calls return both text content and structured content. Domain failures return `isError: true` with `{ error: { code, message, retryable } }`.

## Read tools

### `home.list_capabilities`

Input: optional `scenarioId`. Returns scenario metadata, people, devices/capabilities, and environment.

### `household.get_constraints`

Input: optional `scenarioId`. Returns defaults and current demo environment.

### `routine.get_status`

Input: `proposalId`. Returns the user-owned proposal and active runtime if one exists.

### `audit.get_trace`

Input: `proposalId`. Returns ordered lifecycle audit events owned by the caller.

## Proposal tools

### `routine.compile`

Input: `goal`, optional `scenarioId`. Creates version 1 proposal, routine, and micro-twin. It does not claim the proposal is safe.

### `simulation.run`

Input: `proposalId`. Stores a trace and violations for the latest proposal version.

### `routine.repair`

Input: `proposalId`. Applies only objective repair strategies, increments version, re-simulates, and returns any decisions that still require the user.

### `routine.revise`

Input: `proposalId`, `instruction`. The demo supports an explicit Maya start-time exception. Unsupported revisions fail honestly with `UNSUPPORTED_REVISION`.

## Runtime tools

### `routine.request_activation`

Input: `proposalId`. Re-simulates defensively and refuses failed proposals. Returns a five-minute, single-use approval bound to proposal ID/version.

### `routine.activate`

Input: `proposalId`, `approvalId`, `confirmed`, `idempotencyKey`. Consumes the matching approval, captures a snapshot, and starts the simulated runtime.

### `routine.inject_event`

Input: `activationId` and one event:

- `{ type: "DEVICE_UNAVAILABLE", capability }`
- `{ type: "TRAVEL_DELAY", minutes }`
- `{ type: "WEATHER_CHANGED", raining }`

The updated runtime is always re-simulated and audited.

### `routine.rollback`

Input: `activationId`, `confirmed`. Stops only an active user-owned runtime and returns the restored snapshot.

## Stable error examples

- `INSUFFICIENT_SCOPE`
- `USER_CONTEXT_REQUIRED`
- `SCENARIO_NOT_FOUND`
- `UNSUPPORTED_REVISION`
- `VERIFICATION_REQUIRED`
- `CONFIRMATION_REQUIRED`
- `APPROVAL_EXPIRED`
- `INVALID_APPROVAL`
- `ROUTINE_NOT_ACTIVE`
- `FORBIDDEN`
- `DATABASE_UNAVAILABLE`
