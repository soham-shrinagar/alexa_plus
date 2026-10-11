# Architecture decisions

## ADR-001: Rehearse instead of general LifeOps

Decision: focus on verified household routines rather than a broad personal assistant.

Reason: a generic calendar/travel/reminder assistant is easy to reproduce and resembles existing entries. Rehearse has a clear technical thesis, visible failure/repair arc, household-native impact, and defensible safety mechanism.

## ADR-002: micro-twin instead of complete house twin

Decision: build a proposal-scoped relevant model.

Reason: a full twin creates an inventory/synchronization bottleneck and unnecessary privacy cost. The simulator only needs facts that can affect the proposed actions.

## ADR-003: real MCP plus simulated device effects

Decision: implement the required protocol and lifecycle for real while keeping hardware effects simulated.

Reason: public Alexa+ tooling is unavailable; the competition permits a web MCP demonstration. Honest simulation is safer and more credible than fake integrations.

## ADR-004: deterministic safety engine

Decision: compile to explicit constraints and evaluate them with deterministic functions.

Reason: safety evidence must be reproducible. Gemini now assists interpretation, but it is not the arbiter of pass/fail.

## ADR-005: objective repair versus subjective clarification

Decision: automatically resolve scheduling conflicts only when no family value is changed.

Reason: moving a heater is mechanical; waking a child earlier is a value decision. This boundary creates trustworthy agency.

## ADR-006: additive database migration

Decision: add Rehearse tables while retaining legacy LifeOps declarations temporarily.

Reason: the workspace may point at an existing database. Dropping old tables during a product pivot is unnecessary and risky. Cleanup belongs in a separate approved migration.

## ADR-007: no framework build for the demo client

Decision: use semantic HTML, CSS, and browser ES modules.

Reason: zero frontend build step reduces deployment risk and keeps attention on the real MCP interaction. The client remains modular through a separate MCP transport class.

## ADR-008: transactional lifecycle and opaque identifiers

Decision: commit each lifecycle mutation and its approval/evidence/audit records atomically under a per-user lock; treat IDs as opaque strings.

Reason: concurrent activation must consume one approval once, persistence failure must permit safe retry, and Prisma CUIDs must work through the same MCP surface as memory UUIDs.

## ADR-009: explicit fixture interpretation and virtual execution

Decision: expose the supported rule grammar honestly, use scenario action templates, and represent activation as virtual scheduled device states.

Reason: generic safety architecture is valuable without claiming universal natural-language inference or physical control. Unsafe adaptations suspend those schedules; rollback restores the virtual snapshot. A real scheduler and vendor adapter require separately authorized implementation.

## ADR-010: Gemini interpretation, deterministic authority

Decision: Gemini interprets tasks and an allowlisted conversational operation using the actual registered MCP schemas. The application validates output and supplies household safety floors. LLM network calls happen outside database locks; commits recheck versions.

Reason: language flexibility must not grant execution authority or hold DB transactions during an external request. Preserve the deterministic fixture explicitly for regression tests and backup footage; never silently substitute it for a failed LLM call.

## ADR-011: configurable household JSON profiles

Decision: include school/work/evening profiles and per-user confirmed custom profiles. Store them under a reserved UserPreference key namespace and snapshot them into proposals.

Reason: a general household model needs capabilities and constraints, not a complete physical twin or destructive schema replacement. This intentionally reuses an existing table; legacy calendar/task functionality remains unused.

## ADR-012: keyless weather first, optional traffic

Decision: implement real Open-Meteo hourly forecasts now and an optional TomTom current-routing adapter. Label evidence/cache/freshness and refuse provider failures or stale evidence at approval. Synthetic disturbances remain explicit simulation controls.

Reason: one verifiable external source provides value without another credential dependency. Traffic is not misrepresented as a forecast or a background watcher. Device recovery restores only previously approved work and verifies again.
