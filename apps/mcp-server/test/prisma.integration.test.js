import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../src/repositories/prismaRepository.js";
import { createApplication } from "../src/server.js";

const enabled = process.env.RUN_NEON_INTEGRATION === "true";
const goal = "Make school mornings run themselves. Leave by 7:45, keep quiet before 7, and leave 15 minutes earlier when it rains.";

test("Neon supports the complete MCP lifecycle, concurrent activation, ownership, and reconnect persistence", { skip: !enabled, timeout: 180_000 }, async () => {
  const prisma = new PrismaClient({ log: [] });
  const users = [0, 1].map(() => `test-rehearse-${crypto.randomUUID()}`);
  let instance; let listener;
  try {
    instance = await createApplication({ repository: new PrismaRepository(prisma), config: { repositoryMode: "prisma", publicUrl: "http://127.0.0.1:0", demoMode: true, authRequired: true, requestLimit: 1000 } });
    listener = await new Promise((resolve) => { const server = instance.app.listen(0, "127.0.0.1", () => resolve(server)); });
    const base = `http://127.0.0.1:${listener.address().port}`;
    const first = await connect(instance, base, users[0]);
    const second = await connect(instance, base, users[1]);
    const profiles = await first.call("household.list_profiles", {});
    const custom = { ...profiles.profiles.find(profile => profile.id === "work-morning"), id: "neon-custom-home", name: "Synthetic Neon household" };
    await first.call("household.configure", { profile: custom, confirmed: true });
    assert.ok((await first.call("household.list_profiles", {})).profiles.some(profile => profile.id === custom.id));
    assert.ok(!(await second.call("household.list_profiles", {})).profiles.some(profile => profile.id === custom.id));
    const { proposal } = await first.call("routine.compile", { goal });
    assert.match(proposal.id, /^c/); // Regression: these CUIDs must pass MCP input validation.
    assert.equal((await first.call("simulation.run", { proposalId: proposal.id })).simulation.status, "FAILED");
    await assert.rejects(() => second.call("simulation.run", { proposalId: proposal.id }), (error) => error.code === "FORBIDDEN");
    assert.equal((await first.call("routine.repair", { proposalId: proposal.id })).status, "NEEDS_INPUT");
    assert.equal((await first.call("routine.revise", { proposalId: proposal.id, instruction: "On Fridays, Maya can wake at 6:50" })).simulation.status, "PASSED");
    const { approval } = await first.call("routine.request_activation", { proposalId: proposal.id });
    const input = { proposalId: proposal.id, approvalId: approval.id, confirmed: true, idempotencyKey: `neon-${crypto.randomUUID()}` };
    const [activated, retry] = await Promise.all([first.call("routine.activate", input), first.call("routine.activate", input)]);
    assert.equal(activated.activation.id, retry.activation.id);
    const activationId = activated.activation.id;
    assert.equal((await first.call("routine.inject_event", { activationId, event: { type: "DEVICE_UNAVAILABLE", capability: "make_coffee" } })).simulation.status, "PASSED");
    const delayed = await first.call("routine.inject_event", { activationId, event: { type: "TRAVEL_DELAY", minutes: 5 } });
    assert.equal(delayed.simulation.status, "PASSED");
    assert.equal(delayed.activation.runtimeState.routine.steps.find((step) => step.departure).startTime, "07:25");
    const repeated = await first.call("routine.inject_event", { activationId, event: { type: "TRAVEL_DELAY", minutes: 5 } });
    assert.equal(repeated.activation.runtimeState.routine.steps.find((step) => step.departure).startTime, "07:25");
    const unsafe = await first.call("routine.inject_event", { activationId, event: { type: "DEVICE_UNAVAILABLE", capability: "heat_water" } });
    assert.equal(unsafe.activation.status, "SUSPENDED");
    const rolledBack = await first.call("routine.rollback", { activationId, confirmed: true });
    assert.equal(rolledBack.activation.status, "ROLLED_BACK");
    assert.deepEqual(rolledBack.activation.runtimeState.deviceStates, activated.activation.snapshot.deviceStates);
    const trace = await first.call("audit.get_trace", { proposalId: proposal.id });
    assert.equal(trace.events.filter((event) => event.type === "ROUTINE_ACTIVATED").length, 1);
    assert.equal((await second.call("audit.get_trace", { proposalId: proposal.id })).events.length, 0);
    await prisma.$disconnect(); await prisma.$connect();
    const persisted = await new PrismaRepository(prisma).getProposal(users[0], proposal.id);
    assert.equal(persisted.status, "ROLLED_BACK");
    assert.equal((await new PrismaRepository(prisma).listHouseholds(users[0]))[0].id, custom.id);
    assert.equal(await prisma.rehearseActivation.count({ where: { proposalId: proposal.id } }), 1);
  } finally {
    if (listener) await new Promise((resolve) => listener.close(resolve));
    if (instance) await instance.close();
    // Only exact, randomly generated test identities are removed. Existing users are untouched.
    await prisma.user.deleteMany({ where: { externalUserId: { in: users } } });
    await prisma.$disconnect();
  }
});

async function connect(instance, base, userId) {
  const token = instance.tokenService.issue({ userId, scopes: ["mcp:tools"] });
  let session;
  const request = (body) => fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify(body) });
  const initialization = await request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "neon-integration", version: "1" } } });
  assert.equal(initialization.status, 200); session = initialization.headers.get("mcp-session-id");
  await request({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { async call(name, args) {
    const response = await request({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } });
    assert.equal(response.status, 200);
    const message = await response.json();
    if (message.error) throw new Error(message.error.message);
    const value = message.result.structuredContent ?? JSON.parse(message.result.content[0].text);
    if (message.result.isError) throw Object.assign(new Error(value.error.message), { code: value.error.code });
    return value;
  } };
}
