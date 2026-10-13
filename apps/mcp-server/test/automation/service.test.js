import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MemoryAutomationStore } from "../../src/automation/store.js";
import { AutomationService } from "../../src/automation/service.js";
import { AutomationIdentity } from "../../src/automation/identity.js";
import { createTokenService } from "../../src/auth/tokenService.js";

const snapshot = JSON.parse(readFileSync(new URL("../../../../automation/fixtures/override-debug.json", import.meta.url)));
const source = readFileSync(new URL("../../../../automation/fixtures/override-debug.yaml", import.meta.url), "utf8");
const input = { name: "Override debugging", source, ...snapshot, confirmed: true };
const decision = operation => ({ operation, scenarioId: "manual_override", traceId: 0, question: "", draftYaml: "", scenarioJson: "" });
async function fixture(provider) {
  const store = new MemoryAutomationStore(), service = new AutomationService({ store, provider });
  const result = await service.import("alice", input);
  return { store, service, projectId: result.workspace.id };
}

test("owner isolation and revision checks protect stored analysis and versions", async () => {
  const { store, service, projectId } = await fixture();
  await assert.rejects(service.get("bob", { projectId }), { code: "PROJECT_NOT_FOUND" });
  assert.equal((await service.list("bob")).projects.length, 0);
  const row = await store.get("alice", projectId);
  await store.save("alice", projectId, row.revision, row.document);
  await assert.rejects(store.save("alice", projectId, row.revision, row.document), { code: "STALE_REVISION" });
  await assert.rejects(service.import("alice", { ...input, projectId, expectedVersion: 20 }), { code: "STALE_VERSION" });
});
test("export requires explicit review, current source and one-use approval", async () => {
  const { service, projectId } = await fixture();
  const analysis = await service.preflight("alice", { projectId });
  const candidate = analysis.analysis.candidates.find(c => c.eligible);
  const review = await service.review("alice", { projectId, candidateId: candidate.id, expectedVersion: 1 });
  const request = { projectId, approvalId: review.approvalId, expectedVersion: 1, confirmed: true };
  await assert.rejects(service.export("alice", { ...request, confirmed: false }), { code: "CONFIRMATION_REQUIRED" });
  await assert.rejects(service.export("bob", request), { code: "PROJECT_NOT_FOUND" });
  const output = await service.export("alice", request);
  assert.match(output.content, /condition: state/); assert.equal(output.installed, false);
  await assert.rejects(service.export("alice", request), { code: "APPROVAL_INVALID" });
  const again = await service.review("alice", { projectId, candidateId: candidate.id, expectedVersion: 1 });
  await service.import("alice", { ...input, projectId, expectedVersion: 1 });
  await assert.rejects(service.export("alice", { ...request, approvalId: again.approvalId }), { code: "APPROVAL_INVALID" });
});
test("concurrent export consumers cannot both use an approval", async () => {
  const { service, projectId } = await fixture();
  const a = await service.preflight("alice", { projectId });
  const review = await service.review("alice", { projectId, candidateId: a.analysis.candidates.find(c => c.eligible).id, expectedVersion: 1 });
  const input = { projectId, approvalId: review.approvalId, expectedVersion: 1, confirmed: true };
  const results = await Promise.allSettled([service.export("alice", input), service.export("alice", input)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});
test("one model-routed request runs the complete deterministic workflow and saves conversation", async () => {
  let calls = 0;
  const provider = { model: "mock", async generate({ input }) { calls++; assert.ok(input.availableOperations.includes("repair")); return decision("repair"); } };
  const { store, service, projectId } = await fixture(provider);
  const response = await service.respond("alice", { projectId, message: "Find what breaks during override and check a fix" });
  assert.equal(calls, 1); assert.equal(response.findingsSource, "deterministic_engine");
  assert.equal(response.result.analysis.baseline.passed, false);
  assert.ok(response.result.analysis.candidates.some(c => c.eligible));
  const resumed = new AutomationService({ store, provider });
  assert.equal((await resumed.get("alice", { projectId })).conversation.length, 2);
  assert.equal((await resumed.get("alice", { projectId })).runs.length, 3);
});
test("models cannot select approval/export, fabricate an entity, or overwrite newer source", async () => {
  const denied = await fixture({ async generate() { return decision("export"); } });
  await assert.rejects(denied.service.respond("alice", { projectId: denied.projectId, message: "Approve anything" }));
  const invalid = await fixture({ async generate() { return { ...decision("what_if"), scenarioJson: JSON.stringify({ id: "bad", events: [{ kind: "state", entityId: "input_boolean.missing", state: "on", at: 0 }], until: 10 }) }; } });
  await assert.rejects(invalid.service.respond("alice", { projectId: invalid.projectId, message: "Test" }), { code: "INVALID_MODEL_SCENARIO" });
  const delayed = await fixture();
  delayed.service.provider = { async generate() { await delayed.service.import("alice", { ...input, projectId: delayed.projectId, expectedVersion: 1 }); return decision("preflight"); } };
  await assert.rejects(delayed.service.respond("alice", { projectId: delayed.projectId, message: "Test" }), { code: "STALE_REVISION" });
});
test("draft validation and missing provider leave deterministic operations available", async () => {
  const { service, projectId } = await fixture();
  await assert.rejects(service.respond("alice", { projectId, message: "Test" }), { code: "LLM_NOT_CONFIGURED" });
  service.provider = { async generate() { return { ...decision("draft"), draftYaml: "id: unsafe\nmode: parallel" }; } };
  const result = await service.respond("alice", { projectId, message: "Draft" });
  assert.equal(result.result.validation, "UNSUPPORTED"); assert.equal((await service.get("alice", { projectId })).version, 1);
});
test("returning login preserves identity and stores only salted password hashes", async () => {
  const store = new MemoryAutomationStore();
  const tokens = createTokenService({ publicUrl: "http://localhost:3000", jwtSecret: "a".repeat(64) });
  const credentials = { username: "returning_user", password: "a-private-password-123" };
  const registered = await new AutomationIdentity({ store, tokenService: tokens }).session(credentials, true);
  const loggedIn = await new AutomationIdentity({ store, tokenService: tokens }).session(credentials);
  assert.equal(tokens.verify(registered.accessToken).userId, tokens.verify(loggedIn.accessToken).userId);
  const account = await store.account(credentials.username);
  assert.ok(account.passwordHash); assert.ok(!JSON.stringify(account).includes(credentials.password));
  await assert.rejects(new AutomationIdentity({ store, tokenService: tokens }).session({ ...credentials, password: "a-wrong-password-123" }), { code: "INVALID_LOGIN" });
});
