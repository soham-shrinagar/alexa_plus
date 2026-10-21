import { PrismaClient } from "@prisma/client";

let client;

export function prismaConnectionOptions(
  databaseUrl = process.env.DATABASE_URL,
) {
  // A sleeping Neon compute can exceed Prisma 6's five-second default.
  // Keep explicit operator timeouts and all other providers unchanged.
  if (!databaseUrl || !URL.canParse(databaseUrl)) return { log: [] };
  const url = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    url.searchParams.has("connect_timeout")
  )
    return { log: [] };
  url.searchParams.set("connect_timeout", "20");
  return { log: [], datasourceUrl: url.toString() };
}

export function getPrismaClient() {
  if (!client) client = new PrismaClient(prismaConnectionOptions());
  return client;
}

export async function disconnectPrismaClient() {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
