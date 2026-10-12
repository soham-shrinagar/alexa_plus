import test from "node:test";
import assert from "node:assert/strict";
import { buildJourney, journeyInputSchema } from "../src/domain/journey.js";
import { builtInHousehold } from "../src/domain/household.js";
import { rehearse, stressSchema } from "../src/domain/rehearsalEngine.js";
import { RehearsalService } from "../src/services/rehearsalService.js";
import { RehearseService } from "../src/services/rehearseService.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { buildMicroTwin } from "../src/domain/microTwinBuilder.js";

const point = { label: "Public point", latitude: 1, longitude: 2 };
test("typed empty scenario preserves baseline timing, verification and evidence", () => {
  const base = routine();
  const original = JSON.stringify(base);
  const result = rehearse(base, base.context, { events: [] });
  assert.deepEqual(result.unchanged, result.baseline);
  assert.equal(
    result.options[0].routine.journey.readyTime,
    base.journey.readyTime,
  );
  assert.equal(result.appliedEvents.length, 0);
  assert.equal(JSON.stringify(base), original);
});
test("combined delay, rain and task allowance propagate sequential preparation and verify every option", () => {
  const base = routine();
  const original = JSON.stringify(base);
  const events = [
    { type: "TRAVEL_DELAY", minutes: 15 },
    { type: "RAIN", raining: true },
    { type: "TASK_ALLOWANCE", stepId: "prepare-1", minutes: 10 },
  ];
  const result = rehearse(base, base.context, { events });
  assert.equal(result.unchanged.status, "FAILED");
  assert.ok(
    result.unchanged.violations.some(
      (issue) => issue.code === "RESOURCE_OVERLAP",
    ),
  );
  assert.equal(result.options[0].routine.journey.readyTime, "08:15");
  assert.equal(result.options[0].routine.steps[0].durationMinutes, 30);
  assert.equal(result.options[1].routine.journey.arrivalTime, "10:35");
  assert.equal(result.options[1].routine.journey.readyTime, "08:50");
  assert.ok(
    result.options.every((option) => option.verification.status === "PASSED"),
  );
  assert.deepEqual(
    result.options[0].routine.context.evidence,
    base.context.evidence,
  );
  assert.equal(result.options[0].routine.context.weather.raining, false);
  assert.ok(result.appliedEvents.every((event) => event.hypothetical));
  assert.equal(JSON.stringify(base), original);
  const now = Date.now();
  assert.deepEqual(
    rehearse(base, base.context, { events }, now),
    rehearse(base, base.context, { events: [...events].reverse() }, now),
  );
});
test("multiple required capability failures block every choice without fabricated substitutes", () => {
  const base = routine();
  const result = rehearse(base, base.context, {
    events: [
      { type: "CAPABILITY_UNAVAILABLE", capability: "manual_task" },
      { type: "CAPABILITY_UNAVAILABLE", capability: "depart" },
    ],
  });
  assert.ok(result.options.every((option) => !option.feasible));
  assert.equal(result.metrics.scenarioArrival, null);
  assert.equal(result.metrics.arrivalMarginMinutes, null);
  assert.ok(
    result.unchanged.violations.filter(
      (issue) => issue.code === "CAPABILITY_UNAVAILABLE",
    ).length >= 2,
  );
});
test("unsupported, conflicting, excessive and non-hypothetical typed events fail safely", () => {
  const base = routine();
  for (const scenario of [
    { events: [{ type: "POLICY_OVERRIDE" }] },
    { events: [{ type: "RAIN", raining: true, hypothetical: false }] },
    { events: [{ type: "RAIN", raining: true, window: { start: "07:00" } }] },
    { events: Array(7).fill({ type: "RAIN", raining: true }) },
  ])
    assert.equal(stressSchema.safeParse(scenario).success, false);
  assert.throws(
    () =>
      rehearse(base, base.context, {
        events: [
          { type: "TRAVEL_DELAY", minutes: 5 },
          { type: "TRAVEL_DELAY", minutes: 10 },
        ],
      }),
    { code: "DUPLICATE_SCENARIO_EVENT" },
  );
  for (const stepId of ["missing", "depart"])
    assert.throws(
      () =>
        rehearse(base, base.context, {
          events: [{ type: "TASK_ALLOWANCE", stepId, minutes: 5 }],
        }),
      { code: "UNSUPPORTED_TASK_ALLOWANCE" },
    );
  assert.throws(
    () =>
      rehearse(base, base.context, {
        events: [
          { type: "CAPABILITY_UNAVAILABLE", capability: "invented-device" },
        ],
      }),
    { code: "UNKNOWN_RUNTIME_CAPABILITY" },
  );
});
test("combined allowance adoption remains inert and binds the source version", async () => {
  const s = await setup();
  const scenario = {
    events: [
      { type: "TRAVEL_DELAY", minutes: 5 },
      { type: "TASK_ALLOWANCE", stepId: "prepare-2", minutes: 10 },
    ],
  };
  const result = await s.rehearsal.adopt("owner", {
    proposalId: s.proposal.id,
    expectedVersion: 1,
    scenario,
    choice: "EARLIER_PREPARATION",
    confirmed: true,
  });
  assert.equal(result.proposal.routine.steps[1].durationMinutes, 20);
  assert.equal(result.proposal.routine.lineage.scenario.events.length, 2);
  assert.equal(s.repository.activations.length, 0);
  assert.equal(
    (await s.repository.getProposal("owner", s.proposal.id)).routine.steps[1]
      .durationMinutes,
    10,
  );
});
function routine(changes = {}) {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const input = journeyInputSchema.parse({
    goal: "Arrive by 10:00; pack for ten minutes",
    origin: point,
    destination: point,
    date,
    arrivalTime: "10:00",
    timezone: "UTC",
    tasks: [{ label: "Pack", durationMinutes: 10 }],
    ...changes,
  });
  const route = {
    provider: "TomTom",
    travelMinutes: 30,
    delayMinutes: 5,
    retrievedAt: new Date().toISOString(),
  };
  const weather = {
    provider: "Open-Meteo",
    raining: false,
    timezone: "UTC",
    validFor: `${date}T09:00`,
    retrievedAt: new Date().toISOString(),
  };
  return buildJourney(input, builtInHousehold("personal-day"), route, weather);
}
async function setup(changes = {}) {
  const repository = new MemoryRepository();
  const service = new RehearseService({ repository });
  const rehearsal = new RehearsalService(service);
  const plan = routine(changes);
  const proposal = await repository.createProposal("owner", {
    scenarioId: "personal-day",
    goal: plan.goal,
    routine: plan,
    context: plan.context,
    microTwin: buildMicroTwin({ household: plan.householdProfile }, plan),
    status: "VERIFIED",
  });
  return { repository, service, rehearsal, proposal };
}
test("counterfactual yields concrete earlier-start and later-arrival choices while preserving source", () => {
  const base = routine();
  const snapshot = JSON.stringify(base);
  const result = rehearse(base, base.context, { extraTravelMinutes: 15 });
  assert.equal(result.unchanged.status, "FAILED");
  assert.equal(result.metrics.minutesPastArrival, 5);
  assert.equal(result.metrics.readinessGapMinutes, 15);
  const early = result.options.find(
    (item) => item.id === "EARLIER_PREPARATION",
  );
  const late = result.options.find((item) => item.id === "LATER_ARRIVAL");
  assert.equal(early.feasible, true);
  assert.equal(early.routine.journey.readyTime, "08:35");
  assert.equal(early.routine.journey.arrivalTime, "10:00");
  assert.equal(late.feasible, true);
  assert.equal(late.routine.journey.readyTime, "08:50");
  assert.equal(late.routine.journey.arrivalTime, "10:15");
  assert.equal(JSON.stringify(base), snapshot);
  assert.equal(early.routine.steps[0].durationMinutes, 20);
});
test("earliest-start policies block a tempting repair; a later deadline remains an explicit choice", () => {
  const base = routine({ earliestStartTime: "08:45" });
  const result = rehearse(base, base.context, { extraTravelMinutes: 15 });
  assert.equal(result.options[0].feasible, false);
  assert.ok(
    result.options[0].blockers.some((item) => item.code === "EARLY_START"),
  );
  assert.equal(result.options[1].feasible, true);
});
test("rain and traffic allowances combine without modifying provider evidence; lost required capabilities stay blocked", () => {
  const base = routine();
  const result = rehearse(base, base.context, {
    extraTravelMinutes: 15,
    raining: true,
  });
  assert.equal(result.options[0].routine.journey.input.extraDelayMinutes, 25);
  assert.equal(result.options[0].routine.context.evidence[1].raining, false);
  const blocked = rehearse(base, base.context, {
    extraTravelMinutes: 0,
    unavailableCapability: "manual_task",
  });
  assert.ok(blocked.options.every((item) => !item.feasible));
});
test("acceptance creates an owned inert alternative, preserves original, and rejects stale/blocked choices", async () => {
  const s = await setup({ earliestStartTime: "08:45" });
  const input = {
    proposalId: s.proposal.id,
    expectedVersion: 1,
    scenario: { extraTravelMinutes: 15 },
    choice: "LATER_ARRIVAL",
    confirmed: true,
  };
  await assert.rejects(
    () => s.rehearsal.adopt("owner", { ...input, confirmed: false }),
    { code: "CONFIRMATION_REQUIRED" },
  );
  await assert.rejects(
    () =>
      s.rehearsal.adopt("owner", { ...input, choice: "EARLIER_PREPARATION" }),
    { code: "ALTERNATIVE_BLOCKED" },
  );
  await assert.rejects(() => s.rehearsal.adopt("stranger", input));
  const accepted = await s.rehearsal.adopt("owner", input);
  assert.equal(accepted.proposal.status, "VERIFIED");
  assert.equal(s.repository.activations.length, 0);
  assert.equal(
    (await s.service.status("owner", accepted.proposal.id)).simulation.status,
    "PASSED",
  );
  assert.equal((await s.service.listPlans("owner")).plans.length, 2);
  assert.equal((await s.service.listPlans("stranger")).plans.length, 0);
  assert.equal(
    (await s.repository.getProposal("owner", s.proposal.id)).routine.journey
      .arrivalTime,
    "10:00",
  );
  await s.repository.updateProposal("owner", s.proposal.id, { version: 2 });
  await assert.rejects(() => s.rehearsal.adopt("owner", input), {
    code: "STALE_PROPOSAL",
  });
});
async function activate(s, proposal) {
  const approval = await s.service.requestActivation("owner", proposal.id);
  return (
    await s.service.activate("owner", {
      proposalId: proposal.id,
      approvalId: approval.approval.id,
      confirmed: true,
      idempotencyKey: `activation-${proposal.id}`,
    })
  ).activation;
}
test("recovery requires a new approval and replaces the paused runtime atomically", async () => {
  const s = await setup();
  const original = await activate(s, s.proposal);
  await s.service.injectEvent("owner", original.id, {
    type: "TRAVEL_DELAY",
    minutes: 15,
  });
  const compared = await s.rehearsal.compare("owner", {
    proposalId: s.proposal.id,
    useRuntime: true,
    scenario: { extraTravelMinutes: 0 },
  });
  const recovery = await s.rehearsal.adopt("owner", {
    proposalId: s.proposal.id,
    expectedVersion: 1,
    useRuntime: true,
    sourceRuntimeHash: compared.sourceRuntimeHash,
    scenario: { extraTravelMinutes: 0 },
    choice: "EARLIER_PREPARATION",
    confirmed: true,
  });
  assert.equal(
    (await s.repository.getActivation("owner", original.id)).status,
    "SUSPENDED",
  );
  const replacement = await activate(s, recovery.proposal);
  assert.equal(replacement.status, "ACTIVE");
  assert.equal(
    (await s.repository.getActivation("owner", original.id)).status,
    "ROLLED_BACK",
  );
  assert.equal(
    s.repository.activations.filter((item) => item.status === "ACTIVE").length,
    1,
  );
});
test("runtime changes invalidate recovery adoption and previously requested recovery approval", async () => {
  const s = await setup();
  const original = await activate(s, s.proposal);
  await s.service.injectEvent("owner", original.id, {
    type: "TRAVEL_DELAY",
    minutes: 15,
  });
  const input = {
    proposalId: s.proposal.id,
    useRuntime: true,
    scenario: { extraTravelMinutes: 0 },
  };
  const compared = await s.rehearsal.compare("owner", input);
  const adoption = {
    ...input,
    expectedVersion: 1,
    sourceRuntimeHash: compared.sourceRuntimeHash,
    choice: "EARLIER_PREPARATION",
    confirmed: true,
  };
  const recovery = await s.rehearsal.adopt("owner", adoption);
  const approval = await s.service.requestActivation(
    "owner",
    recovery.proposal.id,
  );
  await s.service.injectEvent("owner", original.id, {
    type: "TRAVEL_DELAY",
    minutes: 20,
  });
  await assert.rejects(() => s.rehearsal.adopt("owner", adoption), {
    code: "STALE_RUNTIME",
  });
  await assert.rejects(
    () =>
      s.service.activate("owner", {
        proposalId: recovery.proposal.id,
        approvalId: approval.approval.id,
        confirmed: true,
        idempotencyKey: "stale-recovery",
      }),
    { code: "STALE_RUNTIME" },
  );
  assert.equal(
    (await s.repository.getActivation("owner", original.id)).status,
    "SUSPENDED",
  );
});
test("failed replacement persistence restores old runtime and unconsumed approval", async () => {
  const s = await setup();
  const original = await activate(s, s.proposal);
  await s.service.injectEvent("owner", original.id, {
    type: "TRAVEL_DELAY",
    minutes: 15,
  });
  const input = {
    proposalId: s.proposal.id,
    useRuntime: true,
    scenario: { extraTravelMinutes: 0 },
  };
  const compared = await s.rehearsal.compare("owner", input);
  const recovery = await s.rehearsal.adopt("owner", {
    ...input,
    expectedVersion: 1,
    sourceRuntimeHash: compared.sourceRuntimeHash,
    choice: "EARLIER_PREPARATION",
    confirmed: true,
  });
  const approval = await s.service.requestActivation(
    "owner",
    recovery.proposal.id,
  );
  s.repository.createActivation = async () => {
    throw new Error("write failed");
  };
  await assert.rejects(() =>
    s.service.activate("owner", {
      proposalId: recovery.proposal.id,
      approvalId: approval.approval.id,
      confirmed: true,
      idempotencyKey: "failed-replacement",
    }),
  );
  assert.equal(
    (await s.repository.getActivation("owner", original.id)).status,
    "SUSPENDED",
  );
  assert.equal(
    (await s.repository.getApproval("owner", approval.approval.id)).status,
    "PENDING",
  );
});
test("concurrent recovery proposals can be reviewed but only one replaces a source runtime", async () => {
  const s = await setup();
  const original = await activate(s, s.proposal);
  await s.service.injectEvent("owner", original.id, {
    type: "TRAVEL_DELAY",
    minutes: 15,
  });
  const input = {
    proposalId: s.proposal.id,
    useRuntime: true,
    scenario: { events: [] },
  };
  const comparison = await s.rehearsal.compare("owner", input);
  const adoption = {
    ...input,
    expectedVersion: 1,
    sourceRuntimeHash: comparison.sourceRuntimeHash,
    choice: "EARLIER_PREPARATION",
    confirmed: true,
  };
  const recoveries = await Promise.all([
    s.rehearsal.adopt("owner", adoption),
    s.rehearsal.adopt("owner", adoption),
  ]);
  const approvals = await Promise.all(
    recoveries.map((row) =>
      s.service.requestActivation("owner", row.proposal.id),
    ),
  );
  const results = await Promise.allSettled(
    recoveries.map((row, index) =>
      s.service.activate("owner", {
        proposalId: row.proposal.id,
        approvalId: approvals[index].approval.id,
        confirmed: true,
        idempotencyKey: `recovery-race-${index}`,
      }),
    ),
  );
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(
    results.find((row) => row.status === "rejected").reason.code,
    "STALE_RUNTIME",
  );
  assert.equal(
    s.repository.activations.filter((row) => row.status === "ACTIVE").length,
    1,
  );
});
