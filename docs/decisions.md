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

Reason: safety evidence must be reproducible. A future model can assist interpretation, but it should not be the sole arbiter of pass/fail.

## ADR-005: objective repair versus subjective clarification

Decision: automatically resolve scheduling conflicts only when no family value is changed.

Reason: moving a heater is mechanical; waking a child earlier is a value decision. This boundary creates trustworthy agency.

## ADR-006: additive database migration

Decision: add Rehearse tables while retaining legacy LifeOps declarations temporarily.

Reason: the workspace may point at an existing database. Dropping old tables during a product pivot is unnecessary and risky. Cleanup belongs in a separate approved migration.

## ADR-007: no framework build for the demo client

Decision: use semantic HTML, CSS, and browser ES modules.

Reason: zero frontend build step reduces deployment risk and keeps attention on the real MCP interaction. The client remains modular through a separate MCP transport class.
