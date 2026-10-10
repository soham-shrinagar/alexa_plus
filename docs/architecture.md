# Architecture

## Boundaries

Rehearse follows dependency direction from transport toward pure domain logic:

```text
Browser MCP client
      │ JSON-RPC / Streamable HTTP
      ▼
MCP tools ── auth/scope/schema/error mapping
      ▼
RehearseService ── lifecycle and safety policy
      ├──────────────► repository interface ── memory or Prisma
      ▼
Pure domain modules
  parser → compiler → micro-twin → simulator → repair/revision → runtime adapter
```

The scenario fixture depends on no infrastructure. The simulator accepts a routine and context and returns evidence without persisting or executing anything.

## Proposal state model

```text
DRAFT → NEEDS_REPAIR → NEEDS_INPUT → VERIFIED → AWAITING_APPROVAL → ACTIVE → ROLLED_BACK
             └──────────────────────► VERIFIED
```

Every repair or user revision increments the proposal version. Approval payloads contain both proposal ID and version, preventing an approval for one plan from authorizing a later edit.

## Constraint evaluators

- `MAX_CONCURRENT_POWER`: detects overlapping powered steps above a configured threshold.
- `QUIET_WINDOW`: rejects audible steps before quiet hours end.
- `DEADLINE`: computes conditional and travel-adjusted departure and ensures required preparation finishes.
- `EARLIEST_START`: preserves a person/device start boundary.
- `DEVICE_AVAILABLE`: blocks non-optional unavailable capabilities.

Evaluators return structured violations rather than throwing. Transport or repository failures throw stable application errors.

## Why deterministic simulation

An LLM may help interpret a goal in a later integration, but safety claims must remain reproducible. The current parser is explicitly a bounded rule parser. The compiled routine and constraints are persisted, and the pass/fail result is computed from those objects. A judge can see why a conflict exists and reproduce it exactly.

## Persistence

The service programs against repository methods. Memory mode is ideal for demos. Prisma mode persists JSON routine artifacts plus indexed lifecycle metadata. User ownership checks occur in repository queries, not only at the tool layer.

Legacy LifeOps tables remain declared only for additive migration compatibility. They are unused by Rehearse and can be removed later in a separately reviewed destructive migration.

## Runtime boundary

Activation creates a simulated runtime record and captures assumed device states. A production adapter would translate generic capabilities into vendor calls, verify resulting state, and update the snapshot/trace. That adapter does not exist yet, so the UI and docs label side effects as simulated.
