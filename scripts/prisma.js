import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, "apps/mcp-server/.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const cli = path.join(root, "node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2), "--schema", "prisma/schema.prisma"], { cwd: root, stdio: "inherit", env: process.env });
process.exitCode = result.status ?? 1;
