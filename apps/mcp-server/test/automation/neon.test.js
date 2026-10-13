import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaAutomationStore } from "../../src/automation/store.js";
import { AutomationService } from "../../src/automation/service.js";
import { AutomationIdentity } from "../../src/automation/identity.js";
import { createTokenService } from "../../src/auth/tokenService.js";

test("Neon restores account identity, source, runs and single-use approval across service instances", { skip: process.env.AUTOMATION_NEON_TEST !== "1" || !process.env.DATABASE_URL }, async () => {
  const client = new PrismaClient({ log: [] }), store = new PrismaAutomationStore(client);
  const username = `test_${randomUUID().replaceAll("-", "")}`;
  const password = randomUUID() + randomUUID();
  const tokens = createTokenService({ jwtSecret: randomUUID() + randomUUID(), publicUrl: "http://localhost:3000" });
  let accountId, owner, projectId;
  try {
    const registered = await new AutomationIdentity({ store, tokenService: tokens }).session({ username, password }, true);
    owner = tokens.verify(registered.accessToken).userId;
    accountId = (await store.account(username)).id;
    const source = readFileSync(new URL("../../../../automation/fixtures/override-debug.yaml", import.meta.url), "utf8");
    const snapshot = JSON.parse(readFileSync(new URL("../../../../automation/fixtures/override-debug.json", import.meta.url)));
    const first = new AutomationService({ store });
    projectId = (await first.import(owner, { name: "Isolated Neon test", source, ...snapshot, confirmed: true })).workspace.id;
    const result = await first.preflight(owner, { projectId });
    const review = await first.review(owner, { projectId, candidateId: result.analysis.candidates.find(c => c.eligible).id, expectedVersion: 1 });
    const second = new AutomationService({ store: new PrismaAutomationStore(client) });
    const loggedIn = await new AutomationIdentity({ store: new PrismaAutomationStore(client), tokenService: tokens }).session({ username, password });
    assert.equal(tokens.verify(loggedIn.accessToken).userId, owner);
    assert.equal((await second.get(owner, { projectId })).runs.length, 3);
    await assert.rejects(second.get("different-owner", { projectId }), { code: "PROJECT_NOT_FOUND" });
    const request = { projectId, approvalId: review.approvalId, expectedVersion: 1, confirmed: true };
    const consumed = await Promise.allSettled([first.export(owner, request), second.export(owner, request)]);
    assert.equal(consumed.filter(r => r.status === "fulfilled").length, 1);
  } finally {
    if (projectId && owner) await client.automationWorkspace.deleteMany({ where: { id: projectId, ownerId: owner } });
    if (accountId) await client.automationAccount.deleteMany({ where: { id: accountId, username } });
    await client.$disconnect();
  }
});
