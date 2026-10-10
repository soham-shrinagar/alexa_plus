# Rehearse: complete product, implementation, and submission overview

## 1. The final idea

**Rehearse is a safety and verification layer for Alexa+ household autonomy.** A person describes an outcome—“make our school mornings run themselves”—instead of manually building a brittle list of automations. Rehearse turns that outcome into a timed routine, creates a temporary model containing only the people/devices/constraints relevant to this one decision, simulates the plan, finds conflicts, repairs objective problems, asks the family about subjective trade-offs, and activates only the exact version that passed verification and received approval.

The memorable line is:

> Alexa should not discover that a household routine is unsafe while the household is living through it. Rehearse it first.

## 2. What we are and are not building

We are building:

- a self-hosted MCP server implementing version `2025-11-25` over Streamable HTTP;
- a real web MCP client that demonstrates the protocol end to end;
- a generic temporal routine compiler and deterministic constraint engine;
- a just-in-time “micro-twin,” built per proposal from relevant facts only;
- repair, clarification, approval, activation, adaptation, rollback, and audit workflows;
- a polished rainy-school-morning demo scenario.

We are not building:

- a permanent, identical digital copy of a house;
- a 3D house model;
- a school-only product;
- real hardware control disguised as completed integration;
- a general natural-language reasoner that supports every possible household sentence;
- an Alexa-hosted skill that depends on unavailable tooling.

Device actions in the current demo are simulated. The transport, MCP calls, state transitions, simulation, approval binding, adaptation, persistence adapters, and security boundaries are real.

## 3. Why the school example is not the product boundary

The engine understands generic structures: entities, capabilities, actions, conditions, constraints, routines, simulation events, approvals, activations, and audit events. School-morning data lives in one fixture file. A future fixture could express:

- an elderly parent’s medication and comfort routine;
- an energy-aware evening routine;
- guest arrival preparation;
- a pet-care routine;
- appliance-failure recovery;
- a storm readiness plan.

The school morning is selected because judges can understand the stakes and all conflicts within seconds. That improves the demonstration without narrowing the architecture.

## 4. Why the micro-twin avoids the digital-twin bottleneck

A full house twin would require constant inventory, sensor, preference, and state synchronization. Rehearse instead derives the smallest useful model for one proposed routine.

For the demo it includes Maya, the baby, the water heater, kettle, coffee machine, hall speaker, entry light, and the constraints those elements participate in. Unrelated rooms and devices are excluded. The model is proposal-scoped and carries its assumptions. This produces three advantages:

1. Less setup: the system does not need to know the entire house.
2. Better privacy: irrelevant household facts never enter this proposal.
3. Better explainability: every included fact has a visible reason for being present.

This is why “micro-twin” is a useful mechanism, not the product itself. The product is verified household autonomy.

## 5. End-to-end demo story

### Goal

The user says:

> Make our school mornings run themselves. We need to leave by 7:45. Don’t wake the baby before 7, don’t run the kettle and water heater together, and leave 15 minutes earlier when it rains.

### First compilation

Rehearse creates a candidate plan containing water heating, an announcement, Maya’s preparation, kettle, coffee, entry lighting, and departure. The fixture says it is raining.

### First rehearsal

The deterministic simulator catches:

- the 2,000W heater and 1,500W kettle overlap above the 2,600W household budget;
- the hall announcement occurs at 06:55, inside the baby’s quiet window;
- rain advances the effective departure deadline from 07:45 to 07:30;
- Maya’s 07:00–07:35 preparation cannot finish by that departure.

### Automatic repair

Rehearse can objectively:

- move water heating earlier;
- delay the announcement until 07:00;
- advance departure to 07:30.

It cannot decide that Maya should wake earlier, because that is a family-value choice. It asks for a decision instead of silently weakening a constraint.

### User revision

The user says:

> On Fridays, Maya can wake at 6:50, but keep everything else unchanged.

Rehearse adds a Friday-only exception to Maya's earliest-start constraint and updates her preparation step. Other weekdays keep the normal boundary. The fixture's current weekday is Friday, and this new version passes all constraints.

### Approval and runtime

Rehearse creates a short-lived approval whose hash binds it to the proposal ID and version. After explicit confirmation it captures a pre-activation snapshot and starts a simulated runtime.

Then two disruptions are injected:

- the coffee capability becomes unavailable, so the optional coffee step is skipped;
- travel takes five minutes longer, so departure advances to 07:25.

The adapted plan is re-simulated and still passes. Finally, rollback stops the runtime and restores the captured snapshot. The audit trace shows every lifecycle decision.

## 6. System flow

```text
Natural-language goal
        │
        ▼
Bounded intent parser ── assumptions made explicit
        │
        ▼
Temporal compiler ────── versioned candidate routine
        │
        ├──► Relevant-entity selector ──► proposal-scoped micro-twin
        │
        ▼
Deterministic simulator
        │
   ┌────┴────────────┐
   │ violations       │ pass
   ▼                  ▼
Repair engine      Approval request
   │                  │
   ├─ objective fix   ▼
   └─ user decision  Version-bound approval
                      │
                      ▼
                Simulated activation
                      │
                 runtime events
                      │
                      ▼
             adapt + re-simulate
                      │
                      ▼
             rollback + audit
```

## 7. Code architecture

### Domain layer

Pure modules in `apps/mcp-server/src/domain` perform parsing, compilation, model selection, evaluation, repair, revision, and adaptation. They do not know about HTTP, MCP sessions, OAuth, or PostgreSQL. This makes failures reproducible and unit-testable.

### Service layer

`RehearseService` owns lifecycle policy. It version-controls proposals, refuses unverified activation, binds approval payloads, captures snapshots, persists runtime changes, and emits audit events.

Mutations are transactional and serialized per user. Concurrent activation cannot consume one approval twice. Approved versions are immutable; unsafe runtime adaptations suspend the virtual schedule until recovery or rollback.

### MCP layer

The MCP tool registry exposes narrow actions with explicit read/write annotations, Zod schemas, user scope checks, structured results, and stable safe errors.

### Persistence layer

`MemoryRepository` is deterministic for local judging and tests. `PrismaRepository` maps the same lifecycle to PostgreSQL. The new migration is additive. Legacy database tables remain in the schema so an existing database can migrate without destructive drops; no current runtime code uses them.

### Web layer

The browser requests a short-lived demo token, initializes an MCP session, discovers tools, and performs all demo actions through `tools/call`. It visualizes the timeline, constraints, micro-twin, status, and real MCP activity. There is no private REST API that bypasses the MCP server.

## 8. MCP tools

| Tool | Purpose | Side effect |
|---|---|---|
| `home.list_capabilities` | Discover scenario people/devices/capabilities | None |
| `household.get_constraints` | Read default constraints/environment | None |
| `routine.compile` | Create proposal and micro-twin | Stores proposal |
| `simulation.run` | Simulate the latest version | Stores evidence/status |
| `routine.repair` | Apply objective repairs and re-simulate | Creates a new version |
| `routine.revise` | Apply an explicit user exception | Creates a new version |
| `routine.request_activation` | Verify and create bounded approval | Stores approval |
| `routine.activate` | Confirm and activate exact version | Starts demo runtime |
| `routine.get_status` | Read proposal/runtime state | None |
| `routine.inject_event` | Adapt active plan to disruption | Changes runtime state |
| `routine.rollback` | Stop and restore snapshot | Ends runtime |
| `audit.get_trace` | Read lifecycle evidence | None |

## 9. Data model

The active Rehearse tables are:

- `RehearseProposal`: goal, version, state, routine, micro-twin, and context.
- `RehearseSimulation`: proposal version, violations, trace, and summary.
- `Approval`: action type, canonical payload hash, status, expiry, and consumption.
- `RehearseActivation`: exact proposal version, snapshot, runtime state, idempotency key, and rollback state.
- `RehearseAuditEvent`: user-scoped event type and structured evidence.

Every row is associated with a user. Repository methods query by both authenticated user and object ID to prevent cross-user access.

## 10. Safety and trust model

- Simulation precedes activation.
- Constraint evaluators are deterministic and inspectable.
- The system separates objective repair from subjective decisions.
- Approval expires and is single-use.
- Approval is bound to proposal ID and version by SHA-256 over canonical JSON.
- Activation and rollback require explicit confirmation.
- An activation stores a pre-action snapshot.
- Runtime changes are re-simulated.
- Audit logs avoid storing bearer tokens.
- Browser tokens are short-lived and demo-only.
- Production mode removes `/demo/session`, requires configured secrets, validates host/origin, and can use Prisma.

## 11. Competition fit

The entry takes the allowed real-MCP path: a self-hosted server implementing MCP `2025-11-25` over Streamable HTTP. The competition FAQ explicitly permits a contestant-built webpage that sends MCP initialize/list/call messages because Alexa+ tooling is not publicly available. The experience therefore demonstrates a plausible Alexa+ agent workflow without pretending to use unavailable Alexa APIs.

The idea addresses the judging criteria:

- Technical implementation: real protocol, compiler, deterministic engine, lifecycle state, OAuth, approvals, persistence adapters, and tests.
- Design: a clear conversational goal, visual rehearsal, explanations, approval, and rollback.
- Potential impact: households can safely automate multi-person, multi-device routines rather than writing fragile one-trigger automations.
- Idea quality: “test household autonomy before execution” is more differentiated than a generic assistant, Q&A bot, reminder wrapper, or single-purpose repair guide.

## 12. Build and run

```powershell
cd C:\Users\shrin\OneDrive\Desktop\alexa_plus
npm install
npm --prefix apps/mcp-server install
npm run prisma:generate
npm test
npm run check
npm run prisma:validate
npm start --prefix apps/mcp-server
```

Open `http://localhost:3000` and click **Run the guided rehearsal**.

Use Node.js 22.9+. The server and Prisma command wrapper load `apps/mcp-server/.env`. Your configured Neon database is already migrated and selects Prisma automatically; specify `REPOSITORY_MODE=memory` only for an offline fallback. See [progress.md](progress.md) for verified results and review corrections.

## 13. What remains for the owner

These tasks require your accounts, final choices, or real-world evidence:

1. Run the demo locally and decide whether wording/visual pacing matches your speaking style.
2. Choose a GitHub access route: public with a detectable open-source license, or private with required reviewer access. Review secrets and commit history before pushing. No push has been performed.
3. Record a public YouTube/Vimeo demo under three minutes using `docs/demo-script.md`.
4. Create the Devpost submission, complete team/profile fields, provide accessible repository and public video URLs, and write product feedback from your genuine experience.
5. Decide whether to deploy. The FAQ permits local code plus video, so deployment is optional. If deploying, complete every step in `integration.md`.
6. No additional Neon setup is needed now: the existing database was additively migrated and passed the full live integration test. Use an isolated branch for future migration experiments.
7. If deploying, configure a stable `JWT_SECRET`, final `PUBLIC_URL`, origins, and OAuth clients in the secret manager; a strict production browser login still needs implementation.
8. Keep any optional friction log authentic and dated; it can earn bonus consideration but must reflect actual work.

## 14. Definition of submission-ready

Submission readiness requires reproducible setup, a functioning video, honest claims, no committed secrets, licensed public source or authorized private reviewer access, and a completed Devpost entry before the deadline. Passing local tests alone is not the final submission. Follow [the complete owner checklist](docs/submission-checklist.md).
