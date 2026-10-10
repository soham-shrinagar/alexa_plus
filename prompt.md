# Rehearse implementation specification

## Product contract

Build a general household routine compiler and rehearsal engine called **Rehearse**.

> Given a household outcome, Rehearse builds only the relevant household model, compiles a candidate routine, simulates it against explicit constraints, repairs safe conflicts, requests clarification for value choices, and activates only a verified, approved version.

The school-morning flow is a demo fixture. Never hard-code the product identity as a school application.

## Core domain

The implementation must express these concepts even when plain JavaScript objects are used:

- Entity: a person, device, location, or external condition.
- Capability: an action a device/provider can perform.
- Action: one scheduled step with target, timing, duration, and effects.
- Trigger/condition: a fact that changes applicability or timing.
- Constraint: an invariant checked by a deterministic evaluator.
- Routine and version: an ordered/temporal candidate plan.
- Simulation event and violation: evidence generated without side effects.
- Approval: a short-lived authorization bound to exact payload/version.
- Activation: a runtime instance with a pre-action snapshot.
- Audit event: append-only lifecycle evidence.

## Required lifecycle

1. Discover the scenario’s capabilities and defaults.
2. Compile a goal into a proposal and just-in-time micro-twin.
3. Simulate before executing.
4. Explain all detected violations.
5. Repair conflicts that require no subjective choice.
6. Ask the user for value-dependent exceptions.
7. Re-simulate the changed version.
8. Request explicit activation approval.
9. Bind approval to proposal ID and version.
10. Capture a rollback snapshot and activate the demo runtime.
11. Re-plan when a runtime event occurs.
12. Roll back safely and retain an audit trace.

## Technical constraints

- MCP protocol version: `2025-11-25`.
- Transport: Streamable HTTP at `/mcp`.
- Browser demo: a real MCP client, not a private REST shortcut.
- Authentication: bearer JWT; OAuth metadata, authorization-code PKCE, and client-credentials support remain available.
- Isolation: every persisted proposal, simulation, activation, approval, and audit event is scoped to an authenticated user.
- Writes: activation and rollback require explicit confirmation.
- Persistence: memory for deterministic demos; Prisma/PostgreSQL for deployed state.
- Migration safety: Rehearse schema changes are additive; old database tables are not dropped.
- No claim that simulated devices are physically controlled.

## Demo acceptance criteria

The default rainy-school-morning flow must visibly demonstrate:

- a power conflict between the water heater and kettle;
- an announcement inside the baby’s quiet window;
- rain advancing the departure deadline;
- Maya’s normal start time making the rainy plan infeasible;
- automatic repair of power, quiet-time, and departure timing;
- an explicit user exception allowing Maya to start at 06:50;
- a passing simulation;
- approval-bound activation;
- optional coffee removal when the capability becomes unavailable;
- a five-minute travel delay advancing departure;
- a passing adapted plan;
- rollback and an auditable lifecycle.

## Quality bar

- Keep pure domain logic separate from transport and persistence.
- Keep fixture data separate from generic evaluators.
- Prefer explicit deterministic behavior over pretending that a model inferred something it did not.
- Produce structured tool results plus readable text content.
- Use stable error codes and safe public messages.
- Test failure paths, ownership boundaries, authorization, and approval semantics—not only the happy path.
