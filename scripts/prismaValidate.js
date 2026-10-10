import { spawnSync } from "node:child_process";
import path from "node:path";

const cli = path.resolve("node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [cli, "validate", "--schema", "prisma/schema.prisma"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://schema:validation@localhost:5432/rehearse" }
});

process.exitCode = result.status ?? 1;
