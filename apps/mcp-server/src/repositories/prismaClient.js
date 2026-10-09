import { PrismaClient } from "@prisma/client";

let client;

export function getPrismaClient() {
  if (!client) client = new PrismaClient({ log: [] });
  return client;
}

export async function disconnectPrismaClient() {
  if (client) { await client.$disconnect(); client = undefined; }
}
