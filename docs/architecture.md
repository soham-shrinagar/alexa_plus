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
                                                                   │         ▲
                                                                   ▼         │
                                                               SUSPENDED ────┘
```

Every repair or user revision increments the proposal version. Approval payloads contain both proposal ID and version, preventing an approval for one plan from authorizing a later edit.

Activated, suspended, and rolled-back proposals are immutable. Compile another proposal to edit them. Unsafe runtime changes suspend the activation and virtual device schedule; a safe follow-up event can resume it, and rollback is always available while active or suspended.

## Constraint evaluators

- `MAX_CONCURRENT_POWER`: sweeps time boundaries and sums every simultaneously powered step against the threshold.
- `QUIET_WINDOW`: rejects audible steps before quiet hours end.
- `DEADLINE`: computes conditional and travel-adjusted departure and ensures required preparation finishes.
- `EARLIEST_START`: preserves a person/device start boundary, with explicitly authorized weekday exceptions.
- `DEVICE_AVAILABLE`: blocks non-optional unavailable capabilities.

Evaluators return structured violations rather than throwing. Transport or repository failures throw stable application errors.

Unsupported constraint types and malformed/cross-day step times fail verification rather than being silently accepted. Templates describe scenario actions; generic scheduling logic aligns departure-relative cues.

## Why deterministic simulation

An LLM may help interpret a goal in a later integration, but safety claims must remain reproducible. The current parser is explicitly a bounded rule parser. The compiled routine and constraints are persisted, and the pass/fail result is computed from those objects. A judge can see why a conflict exists and reproduce it exactly.

## Persistence

The service programs against repository methods. Memory mode is ideal for demos. Prisma mode persists JSON routine artifacts plus indexed lifecycle metadata. User ownership checks occur in repository queries, not only at the tool layer.

Every lifecycle mutation uses `withUserLock`: memory serializes mutations and restores a snapshot on failure; Prisma takes a per-user row lock inside an interactive transaction. Proposal, simulation, approval, activation, and audit writes commit together or roll back together. Same-key activation retries return the original activation; conflicting keys/versions cannot duplicate execution. Identifiers may be UUIDs in memory or CUIDs in Prisma.

Legacy LifeOps tables remain declared only for additive migration compatibility. They are unused by Rehearse and can be removed later in a separately reviewed destructive migration.

## Runtime boundary

Activation captures initially idle virtual device states/context, then creates scheduled virtual actions. Adaptation updates those schedules and re-verifies; rollback clears the routine and restores the captured device states/context. No wall-clock scheduler or physical device adapter runs. A future production adapter must translate capabilities into authorized vendor calls and verify real resulting state.
