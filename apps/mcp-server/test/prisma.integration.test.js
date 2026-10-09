import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../src/repositories/prismaRepository.js";

const enabled = process.env.RUN_NEON_INTEGRATION === "true";
const prefix = `test-lifeops-${crypto.randomUUID()}`;
const firstUser = `${prefix}-a`;
const secondUser = `${prefix}-b`;

test("Neon Prisma repository persists records, preserves isolation, and survives reconnect", { skip: !enabled, timeout: 60_000 }, async () => {
  const prisma = new PrismaClient({ log: [] });
  try {
    const repository = new PrismaRepository(prisma);
    const stored = await repository.updatePreference(firstUser, "travelMode", "car", "explicit");
    assert.equal(stored.value, "car");
    assert.equal(stored.source, "explicit");
    assert.equal((await repository.getPreferences(firstUser)).length, 1);
    assert.equal((await repository.getPreferences(secondUser)).length, 0);
    const notification = await repository.createNotification(firstUser, { message: "Integration-test reminder", scheduledTime: "2030-01-01T10:00:00.000Z", idempotencyKey: `${prefix}-notification` });
    const duplicate = await repository.createNotification(firstUser, { message: "Integration-test reminder", scheduledTime: "2030-01-01T10:00:00.000Z", idempotencyKey: `${prefix}-notification` });
    assert.equal(notification.id, duplicate.id);
    await assert.rejects(() => repository.getNotification(secondUser, notification.id));
    const workflow = await repository.createWorkflow(firstUser, { type: "INTEGRATION_TEST", idempotencyKey: `${prefix}-workflow` });
    const updated = await repository.updateWorkflow(firstUser, workflow.id, { status: "RUNNING", steps: { first: { status: "SUCCEEDED", value: { safe: true } } } });
    assert.equal(updated.steps.first.status, "SUCCEEDED");
    await prisma.$disconnect();
    await prisma.$connect();
    const afterRestart = new PrismaRepository(prisma);
    assert.equal((await afterRestart.getPreferences(firstUser))[0].value, "car");
    await prisma.user.deleteMany({ where: { externalUserId: { startsWith: prefix } } });
  } finally {
    await prisma.$disconnect();
  }
});
