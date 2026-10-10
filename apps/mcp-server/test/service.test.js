import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import { RehearseService } from "../src/services/rehearseService.js";

const goal = "Make our school mornings run themselves. Leave by 7:45, don't wake the baby before 7, don't run the kettle and water heater together, and leave 15 minutes earlier when it rains.";

test("activation concurrency consumes one approval exactly once and active proposals are immutable", async () => {
  const { service, proposalId, approval } = await verifiedFixture();
  const input = { proposalId, approvalId: approval.id, confirmed: true, idempotencyKey: "concurrent-001" };
  const [first, second] = await Promise.all([service.activate("demo-user", input), service.activate("demo-user", input)]);
  assert.equal(first.activation.id, second.activation.id);
  assert.equal((await service.trace("demo-user", proposalId)).events.filter((event) => event.type === "ROUTINE_ACTIVATED").length, 1);
  await assert.rejects(() => service.revise("demo-user", proposalId, "Maya can wake at 6:40"), (error) => error.code === "PROPOSAL_LOCKED");
  await assert.rejects(() => service.simulate("demo-user", proposalId), (error) => error.code === "PROPOSAL_LOCKED");
  await assert.rejects(() => service.activate("demo-user", { ...input, idempotencyKey: "duplicate-other-key" }), (error) => error.code === "PROPOSAL_LOCKED");
});

test("stale approval cannot authorize a revised plan", async () => {
  const { service, proposalId, approval, repository } = await verifiedFixture();
  await service.revise("demo-user", proposalId, "Maya can wake at 6:45");
  await assert.rejects(() => service.activate("demo-user", { proposalId, approvalId: approval.id, confirmed: true, idempotencyKey: "stale-001" }), (error) => error.code === "FORBIDDEN");
  assert.equal((await repository.getApproval("demo-user", approval.id)).status, "PENDING");
  assert.equal((await repository.getProposal("demo-user", proposalId)).microTwin.constraints.find((constraint) => constraint.id === "maya-earliest").atMinute, 405);
});

test("failed activation persistence rolls back approval consumption and allows retry", async () => {
  const { service, proposalId, approval, repository } = await verifiedFixture();
  const create = repository.createActivation.bind(repository);
  repository.createActivation = async () => { throw new Error("injected write failure"); };
  const input = { proposalId, approvalId: approval.id, confirmed: true, idempotencyKey: "atomic-001" };
  await assert.rejects(() => service.activate("demo-user", input));
  assert.equal((await repository.getApproval("demo-user", approval.id)).status, "PENDING");
  repository.createActivation = create;
  assert.equal((await service.activate("demo-user", input)).activation.status, "ACTIVE");
});

test("unsafe runtime events suspend execution and remain rollbackable", async () => {
  const { service, proposalId, approval } = await verifiedFixture();
  const { activation } = await service.activate("demo-user", { proposalId, approvalId: approval.id, confirmed: true, idempotencyKey: "suspend-001" });
  const disrupted = await service.injectEvent("demo-user", activation.id, { type: "DEVICE_UNAVAILABLE", capability: "heat_water" });
  assert.equal(disrupted.simulation.status, "FAILED"); assert.equal(disrupted.activation.status, "SUSPENDED");
  const status = await service.status("demo-user", proposalId); assert.equal(status.proposal.status, "SUSPENDED"); assert.equal(status.activation.status, "SUSPENDED");
  assert.equal((await service.rollback("demo-user", activation.id, true)).activation.status, "ROLLED_BACK");
});

async function verifiedFixture() {
  const repository = new MemoryRepository(); const service = new RehearseService({ repository });
  const { proposal } = await service.compile("demo-user", { goal });
  await service.repair("demo-user", proposal.id); await service.revise("demo-user", proposal.id, "On Fridays, Maya can wake at 6:50");
  const { approval } = await service.requestActivation("demo-user", proposal.id);
  return { repository, service, proposalId: proposal.id, approval };
}

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
  assert.equal(rolledBack.activation.runtimeState.routine, null);
  assert.deepEqual(rolledBack.activation.runtimeState.deviceStates, activated.activation.snapshot.deviceStates);
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
