import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { RehearseService } from "../src/services/rehearseService.js";

const goal = "Make our school mornings run themselves. Leave by 7:45, don't wake the baby before 7, don't run the kettle and water heater together, and leave 15 minutes earlier when it rains.";

test("full proposal lifecycle is verified, approved, adapted, audited, and rolled back", async () => {
  const service = new RehearseService({ repository: new MemoryRepository() });
  const compiled = await service.compile("demo-user", { goal });
  const first = await service.simulate("demo-user", compiled.proposal.id); assert.equal(first.simulation.status, "FAILED");
  const repaired = await service.repair("demo-user", compiled.proposal.id); assert.equal(repaired.status, "NEEDS_INPUT");
  const revised = await service.revise("demo-user", compiled.proposal.id, "On Fridays, Maya can wake at 6:50"); assert.equal(revised.simulation.status, "PASSED");
  const requested = await service.requestActivation("demo-user", compiled.proposal.id);
  const activated = await service.activate("demo-user", { proposalId: compiled.proposal.id, approvalId: requested.approval.id, confirmed: true, idempotencyKey: "lifecycle-001" });
  const retry = await service.activate("demo-user", { proposalId: compiled.proposal.id, approvalId: requested.approval.id, confirmed: true, idempotencyKey: "lifecycle-001" }); assert.equal(retry.reused, true); assert.equal(retry.activation.id, activated.activation.id);
  const adapted = await service.injectEvent("demo-user", activated.activation.id, { type: "DEVICE_UNAVAILABLE", capability: "make_coffee" }); assert.equal(adapted.simulation.status, "PASSED");
  const rolledBack = await service.rollback("demo-user", activated.activation.id, true); assert.equal(rolledBack.activation.status, "ROLLED_BACK");
  const trace = await service.trace("demo-user", compiled.proposal.id); assert.deepEqual(trace.events.map((item) => item.type), ["PROPOSAL_COMPILED", "SIMULATION_COMPLETED", "PROPOSAL_REPAIRED", "PROPOSAL_REVISED", "ACTIVATION_REQUESTED", "ROUTINE_ACTIVATED", "RUNTIME_ADAPTED", "ROUTINE_ROLLED_BACK"]);
});

test("repository enforces user isolation", async () => {
  const service = new RehearseService({ repository: new MemoryRepository() });
  const compiled = await service.compile("first-user", { goal });
  await assert.rejects(() => service.simulate("second-user", compiled.proposal.id), (error) => error.code === "FORBIDDEN");
  assert.equal((await service.trace("second-user", compiled.proposal.id)).events.length, 0);
});

test("activation rejects unverified proposals and unconfirmed writes", async () => {
  const service = new RehearseService({ repository: new MemoryRepository() });
  const compiled = await service.compile("demo-user", { goal });
  await assert.rejects(() => service.requestActivation("demo-user", compiled.proposal.id), (error) => error.code === "VERIFICATION_REQUIRED");
  await service.repair("demo-user", compiled.proposal.id); await service.revise("demo-user", compiled.proposal.id, "Maya can wake at 6:50");
  const requested = await service.requestActivation("demo-user", compiled.proposal.id);
  await assert.rejects(() => service.activate("demo-user", { proposalId: compiled.proposal.id, approvalId: requested.approval.id, confirmed: false, idempotencyKey: "unconfirmed-001" }), (error) => error.code === "CONFIRMATION_REQUIRED");
});
