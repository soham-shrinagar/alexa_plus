import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaRepository } from "../src/repositories/prismaRepository.js";
import { RehearseService } from "../src/services/rehearseService.js";

const enabled = process.env.RUN_NEON_INTEGRATION === "true";
const prefix = `test-rehearse-${crypto.randomUUID()}`;
const goal = "Make school mornings run themselves. Leave by 7:45, keep quiet before 7, and leave 15 minutes earlier when it rains.";

test("Prisma persists and isolates the Rehearse lifecycle", { skip: !enabled, timeout: 60_000 }, async () => {
  const prisma = new PrismaClient({ log: [] });
  try {
    const service = new RehearseService({ repository: new PrismaRepository(prisma) });
    const compiled = await service.compile(`${prefix}-a`, { goal });
    assert.equal((await service.simulate(`${prefix}-a`, compiled.proposal.id)).simulation.status, "FAILED");
    await assert.rejects(() => service.simulate(`${prefix}-b`, compiled.proposal.id));
    await prisma.$disconnect(); await prisma.$connect();
    const afterRestart = new RehearseService({ repository: new PrismaRepository(prisma) });
    assert.equal((await afterRestart.status(`${prefix}-a`, compiled.proposal.id)).proposal.goal, goal);
    await prisma.user.deleteMany({ where: { externalUserId: { startsWith: prefix } } });
  } finally { await prisma.$disconnect(); }
});
